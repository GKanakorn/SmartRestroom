#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_sleep.h"

/* ===== Pins ===== */
#define PIR1 27
#define PIR2 26
#define PIR3 25
#define LED1 18
#define LED2 17
#define LED3 16

#define RESET_BTN 34 // ปุ่มรีเซ็ตเคาน์เตอร์

const bool LED_ACTIVE_LOW = false;
const bool BUTTON_ACTIVE_HIGH = true;
const unsigned long DEBOUNCE_MS = 30;
int lastBtnRaw = 0;
bool lastBtnPressed = false;
unsigned long lastBtnChangeMs = 0;

unsigned long HOLD_ON_MS = 5UL * 1000UL; // 5 วินาที (ทดสอบ)
unsigned int  USES_THRESHOLD_PER_ROOM = 10;

/* ===== Deep Sleep Config (ทดสอบตั้งสั้น ๆ) ===== */
// ของจริงปรับเป็น 2–5 นาที เช่น 2UL*60UL*1000UL
static const unsigned long SLEEP_IDLE_MS = 20UL * 1000UL;

/* ===== OLED ===== */
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

/* ===== Room State ===== */
struct RoomState {
  bool lightOn = false;
  bool occupied = false;
  unsigned long lastMotionMs = 0;
  unsigned long sessionStartMs = 0;
  unsigned long uses = 0;
  bool needCleaning = false;
} room[3];

/* ===== Backend glue ===== */
#include "send_to_backend.h"
bool cleaningRequired = false;
unsigned long lastCleanTimestamp = 0;
Room rooms[3];
// นิยามตัวแปรสถานะการส่งไป backend (ต้องมีนิยามจริง 1 จุด)
bool backend_ok = false;

/* ===== Helper ===== */
inline void setLed(int pin, bool on) {
  if (LED_ACTIVE_LOW) digitalWrite(pin, on ? LOW : HIGH);
  else                digitalWrite(pin, on ? HIGH : LOW);
}
inline bool isLedOn(int pin) {
  int s = digitalRead(pin);
  return LED_ACTIVE_LOW ? (s == LOW) : (s == HIGH);
}

/* ===== OLED UI ===== */
void drawMainPage() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println(F("Smart Restroom"));
  for (int i = 0; i < 3; i++) {
    int y = 14 + i * 16;
    display.setCursor(0, y);
    display.print(F("R")); display.print(i + 1); display.print(F(": "));
    if (room[i].needCleaning) display.print(F("Clean"));
    else if (room[i].lightOn) display.print(F("Occupied"));
    else display.print(F("Vacant"));
    display.setCursor(90, y);
    display.print(F("U=")); display.print(room[i].uses);
  }
  display.display();
}

void showToast(const __FlashStringHelper* msg, uint16_t ms = 800) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(24, 26);
  display.println(msg);
  display.display();
  delay(ms);
}

/* ===== Mirror state to backend ===== */
void mirrorRoomToBackendStruct(int idx, int pirPin, int ledPin) {
  rooms[idx].pirPin = pirPin;
  rooms[idx].ledPin = ledPin;
  rooms[idx].occupied = room[idx].lightOn;
  rooms[idx].prevOccupied = rooms[idx].occupied;
  rooms[idx].lastMotionMS = room[idx].lastMotionMs;
  rooms[idx].sessionStartMS = room[idx].sessionStartMs;
}

void updateCleaningRequiredFlag() {
  cleaningRequired = false;
  for (int i=0;i<3;i++) if (room[i].needCleaning) { cleaningRequired = true; break; }
}

/* ===== Room logic ===== */
void updateRoom(int idx, int pirPin, int ledPin, unsigned long now) {
  int motion = digitalRead(pirPin);

  if (motion == HIGH) {
    if (!room[idx].lightOn) {
      room[idx].lightOn = true;
      room[idx].occupied = true;
      room[idx].sessionStartMs = now;
      setLed(ledPin, true);
      Serial.printf("[R%d] ON (motion)\n", idx+1);
      mirrorRoomToBackendStruct(idx, pirPin, ledPin);
      updateCleaningRequiredFlag();
      sendStatusImmediately();
    }
    room[idx].lastMotionMs = now;
  }

  if (room[idx].lightOn && (now - room[idx].lastMotionMs > HOLD_ON_MS)) {
    room[idx].lightOn = false;
    room[idx].occupied = false;
    setLed(ledPin, false);
    room[idx].uses++;
    unsigned long dur = now - room[idx].sessionStartMs;
    Serial.printf("[R%d] OFF (timeout) | dur=%.2f min | uses=%lu\n",
                  idx+1, dur/60000.0, room[idx].uses);
    if (!room[idx].needCleaning && room[idx].uses >= USES_THRESHOLD_PER_ROOM) {
      room[idx].needCleaning = true;
      Serial.printf("[R%d] -> Clean (threshold)\n", idx+1);
    }
    rooms[idx].useCount = room[idx].uses;
    rooms[idx].totalUseMS += dur;
    mirrorRoomToBackendStruct(idx, pirPin, ledPin);
    updateCleaningRequiredFlag();
    sendStatusImmediately();
  }
}

