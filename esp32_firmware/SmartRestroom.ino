#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "esp_sleep.h"
#include <Preferences.h>      // ✅ ใช้ NVS (แฟลช) เก็บตัวนับข้ามการหลับ/รีบูต
#include "esp_task_wdt.h"     // ✅ Hardware Task Watchdog (กันค้าง)

#include "send_to_backend.h"  // ✅ ส่งสถานะไป Backend ผ่าน HTTP JSON
#include "send_to_line.h"     // ✅ แจ้งเตือนเข้า LINE OA (push message)

/* ====== กำหนดขาต่าง ๆ ของระบบ ====== */
#define PIR1 27
#define PIR2 26
#define PIR3 25
#define LED1 18
#define LED2 17
#define LED3 16
#define BUZZER_PIN 19
#define RESET_BTN 34   // ⚠️ GPIO34 เป็น input-only และไม่มี internal pull-up/down -> ต้องมี pull-down ภายนอกจริง

/* ---- Reed switches (ประตู) ----
 * ใช้ GPIO 32, 33, 35 (input-only, ไม่มี internal pull-up/down)
 * แนะนำ: ต่อ pull-up ภายนอก แล้วให้ reed ต่อกราวด์
 * => เมื่อ "ประตูปิด" (reed ปิดวงจร) digitalRead() จะ LOW (เพราะดึงลงกราวด์)
 */
#define DOOR1 32
#define DOOR2 33
#define DOOR3 35
const bool REED_ACTIVE_LOW = true;   // true = logic LOW แปลว่า "ประตูปิด"

const bool LED_ACTIVE_LOW = false; 

/* ====== ค่าพารามิเตอร์ระบบ ====== */
const unsigned long DEBOUNCE_MS = 30;              // หน่วงกันเด้งปุ่มสำหรับ double-click reset
const unsigned long HOLD_ON_MS  = 10UL * 1000UL;   // เวลาคอยดับไฟเมื่อไม่มี motion ต่อเนื่อง (10s)
const unsigned int  USES_THRESHOLD_PER_ROOM = 5;   // เกณฑ์จำนวนรอบการใช้งานต่อห้องก่อนแจ้ง "ต้องทำความสะอาด"
const unsigned long TOTAL_MS_THRESHOLD_PER_ROOM =
  2UL * 60UL * 1000UL;                             // เกณฑ์เวลาสะสม >= 2 นาที ต่อห้องก่อนแจ้ง "ต้องทำความสะอาด"

/* ====== โหมดประหยัดพลังงาน (Light Sleep) ====== */
static const unsigned long SLEEP_IDLE_MS = 2UL * 60UL * 1000UL;  // ถ้าห้องว่างทุกห้องนานเกิน 2 นาที -> เข้าหลับ
static const uint64_t LIGHT_SLEEP_INTERVAL_US =
  5ULL * 60ULL * 1000000ULL; // ปลุกตัวเองอัตโนมัติทุก ~5 นาที (heartbeat)
const unsigned long AWAKE_HOLDOFF_MS = 1500;       // ตื่นมาแล้วอย่างน้อย 1.5s ก่อนค่อยหลับใหม่
static unsigned long lastWakeMs = 0;

/* ====== Watchdog ====== */
// ถ้า loop ไม่ feed ภายใน 10 วินาที จะ trigger panic -> รีบูตอัตโนมัติ
#define WDT_TIMEOUT_SEC 10

/* ====== Buzzer (เตือนเมื่อถึงเกณฑ์ต้องทำความสะอาด) ====== */
const unsigned long BUZZER_TOGGLE_MS = 3000UL;     // กระพริบเสียงเข้า/ออกทุก 3 วินาทีตอนแจ้งเตือน
bool buzzerState = false;
unsigned long lastBuzzerToggle = 0;

/* ====== OLED Display ====== */
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);
bool oledOn = true; // ธงบอกสถานะจอเปิด/ปิด (ใช้ตอน sleep)

