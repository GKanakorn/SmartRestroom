#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_sleep.h"
#include <Preferences.h>      // เก็บค่าสะสมลงแฟลช (NVS)
#include "esp_task_wdt.h"     // Watchdog

#include "send_to_backend.h"  // ส่งขึ้น backend (WiFi + HTTP JSON)
#include "send_to_line.h"     // แจ้งเตือนเข้า LINE OA

/* ===== Pins ===== */
#define PIR1 27
#define PIR2 26
#define PIR3 25
#define LED1 18
#define LED2 17
#define LED3 16
#define BUZZER_PIN 19
#define RESET_BTN 34   // GPIO34 ไม่มี internal pull-up/down -> ต้องมี pull-down ภายนอก

/* ---- Reed switches (door) ----
 * ใช้ GPIO 32, 33, 35 (input-only, ไม่มี internal pull-up/down)
 * แนะนำ: ต่อ pull-up ภายนอก แล้วให้ reed ต่อเข้ากราวด์
 * => เมื่อ "ประตูปิด" (reed ปิดวงจร) digitalRead() จะ LOW
 */
#define DOOR1 32
#define DOOR2 33
#define DOOR3 35
const bool REED_ACTIVE_LOW = true;   // true: LOW = ประตูปิด

const bool LED_ACTIVE_LOW = false;

const unsigned long DEBOUNCE_MS = 30;             // debounce ปุ่ม reset (double click)
const unsigned long HOLD_ON_MS = 10UL * 1000UL;    // ดับไฟหลังไม่มี motion
const unsigned int  USES_THRESHOLD_PER_ROOM = 5;  // ถึง 5 sessions -> ต้องทำความสะอาด
const unsigned long TOTAL_MS_THRESHOLD_PER_ROOM =
  2UL * 60UL * 1000UL;                            // หรือสะสม >=2 นาทีในห้อง

/* ===== Sleep Config ===== */
static const unsigned long SLEEP_IDLE_MS = 2UL * 60UL * 1000UL;  // ว่างเกิน 2 นาที -> เข้าหลับ
static const uint64_t LIGHT_SLEEP_INTERVAL_US =
  5ULL * 60ULL * 1000000ULL;                                // ตื่นเองทุก ~5 นาที
const unsigned long AWAKE_HOLDOFF_MS = 1500;                // กันหลับเร็วเกินหลังตื่น
static unsigned long lastWakeMs = 0;

/* ===== Watchdog Config ===== */
#define WDT_TIMEOUT_SEC 10  // ถ้า loop ไม่ feed เกิน 10 วิ -> รีเซ็ต

/* ===== Buzzer ===== */
const unsigned long BUZZER_TOGGLE_MS = 3000UL;
bool buzzerState = false;
unsigned long lastBuzzerToggle = 0;

/* ===== OLED ===== */
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool oledOn = true;

/* ===== Runtime State ===== */
struct RoomState {
  bool lightOn = false;          // มีคนอยู่ตอนนี้ไหม
  unsigned long lastMotionMs = 0;
  unsigned long sessionStartMs = 0;
  unsigned long uses = 0;        // นับกี่รอบแล้ว
  bool needCleaning = false;     // ถึง threshold แล้วหรือยัง
} room[3];

/* ===== Door states (Reed switches) ===== */
bool doorClosed[3] = {false,false,false};   // true = ประตูปิด

/* ===== Backend glue / Global status ===== */
bool cleaningRequired = false;     // ห้องไหนสักห้องต้องทำความสะอาด -> true
unsigned long lastCleanTimestamp = 0; // เวลารีเซ็ตล่าสุด (ms from boot)
Room rooms[3];                     // struct ที่ส่งขึ้น backend/LINE

bool backend_ok = false;           // true ถ้า POST backend ล่าสุด ok
uint32_t reportUses[3]    = {0,0,0};
uint32_t reportTotalMs[3] = {0,0,0};
bool persistLoaded        = false;

/* ===== Persist: RTC + NVS ===== */
typedef struct {
  uint32_t magic;
  uint32_t uses[3];
  uint32_t totalMs[3];
  uint8_t  needCleaning[3];
} PersistCounters;

#define PERSIST_MAGIC 0xA55A2025

RTC_DATA_ATTR PersistCounters persistRTC = {0};
Preferences prefs;