/* ===== Reset Button ===== */
bool readButtonPressed() {
  int raw = digitalRead(RESET_BTN);
  unsigned long now = millis();
  if (raw != lastBtnRaw && now - lastBtnChangeMs >= DEBOUNCE_MS) {
    lastBtnRaw = raw;
    lastBtnChangeMs = now;
  }
  return BUTTON_ACTIVE_HIGH ? (lastBtnRaw == HIGH) : (lastBtnRaw == LOW);
}

void doResetCounters() {
  for (int i = 0; i < 3; i++) {
    room[i].uses = 0;
    room[i].needCleaning = 0;
    rooms[i].useCount = 0;
    rooms[i].totalUseMS = 0;
  }
  lastCleanTimestamp = millis();
  updateCleaningRequiredFlag();
  Serial.println("[RESET] All counters cleared.");
  showToast(F("Counters Reset"), 800);
  sendStatusImmediately();
}

/* ===== Deep Sleep helpers ===== */
static inline uint64_t rtcMaskFor(uint8_t gpio) { return (1ULL << gpio); }

void maybeEnterDeepSleep(unsigned long now) {
  // ถ้าไฟห้องไหนยังติด → ยังไม่หลับ
  if (room[0].lightOn || room[1].lightOn || room[2].lightOn) return;

  // ดูเวลาตั้งแต่ motion ล่าสุดของทุกห้อง
  unsigned long lastAnyMotion = max(room[0].lastMotionMs, max(room[1].lastMotionMs, room[2].lastMotionMs));
  if (now - lastAnyMotion < SLEEP_IDLE_MS) return;

  // ปิดจอเพื่อลดกินไฟ
  display.clearDisplay();
  display.display();
  display.ssd1306_command(SSD1306_DISPLAYOFF);

  Serial.println("[SLEEP] Enter deep sleep (idle too long)");
  Serial.flush();

  // เปิดปลุกด้วย PIR + ปุ่ม (ANY HIGH)
  uint64_t mask = rtcMaskFor(PIR1) | rtcMaskFor(PIR2) | rtcMaskFor(PIR3) | rtcMaskFor(RESET_BTN);
  esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_HIGH);

  esp_deep_sleep_start();
}

/* ===== Setup ===== */
void setup() {
  Serial.begin(115200);
  delay(50);

  // รายงานเหตุผลการตื่น (ดีบัก)
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    Serial.println("[WAKE] From EXT1 (PIR/BTN)");
  } else if (cause == ESP_SLEEP_WAKEUP_UNDEFINED) {
    Serial.println("[BOOT] Power-on / reset");
  } else {
    Serial.printf("[WAKE] Other cause=%d\n", (int)cause);
  }

  pinMode(PIR1, INPUT);
  pinMode(PIR2, INPUT);
  pinMode(PIR3, INPUT);
  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);
  pinMode(RESET_BTN, INPUT);

  // จอ
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[ERR] SSD1306 not found");
  } else {
    // เปิดจอกลับ (กรณีตื่นจากหลับ)
    display.ssd1306_command(SSD1306_DISPLAYON);
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(30, 28);
    display.println(F("System Ready"));
    display.display();
    delay(800);
  }

  // map ขาพินให้ถูกต้อง (อย่าใช้ PIR1+i/LED1+i เพราะเลขขาไม่ต่อเนื่อง)
  mirrorRoomToBackendStruct(0, PIR1, LED1);
  mirrorRoomToBackendStruct(1, PIR2, LED2);
  mirrorRoomToBackendStruct(2, PIR3, LED3);
  for (int i=0;i<3;i++) {
    rooms[i].useCount = 0;
    rooms[i].totalUseMS = 0;
  }

  lastCleanTimestamp = 0;
  updateCleaningRequiredFlag();
  sendStatusImmediately();

  Serial.println("=== Smart Restroom (Backend + DeepSleep) ===");
}

/* ===== Loop ===== */
void loop() {
  unsigned long now = millis();
  updateRoom(0, PIR1, LED1, now);
  updateRoom(1, PIR2, LED2, now);
  updateRoom(2, PIR3, LED3, now);

  bool pressed = readButtonPressed();
  if (pressed && !lastBtnPressed) doResetCounters();
  lastBtnPressed = pressed;

  static unsigned long lastDraw=0;
  if (millis() - lastDraw > 250) { drawMainPage(); lastDraw = millis(); }

  static unsigned long lastBeat=0;
  if (millis() - lastBeat > 10000UL) {
    updateCleaningRequiredFlag();
    sendStatusImmediately();
    lastBeat = millis();
  }

  // ถ้าว่างนานพอ → เข้าหลับลึก
  maybeEnterDeepSleep(now);

  delay(5);
}