/* ====== โครงสร้างสถานะของแต่ละห้อง (runtime เฉพาะรอบปัจจุบัน) ====== */
struct RoomState {
  bool lightOn = false;             // ตอนนี้ห้องกำลังถูกใช้งานอยู่หรือไม่ (true=มีคน)
  unsigned long lastMotionMs = 0;   // เวลาเกิด motion ครั้งล่าสุด
  unsigned long sessionStartMs = 0; // เวลาเริ่มรอบการใช้งานครั้งนี้
  unsigned long uses = 0;           // จำนวนรอบการใช้งาน (นับเพิ่มตอนจบ session)
  bool needCleaning = false;        // ธงว่าห้องนี้ถึงเกณฑ์ต้องทำความสะอาดแล้วหรือยัง
} room[3];

/* ====== สถานะประตู (รีดสวิตช์) ของแต่ละห้อง ====== */
bool doorClosed[3] = {false,false,false}; // true = ประตูปิด (รีดปิดวงจร)

/* ====== ตัวแปรสำหรับเชื่อมต่อ Backend/LINE และ Persist ====== */
bool cleaningRequired = false;      // ถ้ามีอย่างน้อยหนึ่งห้องที่ needCleaning -> true
unsigned long lastCleanTimestamp = 0; // เวลาที่รีเซ็ตล่าสุด (ms นับจากบูต)
Room rooms[3];                      // โครงสร้างที่ mirror state เพื่อนำไปส่ง backend

bool backend_ok = false;            // ธงผลล่าสุดที่ POST ไป backend (true=สำเร็จ)
uint32_t reportUses[3]    = {0,0,0};
uint32_t reportTotalMs[3] = {0,0,0};
bool persistLoaded        = false;

/* ====== Persist (เซฟค่าลง RTC + NVS) ====== */
// เก็บตัวนับ uses, totalMs และธง needCleaning เพื่อให้คงอยู่ข้าม sleep/reboot
typedef struct {
  uint32_t magic;
  uint32_t uses[3];
  uint32_t totalMs[3];
  uint8_t  needCleaning[3];
} PersistCounters;

#define PERSIST_MAGIC 0xA55A2025

RTC_DATA_ATTR PersistCounters persistRTC = {0}; // เก็บลง RTC RAM (อยู่รอดตอน light sleep)
Preferences prefs;                              // NVS สำหรับสำรองบนแฟลช

/* ====== โหลด/บันทึก Persist จาก/ลง NVS ====== */
bool nvsLoad(PersistCounters &out) {
  prefs.begin("restroom", true);                       // โหมดอ่าน
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
  prefs.begin("restroom", false);                      // โหมดเขียน
  prefs.putBytes("counters", &in, sizeof(PersistCounters));
  prefs.end();
}

/* ====== สร้างโครง Persist จากค่าปัจจุบันใน RAM ====== */
inline void buildPersistFromRuntime(PersistCounters &out) {
  out.magic = PERSIST_MAGIC;
  for (int i=0;i<3;i++) {
    out.uses[i]         = rooms[i].useCount;           // ดึงจาก struct ที่ส่ง backend
    out.totalMs[i]      = rooms[i].totalUseMS;
    out.needCleaning[i] = room[i].needCleaning ? 1 : 0;
  }
}

/* ====== โหลด Persist เข้าสู่ตัวแปร runtime ====== */
void loadPersistIntoRuntime() {
  PersistCounters tmp = {0};
  bool loaded = false;

  // 1) ถ้ามีใน RTC แล้ว ใช้อันนั้นก่อน (เร็ว ไม่ต้องแตะแฟลช)
  if (persistRTC.magic == PERSIST_MAGIC) {
    tmp = persistRTC;
    loaded = true;
  }
  // 2) ถ้า RTC ไม่มี ลองอ่านจาก NVS (แฟลช)
  else if (nvsLoad(tmp)) {
    loaded = true;
    persistRTC = tmp; // sync กลับเข้า RTC ด้วย
  }

  // 3) ถ้าเจอข้อมูล -> โยนเข้า runtime
  if (loaded) {
    for (int i=0;i<3;i++) {
      room[i].uses         = tmp.uses[i];
      rooms[i].useCount    = tmp.uses[i];
      rooms[i].totalUseMS  = tmp.totalMs[i];
      room[i].needCleaning = (tmp.needCleaning[i] != 0);
    }
  } else {
    // 4) ไม่เจอข้อมูลเลย -> เริ่มใหม่และเซฟลง NVS
    memset(&persistRTC, 0, sizeof(persistRTC));
    persistRTC.magic = PERSIST_MAGIC;
    nvsSave(persistRTC);
  }

  // เตรียม snapshot สำหรับส่ง backend
  for (int i=0;i<3;i++) {
    reportUses[i]    = rooms[i].useCount;
    reportTotalMs[i] = rooms[i].totalUseMS;
  }
  persistLoaded = true;
}