/* ===== Persist Load/Save ===== */
bool nvsLoad(PersistCounters &out) {
  prefs.begin("restroom", true);
  size_t sz = prefs.getBytesLength("counters");
  bool ok = false;
  if (sz == sizeof(PersistCounters)) {
    size_t got = prefs.getBytes("counters", &out, sizeof(PersistCounters));
    ok = (got == sizeof(PersistCounters) && out.magic == PERSIST_MAGIC);
  }
  prefs.end();
  return ok;
}

void nvsSave(const PersistCounters &in) {
  prefs.begin("restroom", false);
  prefs.putBytes("counters", &in, sizeof(PersistCounters));
  prefs.end();
}

inline void buildPersistFromRuntime(PersistCounters &out) {
  out.magic = PERSIST_MAGIC;
  for (int i=0;i<3;i++) {
    out.uses[i]         = rooms[i].useCount;
    out.totalMs[i]      = rooms[i].totalUseMS;
    out.needCleaning[i] = room[i].needCleaning ? 1 : 0;
  }
}

void loadPersistIntoRuntime() {
  PersistCounters tmp = {0};
  bool loaded = false;

  if (persistRTC.magic == PERSIST_MAGIC) {
    tmp = persistRTC;
    loaded = true;
  } else if (nvsLoad(tmp)) {
    loaded = true;
    persistRTC = tmp;
  }

  if (loaded) {
    for (int i=0;i<3;i++) {
      room[i].uses         = tmp.uses[i];
      rooms[i].useCount    = tmp.uses[i];
      rooms[i].totalUseMS  = tmp.totalMs[i];
      room[i].needCleaning = (tmp.needCleaning[i] != 0);
    }
  } else {
    memset(&persistRTC, 0, sizeof(persistRTC));
    persistRTC.magic = PERSIST_MAGIC;
    nvsSave(persistRTC);
  }

  // sync snapshot สำหรับส่ง backend
  for (int i=0;i<3;i++) {
    reportUses[i]    = rooms[i].useCount;
    reportTotalMs[i] = rooms[i].totalUseMS;
  }
  persistLoaded = true;
}

/* ===== Snapshot helper (ใช้ทุกครั้งก่อนส่ง backend) ===== */
inline void refreshReportSnapshotFromRuntime() {
  for (int i=0;i<3;i++) {
    reportUses[i]    = rooms[i].useCount;
    reportTotalMs[i] = rooms[i].totalUseMS;
  }
}

/* ===== Small helpers ===== */
inline void setLed(int pin, bool on) {
  if (LED_ACTIVE_LOW) digitalWrite(pin, on ? LOW : HIGH);
  else                digitalWrite(pin, on ? HIGH : LOW);
}

void buzzerOn()  { pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); }
void buzzerOff() { pinMode(BUZZER_PIN, INPUT); }

inline bool readDoorRaw(int pin) {
  int v = digitalRead(pin);
  return REED_ACTIVE_LOW ? (v == LOW) : (v == HIGH); // true = closed
}

inline void readAllDoors() {
  doorClosed[0] = readDoorRaw(DOOR1);
  doorClosed[1] = readDoorRaw(DOOR2);
  doorClosed[2] = readDoorRaw(DOOR3);
}

/* ===== OLED UI ===== */
static void drawCenteredText(int size, const char* line, int y) {
  display.setTextSize(size);
  display.setTextColor(SSD1306_WHITE);
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(line, 0, 0, &x1, &y1, &w, &h);
  int16_t cx = (SCREEN_WIDTH - w) / 2;
  display.setCursor(cx, y);
  display.println(line);
}

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
    if (room[i].needCleaning)      display.print(F("Clean"));
    else if (room[i].lightOn)      display.print(F("Occupied"));
    else                           display.print(F("Vacant"));
    display.setCursor(90, y);
    display.print(F("U=")); display.print(room[i].uses);
  }
  display.display();
}

void drawCleaningOverlay() {
  bool blink = (millis() / 500) % 2;
  display.clearDisplay();
  drawCenteredText(2, "CLEANING!", 8);
  if (blink) {
    display.drawRoundRect(
      2, 2,
      SCREEN_WIDTH - 4,
      SCREEN_HEIGHT - 4,
      6,
      SSD1306_WHITE
    );
  }
  drawCenteredText(1, "Please wait...", 44);
  display.display();
}

void showResetToast() {
  display.clearDisplay();
  drawCenteredText(2, "Counters", 18);
  drawCenteredText(2, "Reset",    36);
  display.display();
  delay(800);
}