/* ====== อัปเดต snapshot ก่อนส่ง backend ====== */
inline void refreshReportSnapshotFromRuntime() {
  for (int i=0;i<3;i++) {
    reportUses[i]    = rooms[i].useCount;
    reportTotalMs[i] = rooms[i].totalUseMS;
  }
}

/* ====== Helper คุม LED แบบรองรับ active-low ====== */
inline void setLed(int pin, bool on) {
  if (LED_ACTIVE_LOW) digitalWrite(pin, on ? LOW : HIGH);
  else                digitalWrite(pin, on ? HIGH : LOW);
}

/* ====== Buzzer ====== */
void buzzerOn()  { pinMode(BUZZER_PIN, OUTPUT); digitalWrite(BUZZER_PIN, LOW); } // โมดูลบางแบบ trigger LOW
void buzzerOff() { pinMode(BUZZER_PIN, INPUT); }                                 // ปล่อยขาให้ Hi-Z = เงียบ

/* ====== อ่านรีดสวิตช์ (สถานะประตู) ====== */
inline bool readDoorRaw(int pin) {
  int v = digitalRead(pin);
  // กำหนดทิศทางไว้ชัด: ถ้า REED_ACTIVE_LOW = true -> LOW แปลว่าประตูปิด
  return REED_ACTIVE_LOW ? (v == LOW) : (v == HIGH);
}

inline void readAllDoors() {
  doorClosed[0] = readDoorRaw(DOOR1);
  doorClosed[1] = readDoorRaw(DOOR2);
  doorClosed[2] = readDoorRaw(DOOR3);
}

/* ====== ส่วนแสดงผลบนจอ OLED ====== */
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
  // แสดงสถานะรวมของแต่ละห้อง + จำนวนรอบใช้งาน U
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
  // โหมดแจ้ง "กำลังทำความสะอาด" พร้อมกรอบกระพริบ
  bool blink = (millis() / 500) % 2;
  display.clearDisplay();
  drawCenteredText(2, "CLEANING!", 8);
  if (blink) {
    display.drawRoundRect(2, 2, SCREEN_WIDTH - 4, SCREEN_HEIGHT - 4, 6, SSD1306_WHITE);
  }
  drawCenteredText(1, "Please wait...", 44);
  display.display();
}

void showResetToast() {
  // แสดงข้อความสั้น ๆ เมื่อรีเซ็ตตัวนับเสร็จ
  display.clearDisplay();
  drawCenteredText(2, "Counters", 18);
  drawCenteredText(2, "Reset",    36);
  display.display();
  delay(800);
}

/* ====== mirrorRoomToBackendStruct: สะท้อนสถานะเพื่อส่ง backend ====== */
void mirrorRoomToBackendStruct(int idx, int pirPin, int ledPin) {
  rooms[idx].pirPin   = pirPin;
  rooms[idx].ledPin   = ledPin;
  rooms[idx].occupied = room[idx].lightOn;  // ตรงนี้คือแกนหลักที่ backend ใช้แสดงว่าง/ไม่ว่าง
}

/* ====== อัปเดตธงรวมว่ามีห้องไหนต้องทำความสะอาดไหม ====== */
void updateCleaningRequiredFlag() {
  cleaningRequired = false;
  for (int i=0;i<3;i++) {
    if (room[i].needCleaning) {
      cleaningRequired = true;    // ถ้ามีซักห้อง -> ธงรวม = true
      break;
    }
  }
}

/* ====== ปุ่มรีเซ็ตแบบ "กด 2 ครั้งติดกัน" เพื่อกันกดพลาด ====== */
const unsigned long BOOT_GRACE_MS    = 5000; // กันกดตอนบูต 5s แรก
const unsigned long DOUBLE_WINDOW_MS = 800;  // ต้องกดครั้งที่ 2 ภายใน 0.8s

unsigned long bootAtMs      = 0;
static int btnLastStable    = LOW;
static unsigned long btnLastChange = 0;
static unsigned long firstClickAt  = 0;
static bool firstClickArmed = false;

bool readButtonDoublePressed() {
  unsigned long now = millis();
  if (now - bootAtMs < BOOT_GRACE_MS) return false; // ยังไม่รับกดช่วงบูต

  int raw = digitalRead(RESET_BTN);
  // ตรวจจับขอบสัญญาณแบบหน่วงกันเด้ง
  if (raw != btnLastStable && now - btnLastChange >= DEBOUNCE_MS) {
    btnLastChange = now;
    btnLastStable = raw;

    if (btnLastStable == HIGH) { // นับเฉพาะตอนปล่อยเป็น HIGH (หรือเลือกตอนกดก็ได้ตามวงจร)
      if (!firstClickArmed) {
        // ครั้งที่ 1 -> ติดธงรอครั้งที่ 2
        firstClickArmed = true;
        firstClickAt = now;
      } else if (now - firstClickAt <= DOUBLE_WINDOW_MS) {
        // ครั้งที่ 2 มาทันเวลา -> นับว่า double click สำเร็จ
        firstClickArmed = false;
        return true;
      } else {
        // คลิกช้าไป -> เลื่อนหน้าต่างใหม่
        firstClickAt = now;
      }
    }
  }

  // ถ้ารอครั้งที่สองนานเกินหน้าต่าง -> ยกเลิก
  if (firstClickArmed && (now - firstClickAt > DOUBLE_WINDOW_MS)) {
    firstClickArmed = false;
  }

  return false;
}

/* ====== แกนหลักตรวจจับ "เข้า/ออกห้อง" (PIR + ประตู) ======
 * กติกา:
 * - เริ่ม "ใช้งาน" เมื่อ PIR มี motion + ประตูปิดและยังไม่อยู่ในสถานะใช้งาน
 * - จบ "ใช้งาน" เมื่อประตูเปิด หรือไม่มี motion เกิน HOLD_ON_MS
 */
void updateRoom(int idx, int pirPin, int ledPin, unsigned long now) {
  int  motion       = digitalRead(pirPin);
  bool doorIsClosed = doorClosed[idx];

  /* --- เริ่ม session --- */
  if (motion == HIGH) {
    // เริ่ม session ใหม่ เฉพาะเมื่อ "ยังไม่ ON" และ "ประตูปิด"
    if (!room[idx].lightOn && doorIsClosed) {
      room[idx].lightOn        = true;
      room[idx].sessionStartMs = now;
      setLed(ledPin, true);  // เปิดไฟในห้อง
      Serial.printf("[R%d] ON (motion + door closed)\n", idx+1);

      // อัปเดตโครงสร้างสำหรับ backend และคำนวณธงรวม
      mirrorRoomToBackendStruct(idx, pirPin, ledPin);
      updateCleaningRequiredFlag();

      // ส่ง snapshot ปัจจุบันขึ้น backend (บันทึกว่าเริ่มใช้งานแล้ว)
      refreshReportSnapshotFromRuntime();
      sendStatusImmediately();
    }
    // บันทึกเวลามี motion ล่าสุด (ใช้ตัดสินใจ timeout)
    room[idx].lastMotionMs = now;
  }

  /* --- จบ session --- */
  bool timeout           = room[idx].lightOn && (now - room[idx].lastMotionMs > HOLD_ON_MS);
  bool doorOpenedWhileOn = room[idx].lightOn && !doorIsClosed;

  if (timeout || doorOpenedWhileOn) {
    // ปิดสถานะใช้งาน + ดับไฟ
    room[idx].lightOn = false;
    setLed(ledPin, false);

    // นับจำนวนรอบ และบันทึกเวลาที่ใช้ไปในรอบนี้
    room[idx].uses++;
    unsigned long dur = now - room[idx].sessionStartMs;

    Serial.printf(
      "[R%d] OFF (%s) | dur=%.2f min | uses=%lu\n",
      idx+1,
      doorOpenedWhileOn ? "door opened" : "timeout",
      dur / 60000.0,
      room[idx].uses
    );

    // อัปเดตค่าที่สะสมไว้เพื่อส่ง backend/เก็บ persist
    rooms[idx].useCount    = room[idx].uses;
    rooms[idx].totalUseMS += dur;

    // ตรวจเกณฑ์ "ต้องทำความสะอาด": ตามจำนวนครั้ง หรือ เวลาสะสม
    if (!room[idx].needCleaning &&
        (room[idx].uses >= USES_THRESHOLD_PER_ROOM ||
         rooms[idx].totalUseMS >= TOTAL_MS_THRESHOLD_PER_ROOM)) {

      room[idx].needCleaning = true;
      Serial.printf("[R%d] -> Clean\n", idx+1);

      // แจ้ง LINE ให้แม่บ้านทราบ (ensure WiFi ก่อน)
      wifiEnsure();
      notifyCleaningRequired(idx, room[idx].uses);
    }

    // อัปเดตภาพสะท้อนไป backend + ธงรวม แล้วส่งสถานะล่าสุด
    mirrorRoomToBackendStruct(idx, pirPin, ledPin);
    updateCleaningRequiredFlag();

    refreshReportSnapshotFromRuntime();
    sendStatusImmediately();
  }
}