/* ===== mirrorRoomToBackendStruct ===== */
void mirrorRoomToBackendStruct(int idx, int pirPin, int ledPin) {
  rooms[idx].pirPin          = pirPin;
  rooms[idx].ledPin          = ledPin;
  rooms[idx].occupied        = room[idx].lightOn;
  // prevOccupied ไม่ได้ใช้ใน logic ตอนนี้
}

/* ===== cleaningRequired flag (อย่างน้อย 1 ห้อง dirty) ===== */
void updateCleaningRequiredFlag() {
  cleaningRequired = false;
  for (int i=0;i<3;i++) {
    if (room[i].needCleaning) {
      cleaningRequired = true;
      break;
    }
  }
}

/* ===== ปุ่มรีเซตแบบ "กด 2 ครั้ง" ===== */
const unsigned long BOOT_GRACE_MS    = 5000;
const unsigned long DOUBLE_WINDOW_MS = 800;

unsigned long bootAtMs      = 0;
static int btnLastStable    = LOW;
static unsigned long btnLastChange = 0;
static unsigned long firstClickAt  = 0;
static bool firstClickArmed = false;

bool readButtonDoublePressed() {
  unsigned long now = millis();
  if (now - bootAtMs < BOOT_GRACE_MS) return false;

  int raw = digitalRead(RESET_BTN);
  if (raw != btnLastStable && now - btnLastChange >= DEBOUNCE_MS) {
    btnLastChange = now;
    btnLastStable = raw;

    if (btnLastStable == HIGH) {
      if (!firstClickArmed) {
        firstClickArmed = true;
        firstClickAt = now;
      } else if (now - firstClickAt <= DOUBLE_WINDOW_MS) {
        firstClickArmed = false;
        return true;
      } else {
        firstClickAt = now;
      }
    }
  }

  if (firstClickArmed && (now - firstClickAt > DOUBLE_WINDOW_MS)) {
    firstClickArmed = false;
  }

  return false;
}

/* ===== Room logic (PIR + Door) ===== */
void updateRoom(int idx, int pirPin, int ledPin, unsigned long now) {
  int  motion       = digitalRead(pirPin);
  bool doorIsClosed = doorClosed[idx];

  if (motion == HIGH) {
    // เริ่ม session ใหม่ เมื่อ PIR จับได้ + ประตูปิด
    if (!room[idx].lightOn && doorIsClosed) {
      room[idx].lightOn        = true;
      room[idx].sessionStartMs = now;
      setLed(ledPin, true);
      Serial.printf("[R%d] ON (motion + door closed)\n", idx+1);

      mirrorRoomToBackendStruct(idx, pirPin, ledPin);
      updateCleaningRequiredFlag();

      refreshReportSnapshotFromRuntime();
      sendStatusImmediately();   // ส่งขึ้น backend
    }
    room[idx].lastMotionMs = now;
  }

  // จบ session: ประตูเปิดออก OR timeout ไม่มี motion นานเกิน HOLD_ON_MS
  bool timeout           = room[idx].lightOn && (now - room[idx].lastMotionMs > HOLD_ON_MS);
  bool doorOpenedWhileOn = room[idx].lightOn && !doorIsClosed;

  if (timeout || doorOpenedWhileOn) {
    room[idx].lightOn = false;
    setLed(ledPin, false);
    room[idx].uses++;

    unsigned long dur = now - room[idx].sessionStartMs;
    Serial.printf(
      "[R%d] OFF (%s) | dur=%.2f min | uses=%lu\n",
      idx+1,
      doorOpenedWhileOn ? "door opened" : "timeout",
      dur / 60000.0,
      room[idx].uses
    );

    rooms[idx].useCount    = room[idx].uses;
    rooms[idx].totalUseMS += dur;

    // ถ้าถึงเกณฑ์ -> ติดธง needCleaning และยิง LINE
    if (!room[idx].needCleaning &&
        (room[idx].uses >= USES_THRESHOLD_PER_ROOM ||
         rooms[idx].totalUseMS >= TOTAL_MS_THRESHOLD_PER_ROOM)) {

      room[idx].needCleaning = true;
      Serial.printf("[R%d] -> Clean\n", idx+1);

      wifiEnsure(); // เช็ค WiFi ก่อนส่ง LINE
      notifyCleaningRequired(idx, room[idx].uses);
    }

    mirrorRoomToBackendStruct(idx, pirPin, ledPin);
    updateCleaningRequiredFlag();

    refreshReportSnapshotFromRuntime();
    sendStatusImmediately();  // แจ้ง backend หลังปิด session
  }
}