/* ====== รีเซ็ตตัวนับทั้งหมด (แม่บ้านมากดเมื่อทำความสะอาดแล้ว) ====== */
void doResetCounters() {
  // ล้างตัวนับทุกห้อง
  for (int i = 0; i < 3; i++) {
    room[i].uses         = 0;
    room[i].needCleaning = 0;
    rooms[i].useCount    = 0;
    rooms[i].totalUseMS  = 0;
  }

  lastCleanTimestamp = millis(); // บันทึกเวลาที่รีเซ็ต
  updateCleaningRequiredFlag();
  buzzerOff(); buzzerState = false;

  // สร้างข้อมูล persist จาก runtime แล้วเซฟลง RTC + NVS
  PersistCounters tmp;
  buildPersistFromRuntime(tmp);
  persistRTC = tmp;
  nvsSave(tmp);

  // แจ้ง backend ว่ารีเซ็ตแล้ว + ขึ้นหน้าจอ
  refreshReportSnapshotFromRuntime();
  Serial.println("[RESET] All counters cleared.");
  showResetToast();
  sendStatusImmediately();

  // แจ้ง LINE บอกว่าเคลียร์แล้ว
  wifiEnsure();
  notifyCountersReset();
}

/* ====== Utilities เกี่ยวกับการ Sleep/จอ ====== */
static inline uint64_t rtcMaskFor(uint8_t gpio) { return (1ULL << gpio); }

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

bool heartbeatOnWake = false; // ธงว่าเพิ่งตื่นจาก timer (ปลุกทุก ~5 นาที)

/* ====== พยายามเข้าหลับ (Light Sleep) เมื่อระบบว่าง ======
 * เงื่อนไขเข้าหลับ:
 * - ตื่นมานานพอ (AWAKE_HOLDOFF_MS)
 * - ทุกห้องว่าง และไม่มีธง cleaningRequired
 * - ไม่มี motion รวมกันนานเกิน SLEEP_IDLE_MS
 * ปลุกได้จาก: PIR/ปุ่ม (EXT1) หรือ RTC timer 5 นาที
 */