/* ===== Reset Action (แม่บ้านมากดรีเซต) ===== */
void doResetCounters() {
  for (int i = 0; i < 3; i++) {
    room[i].uses         = 0;
    room[i].needCleaning = 0;
    rooms[i].useCount    = 0;
    rooms[i].totalUseMS  = 0;
  }

  lastCleanTimestamp = millis();
  updateCleaningRequiredFlag();
  buzzerOff();
  buzzerState = false;

  PersistCounters tmp;
  buildPersistFromRuntime(tmp);
  persistRTC = tmp;
  nvsSave(tmp);

  refreshReportSnapshotFromRuntime();
  Serial.println("[RESET] All counters cleared.");
  showResetToast();
  sendStatusImmediately(); // backend แจ้งว่าทำความสะอาดแล้ว

  // แจ้ง LINE ให้รู้ว่าเคลียร์แล้ว
  wifiEnsure();
  notifyCountersReset();
}

/* ===== Light Sleep (ประหยัดพลังงาน) ===== */
static inline uint64_t rtcMaskFor(uint8_t gpio) {
  return (1ULL << gpio);
}

void oledOff() {
  if (oledOn) {
    display.clearDisplay();
    display.display();
    display.ssd1306_command(SSD1306_DISPLAYOFF);
    oledOn = false;
  }
}

void oledOnWake() {
  if (!oledOn) {
    display.ssd1306_command(SSD1306_DISPLAYON);
    oledOn = true;
  }
}

bool heartbeatOnWake = false;

void maybeEnterLightSleep(unsigned long now) {
  if (now - lastWakeMs < AWAKE_HOLDOFF_MS) return;
  if (room[0].lightOn || room[1].lightOn || room[2].lightOn) return;
  if (cleaningRequired) return;

  unsigned long lastAnyMotion =
    max(room[0].lastMotionMs, max(room[1].lastMotionMs, room[2].lastMotionMs));

  if (now - lastAnyMotion < SLEEP_IDLE_MS) return;

  // ก่อนหลับ เซฟ persist ล่าสุดไว้ใน RTC + NVS
  PersistCounters tmp;
  buildPersistFromRuntime(tmp);
  persistRTC = tmp;
  nvsSave(tmp);

  buzzerOff();
  oledOff();

  // ปลุกได้จาก PIR/ปุ่ม หรือปลุกเองทุก 5 นาที
  uint64_t mask = rtcMaskFor(PIR1) |
                  rtcMaskFor(PIR2) |
                  rtcMaskFor(PIR3) |
                  rtcMaskFor(RESET_BTN);

  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_HIGH);
  esp_sleep_enable_timer_wakeup(LIGHT_SLEEP_INTERVAL_US);

  Serial.println("[SLEEP] Enter LIGHT SLEEP (idle). Wake: PIR/BTN + 5m timer");
  Serial.flush();

  esp_light_sleep_start();
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  lastWakeMs = millis();

  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    oledOnWake();           // มีคนเข้าห้อง -> เปิดจอ
  } else if (cause == ESP_SLEEP_WAKEUP_TIMER) {
    heartbeatOnWake = true; // ตื่นตามรอบ -> heartbeat ไป backend/LINE
  }
}