void maybeEnterLightSleep(unsigned long now) {
  // 1) ยังไม่ตื่นมานานพอ
  if (now - lastWakeMs < AWAKE_HOLDOFF_MS) return;

  // 2) ยังมีห้องใช้งานอยู่
  if (room[0].lightOn || room[1].lightOn || room[2].lightOn) return;

  // 3) ยังมีห้องต้องทำความสะอาด
  if (cleaningRequired) return;

  // 4) ถ้ามีประตูบานไหนยังปิดอยู่ (reed = closed) ไม่ต้องหลับ
  if (doorClosed[0] || doorClosed[1] || doorClosed[2]) {
    return;
  }

  unsigned long lastAnyMotion =
    max(room[0].lastMotionMs, max(room[1].lastMotionMs, room[2].lastMotionMs));

  if (now - lastAnyMotion < SLEEP_IDLE_MS) return;

  // ก่อนหลับ: เซฟ persist ล่าสุด (กันไฟดับ/ตื่นมาแล้วตัวนับไม่ตรง)
  PersistCounters tmp;
  buildPersistFromRuntime(tmp);
  persistRTC = tmp;
  nvsSave(tmp);

  buzzerOff();
  oledOff();

  // ตั้งเงื่อนไขปลุก: PIR ทั้ง 3 + ปุ่ม reset + timer 5 นาที
  uint64_t mask = rtcMaskFor(PIR1) |
                  rtcMaskFor(PIR2) |
                  rtcMaskFor(PIR3) |
                  rtcMaskFor(RESET_BTN);

  esp_sleep_disable_wakeup_source(ESP_SLEEP_WAKEUP_ALL);
  esp_sleep_enable_ext1_wakeup(mask, ESP_EXT1_WAKEUP_ANY_HIGH);
  esp_sleep_enable_timer_wakeup(LIGHT_SLEEP_INTERVAL_US);

  Serial.println("[SLEEP] Enter LIGHT SLEEP (idle). Wake: PIR/BTN + 5m timer");
  Serial.flush();

  // เข้าหลับจริง
  esp_light_sleep_start();

  // ตรวจเหตุปลุก
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  lastWakeMs = millis();

  if (cause == ESP_SLEEP_WAKEUP_EXT1) {
    // มีการเคลื่อนไหว/กดปุ่ม -> เปิดจอ
    oledOnWake();
  } else if (cause == ESP_SLEEP_WAKEUP_TIMER) {
    // ปลุกตามรอบ -> ทำ heartbeat หลังจากนี้ใน loop()
    heartbeatOnWake = true;
  }
}

/* ====== setup(): ตั้งค่าฮาร์ดแวร์และวอร์มระบบ ====== */
void setup() {
  Serial.begin(115200);
  delay(50);

  // บอกเหตุปลุก (เพื่อดีบัก)
  esp_sleep_wakeup_cause_t cause = esp_sleep_get_wakeup_cause();
  if (cause == ESP_SLEEP_WAKEUP_EXT1)      Serial.println("[WAKE] From EXT1");
  else if (cause == ESP_SLEEP_WAKEUP_TIMER)Serial.println("[WAKE] From TIMER");
  else                                     Serial.println("[BOOT] Power-on/reset");

  // ตั้งโหมดขาต่าง ๆ
  pinMode(PIR1, INPUT); pinMode(PIR2, INPUT); pinMode(PIR3, INPUT);
  pinMode(LED1, OUTPUT); pinMode(LED2, OUTPUT); pinMode(LED3, OUTPUT);
  pinMode(RESET_BTN, INPUT); // ⚠️ ต้องมีตัวต้านทาน pull-down ภายนอกจริง
  
  pinMode(DOOR1, INPUT); pinMode(DOOR2, INPUT); pinMode(DOOR3, INPUT); // ⚠️ ต้องมี pull-up ภายนอกสำหรับ reed

  // ปิด buzzer ไว้ก่อน
  buzzerOff();

  // เริ่มใช้งานจอ OLED
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

  // สร้าง mirror โครงสร้างส่ง backend สำหรับทั้ง 3 ห้อง
  mirrorRoomToBackendStruct(0,PIR1,LED1);
  mirrorRoomToBackendStruct(1,PIR2,LED2);
  mirrorRoomToBackendStruct(2,PIR3,LED3);

  // โหลดตัวนับที่เคยบันทึก (ถ้ามี) + คำนวณธงรวม
  loadPersistIntoRuntime();
  updateCleaningRequiredFlag();

  // ส่ง snapshot เริ่มต้นไป backend (เพื่อแสดงสถานะทันที)
  refreshReportSnapshotFromRuntime();
  sendStatusImmediately();

  // บันทึกเวลาตอนบูต/ตื่น
  bootAtMs   = millis();
  lastWakeMs = millis();

  /* ---------- Watchdog init (กันค้าง) ----------
   * ตั้ง timeout=10s และ trigger_panic=true (ให้รีบูตเมื่อค้าง)
   * จากนั้น add task ปัจจุบันเข้า watchdog
   */
  {
    esp_task_wdt_config_t wdt_config = {
      .timeout_ms    = WDT_TIMEOUT_SEC * 1000,
      .trigger_panic = true
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

/* ====== loop(): วนหลักของระบบ ======
 * ลำดับหลัก:
 * 1) อ่านสถานะประตู → อัปเดตแต่ละห้อง (PIR + ประตู) → เช็คปุ่ม reset
 * 2) ถ้าตื่นจาก RTC timer -> ส่ง heartbeat (backend + LINE)
 * 3) วาดจอทุก ~250ms
 * 4) ส่ง heartbeat ปกติทุก 10s (ตอนที่ยัง active)
 * 5) ควบคุม buzzer เมื่อถึงเกณฑ์ทำความสะอาด
 * 6) พิจารณาเข้าหลับถ้าว่างนาน
 * 7) feed watchdog ให้แน่ใจว่าไม่ค้าง
 */
void loop() {
  unsigned long now = millis();

  /* 1) อ่านประตู + อัปเดต 3 ห้อง */
  readAllDoors();
  updateRoom(0, PIR1, LED1, now);
  updateRoom(1, PIR2, LED2, now);
  updateRoom(2, PIR3, LED3, now);

  // ปุ่มรีเซ็ตแบบ double click
  if (readButtonDoublePressed()) {
    doResetCounters();
  }

  /* 2) ตื่นจาก sleep แบบ timer: ทำ heartbeat */
  if (heartbeatOnWake) {
    heartbeatOnWake = false;

    updateCleaningRequiredFlag();
    refreshReportSnapshotFromRuntime();
    sendStatusImmediately(); // ส่ง backend

    // แจ้ง LINE แบบย่อ (ถ้าไม่อยากให้เด้งบ่อยสามารถคอมเมนต์บล็อกนี้ออก)
    wifiEnsure();
    notifyHeartbeatSummary(
      cleaningRequired,
      rooms[0].useCount,
      rooms[1].useCount,
      rooms[2].useCount
    );
  }

  /* 3) วาดจอทุก ~250ms */
  static unsigned long lastDraw=0;
  if (oledOn && millis()-lastDraw>250) {
    if (cleaningRequired) drawCleaningOverlay();
    else                  drawMainPage();
    lastDraw = millis();
  }

  /* 4) heartbeat ปกติทุก 10s (เฉพาะช่วงที่ยัง active และไม่ติดธง cleaning) */
  static unsigned long lastBeat=0;
  if (millis()-lastBeat>10000UL) {
    lastBeat = millis();

    unsigned long lastAnyMotion =
      max(room[0].lastMotionMs, max(room[1].lastMotionMs, room[2].lastMotionMs));
    bool idleTooLong = (millis()-lastAnyMotion >= SLEEP_IDLE_MS);

    if (!idleTooLong && !cleaningRequired) {
      updateCleaningRequiredFlag();
      refreshReportSnapshotFromRuntime();
      sendStatusImmediately();
    }
  }

  /* 5) คุมเสียง buzzer ถ้ามีห้องไหนต้องทำความสะอาด */
  if (cleaningRequired) {
    if (millis()-lastBuzzerToggle>=BUZZER_TOGGLE_MS) {
      buzzerState=!buzzerState;
      if (buzzerState) buzzerOn();
      else             buzzerOff();
      lastBuzzerToggle=millis();
    }
  } else if (buzzerState) {
    // ถ้าหาย dirty แล้วให้ปิดเสียง
    buzzerOff();
    buzzerState=false;
  }

  /* 6) ลองเข้าหลับ ถ้าระบบว่างนานพอ */
  maybeEnterLightSleep(now);

  /* 7) Feed Watchdog: แสดง log ทุก ~2s และรีเฟรช watchdog ทุกลูป */
  static unsigned long lastFeedPrint = 0;
  if (millis() - lastFeedPrint > 2000) {
    Serial.println("[WDT] feed watchdog");
    lastFeedPrint = millis();
  }
  esp_task_wdt_reset();

  // เวลาหน่วงสั้น ๆ เพื่อให้ loop ไม่หนักเกินไป
  delay(5);
}