/* ===== setup() ===== */
void setup() {
  Serial.begin(115200);
  delay(50);

  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause == ESP_SLEEP_WAKEUP_EXT1)
    Serial.println("[WAKE] From EXT1");
  else if (cause == ESP_SLEEP_WAKEUP_TIMER)
    Serial.println("[WAKE] From TIMER");
  else
    Serial.println("[BOOT] Power-on/reset");

  pinMode(PIR1, INPUT);
  pinMode(PIR2, INPUT);
  pinMode(PIR3, INPUT);

  pinMode(LED1, OUTPUT);
  pinMode(LED2, OUTPUT);
  pinMode(LED3, OUTPUT);

  pinMode(RESET_BTN, INPUT); // ต้องมี pull-down ภายนอกจริง

  // Reed switches: ต้องมี pull-up ภายนอก (GPIO32/33/35 ไม่มี internal pullup)
  pinMode(DOOR1, INPUT);
  pinMode(DOOR2, INPUT);
  pinMode(DOOR3, INPUT);

  buzzerOff();

  Wire.begin(21,22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("[ERR] SSD1306 not found");
  } else {
    display.ssd1306_command(SSD1306_DISPLAYON);
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SSD1306_WHITE);
    display.setCursor(30,28);
    display.println(F("System Ready"));
    display.display();
    delay(800);
  }

  mirrorRoomToBackendStruct(0,PIR1,LED1);
  mirrorRoomToBackendStruct(1,PIR2,LED2);
  mirrorRoomToBackendStruct(2,PIR3,LED3);

  loadPersistIntoRuntime();
  updateCleaningRequiredFlag();

  refreshReportSnapshotFromRuntime();
  sendStatusImmediately(); // แจ้ง backend สถานะเริ่มต้น

  bootAtMs   = millis();
  lastWakeMs = millis();

  // ---------- Watchdog init ----------
  {
    esp_task_wdt_config_t wdt_config = {
      .timeout_ms    = WDT_TIMEOUT_SEC * 1000, // ms
      .trigger_panic = true                   // ถ้าค้าง -> reset
    };

    esp_err_t err = esp_task_wdt_init(&wdt_config);
    if (err == ESP_OK || err == ESP_ERR_INVALID_STATE) {
      if (esp_task_wdt_add(NULL) == ESP_OK) {
        Serial.println("[WDT] added current task OK");
      } else {
        Serial.println("[WDT] add current task FAIL");
      }
    } else {
      Serial.printf("[WDT] init FAIL err=%d\n", (int)err);
    }
  }

  Serial.println("=== Smart Restroom (LINE Alerts + Persist + Sleep + WDT) ===");
}

/* ===== loop() ===== */
void loop() {
  unsigned long now = millis();

  readAllDoors();

  // อัปเดต 3 ห้อง
  updateRoom(0, PIR1, LED1, now);
  updateRoom(1, PIR2, LED2, now);
  updateRoom(2, PIR3, LED3, now);

  // ปุ่มรีเซต (double click)
  if (readButtonDoublePressed()) {
    doResetCounters();
  }

  // ตื่นจาก sleep แบบ timer (heartbeat ช่วงห้องว่าง)
  if (heartbeatOnWake) {
    heartbeatOnWake = false;

    updateCleaningRequiredFlag();
    refreshReportSnapshotFromRuntime();
    sendStatusImmediately(); // backend heartbeat

    // LINE heartbeat summary (ถ้าไม่อยากให้เด้งบ่อย ปิดบล็อกนี้ได้)
    wifiEnsure();
    notifyHeartbeatSummary(
      cleaningRequired,
      rooms[0].useCount,
      rooms[1].useCount,
      rooms[2].useCount
    );
  }

  // อัปเดต OLED ทุก ~250ms
  static unsigned long lastDraw=0;
  if (oledOn && millis()-lastDraw>250) {
    if (cleaningRequired) drawCleaningOverlay();
    else                  drawMainPage();
    lastDraw = millis();
  }

  // heartbeat ปกติทุก 10s (ระหว่าง active)
  static unsigned long lastBeat=0;
  if (millis()-lastBeat>10000UL) {
    lastBeat = millis();

    unsigned long lastAnyMotion =
      max(room[0].lastMotionMs, max(room[1].lastMotionMs, room[2].lastMotionMs));
    bool idleTooLong = (millis()-lastAnyMotion >= SLEEP_IDLE_MS);

    if (!idleTooLong && !cleaningRequired) {
      updateCleaningRequiredFlag();
      refreshReportSnapshotFromRuntime();
      sendStatusImmediately(); // backend only
    }
  }

  // Buzzer ถ้ามีห้องไหนต้องทำความสะอาด
  if (cleaningRequired) {
    if (millis()-lastBuzzerToggle>=BUZZER_TOGGLE_MS) {
      buzzerState=!buzzerState;
      if (buzzerState) buzzerOn();
      else             buzzerOff();
      lastBuzzerToggle=millis();
    }
  } else if (buzzerState) {
    buzzerOff();
    buzzerState=false;
  }

  // ลองเข้าหลับประหยัดพลังงาน
  maybeEnterLightSleep(now);

  // ✅ feed watchdog ให้รู้ว่า loop ยังไม่ค้าง
  static unsigned long lastFeedPrint = 0;
  if (millis() - lastFeedPrint > 2000) {  // พิมพ์ log ทุก 2 วินาที
    Serial.println("[WDT] feed watchdog");
    lastFeedPrint = millis();
  }
  esp_task_wdt_reset();

  delay(5);
}