#ifndef SEND_TO_BACKEND_H
#define SEND_TO_BACKEND_H
 
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_wifi.h>
#include "esp_task_wdt.h"   // ✅ ใช้รีเฟรช watchdog ระหว่างขั้นตอนที่อาจหน่วง (เช่น รอ Wi-Fi/HTTP)
#include "credentials.h"    // ✅ เก็บค่าคงที่ เช่น DEVICE_ID, API_URL, WIFI_SSID, WIFI_PASS

/* =========================================================
 * โครงสร้างและตัวแปรที่แชร์กับ main (สถานะจริงของห้อง)
 * ========================================================= */
struct Room {
  int pirPin;                 // ขา PIR ของห้องนี้ (เพื่อ debug/อ้างอิง)
  int ledPin;                 // ขา LED ของห้องนี้ (เพื่อ debug/อ้างอิง)
  bool occupied;              // true = ห้องกำลังใช้งาน (ใช้แสดง state ให้ backend)
  bool prevOccupied;          // สำรองสถานะก่อนหน้า (เผื่อ logic ภายนอกอยากเช็คการเปลี่ยนแปลง)
  unsigned long lastMotionMS; // เวลา ms ของ motion ล่าสุด (ช่วยคิด timeout ฝั่ง main)
  unsigned long sessionStartMS; // เวลา ms ที่เริ่มรอบการใช้งานล่าสุด
  unsigned long useCount;     // จำนวนรอบการใช้งานสะสม (นับตอนจบ session)
  unsigned long totalUseMS;   // เวลาการใช้งานสะสมทั้งหมด (ms)
};

/* ===== ตัวแปรจากไฟล์หลัก (main) ที่เราต้องอ่านเพื่อนำไปส่งขึ้น backend ===== */
extern bool cleaningRequired;          // ธงรวม: มีอย่างน้อยหนึ่งห้องที่ต้องทำความสะอาด
extern unsigned long lastCleanTimestamp; // เวลาที่รีเซ็ตเคาน์เตอร์ล่าสุด (ms since boot)
extern Room rooms[3];                  // สถานะห้องแบบละเอียด

/* Snapshot สำหรับรายงานขึ้น backend (สรุปเฉพาะที่ต้องโชว์/เก็บ) */
extern uint32_t reportUses[3];         // จำนวนรอบใช้งานของแต่ละห้อง (ที่สรุปแล้ว)
extern uint32_t reportTotalMs[3];      // เวลาสะสมของแต่ละห้อง (ms)
extern bool persistLoaded;             // true = main โหลดข้อมูลสะสมจาก NVS/RTC สำเร็จแล้ว

/* ✅ สถานะประตูจาก main (รีดสวิตช์) — ช่วยอธิบายสถานะใช้งานร่วมกับ PIR */
extern bool doorClosed[3];             // true = ประตูปิด

/* ให้ main รับรู้ผลการส่งครั้งล่าสุด: true = OK, false = ล้มเหลว/ยังไม่ส่ง */
extern bool backend_ok;

/* =========================================================
 * ส่วนดูแล Wi-Fi: บังคับรีเซ็ตวิทยุ + ป้องกันสแปมการเชื่อมต่อ
 * ========================================================= */

/* helper: แปลงสถานะ Wi-Fi เป็นคำอ่าน (ใช้กับ log) */
static inline const char* wlStatusName(wl_status_t s){
  switch(s){
    case WL_IDLE_STATUS:      return "IDLE";        // ยังไม่ได้เชื่อม แต่ไม่ได้ error
    case WL_NO_SSID_AVAIL:    return "NO_SSID";     // หา SSID ไม่เจอ
    case WL_SCAN_COMPLETED:   return "SCAN_DONE";   // สแกนจบ (ไม่ใช่เชื่อมต่อสำเร็จ)
    case WL_CONNECTED:        return "CONNECTED";   // เชื่อมต่อสำเร็จ
    case WL_CONNECT_FAILED:   return "CONNECT_FAIL";// เชื่อมต่อไม่สำเร็จ (รหัสผ่าน/ความเข้ากันได้)
    case WL_CONNECTION_LOST:  return "CONN_LOST";   // เคยต่อแล้วหลุด
    case WL_DISCONNECTED:     return "DISCONNECTED";// ไม่ได้เชื่อมต่อ
    default:                  return "UNKNOWN";
  }
}

/*
 * wifiEnsure()
 * - เรียกแบบ "idempotent" (เรียกซ้ำได้โดยไม่ก่อสภาวะค้าง) เพื่อให้แน่ใจว่าเราต่อ Wi-Fi อยู่
 * - มีคูลดาวน์ 10s กันการวนเรียกถี่ ๆ
 * - ทำ hard reset radio: disconnect -> WIFI_OFF -> WIFI_STA
 * - ตั้ง timeout 30s พร้อมปริ้นท์จุดทุก 500ms (และรีเฟรช watchdog เพื่อกันค้าง)
 */
static inline void wifiEnsure() {
  static bool inProgress = false;         // กัน reentry ขณะกำลังเชื่อมต่อ
  static unsigned long lastTryMs = 0;     // บันทึกครั้งล่าสุดที่เริ่ม connect
  const unsigned long COOLDOWN_MS = 10000;  // ระยะห่างขั้นต่ำระหว่างการลองใหม่

  // เงื่อนไขหยุดเร็ว (fast-exit) เพื่อลดงานไม่จำเป็น
  if (WiFi.status() == WL_CONNECTED) return;
  if (inProgress) return;
  if (millis() - lastTryMs < COOLDOWN_MS) return;

  inProgress = true;
  lastTryMs = millis();

  Serial.println("\n[WiFi] Ensure: start");

  // ปิดการ reconnect อัตโนมัติชั่วคราว + ไม่แตะค่าใน NVS
  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  WiFi.setSleep(false);

  Serial.printf("[WiFi] Connecting to SSID='%s' ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  // วนรอด้วย timeout = 30s พร้อมรีเฟรช watchdog (กันบอร์ดรีเซ็ตเพราะรอนาน)
  const unsigned long TIMEOUT_MS = 30000UL;
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < TIMEOUT_MS) {
    delay(500);
    Serial.print(".");

    // ✅ รีเฟรช watchdog ระหว่างรอ Wi-Fi (ขั้นตอนที่มีโอกาสนาน)
    esp_task_wdt_reset();
  }

  wl_status_t st = WiFi.status();
  Serial.printf("\n[WiFi] status=%d (%s)\n", st, wlStatusName(st));
  if (st == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected, IP=%s  RSSI=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    WiFi.setAutoReconnect(true); // เปิด auto-reconnect เมื่อเชื่อมสำเร็จ
  } else {
    Serial.println("[WiFi] Failed. (เช็ค SSID/PASS, ใช้ 2.4GHz/WPA2, ปิด MAC filter)");
  }

  inProgress = false;
}

/* =========================================================
 * Helper แปลงสถานะห้อง -> string สำหรับ JSON
 * ========================================================= */
static inline const char* roomStateWord(bool occupied, bool cleaning) {
  // ถ้ามีธง cleaningRequired รวม ให้ state ทุกห้องเป็น "cleaning"
  if (cleaning) return "cleaning";
  // ไม่เช่นนั้นแสดง occupied/vacant ตามจริงของห้อง
  return occupied ? "occupied" : "vacant";
}

/* =========================================================
 * สร้าง JSON payload ที่จะยิงไป backend
 * โครง:
 * {
 *   "device_id": "...",
 *   "last_clean_ts_ms": <ms>,
 *   "cleaning_required": true/false,
 *   "rooms": [
 *      {"room_id":1,"state":"occupied|vacant|cleaning","use_count":N,"total_use_ms":M,"door_closed":true/false},
 *      ...
 *   ],
 *   "ts_ms": <เวลาสร้าง payload>
 * }
 * ========================================================= */
static inline String buildStatusJson() {
  unsigned long now = millis();

  String j = "{";
  j += "\"device_id\":\"" + String(DEVICE_ID) + "\",";                 // ระบุแผง/ดีไวซ์
  j += "\"last_clean_ts_ms\":" + String(lastCleanTimestamp) + ",";      // ช่วย frontend คำนวณตั้งแต่รีเซ็ต
  j += "\"cleaning_required\":" + String(cleaningRequired ? "true" : "false") + ",";

  j += "\"rooms\":[";
  for (int i = 0; i < 3; i++) {
    j += "{";
    j += "\"room_id\":" + String(i+1) + ",";                            // ใช้ 1..3 เพื่อแสดงผล
    j += "\"state\":\""; j += roomStateWord(rooms[i].occupied, cleaningRequired); j += "\","; // สถานะสรุป
    j += "\"use_count\":" + String(reportUses[i]) + ",";                 // ใช้ snapshot เพื่อความสม่ำเสมอ
    j += "\"total_use_ms\":" + String(reportTotalMs[i]) + ",";           // เวลาสะสม (ms)
    j += "\"door_closed\":" + String(doorClosed[i] ? "true" : "false");  // สถานะประตูจากรีดสวิตช์
    j += "}";
    if (i < 2) j += ",";                                                // คั่นรายการ (ยกเว้นตัวสุดท้าย)
  }
  j += "],";

  j += "\"ts_ms\":" + String(now);                                      // เวลาสร้าง payload
  j += "}";
  return j;
}

/* =========================================================
 * ส่ง HTTP POST ทันที (เรียกจาก main เมื่อมีอัปเดตสำคัญ)
 * ลอจิก:
 * 1) เคลียร์ backend_ok = false (จนกว่าจะยืนยันได้ว่าสำเร็จ)
 * 2) wifiEnsure() ให้แน่ใจว่ามีเน็ต (รีเฟรช WDT ระหว่างรอ)
 * 3) ถ้า persistLoaded ยัง false -> ข้าม (กันส่งข้อมูลไม่ครบ)
 * 4) สร้าง payload และยิงไป API_URL
 * 5) ถ้าได้ code 200 และ body มี "ok": true -> ตั้ง backend_ok = true
 * 6) รีเฟรช WDT หลัง HTTP เผื่อช้า
 * ========================================================= */
static inline void sendStatusImmediately() {
  backend_ok = false; // เริ่มต้นให้ถือว่ายังไม่สำเร็จ (fail-fast จนกว่าจะพิสูจน์ได้)

  wifiEnsure();                // พยายามต่อ Wi-Fi (มีคูลดาวน์ในตัว)
  esp_task_wdt_reset();        // ✅ กัน watchdog ตายขณะเน็ตอืด

  // ถ้าไม่มีเน็ตก็หยุดเลย (ลดเวลา block loop หลัก)
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi not connected, skip send.");
    return;
  }

  // รอจน main โหลด persist เสร็จ (กันส่งข้อมูลครึ่ง ๆ กลาง ๆ ไปโชว์)
  if (!persistLoaded) {
    Serial.println("[WARN] Persist not loaded yet; skip send.");
    return;
  }

  // สร้าง payload JSON
  String payload = buildStatusJson();

  // พิมพ์ payload เพื่อ debug เวลาเกิดปัญหาหลังบ้าน/ฟรอนต์เอนด์
  Serial.println("[DEBUG] payload:");
  Serial.println(payload);

  HTTPClient http;
  http.begin(API_URL);                         // ปลายทาง FastAPI /api/restroom/status
  http.addHeader("Content-Type", "application/json");

  // ยิง POST (อาจช้า → มีรีเฟรช watchdog หลังคำสั่งนี้)
  int code = http.POST(payload);

  // ✅ รีเฟรช watchdog หลัง HTTP (กันกรณีเน็ตหน่วงยาว)
  esp_task_wdt_reset();

  // แสดงผลลัพธ์จากเซิร์ฟเวอร์
  Serial.printf("[HTTP] POST %s -> code=%d\n", API_URL, code);
  if (code > 0) {
    String resp = http.getString();
    Serial.println(resp);

    // เงื่อนไขถือว่าสำเร็จ: code=200 และใน body มี "ok": true
    if (code == 200 && resp.indexOf("\"ok\": true") >= 0) {
      backend_ok = true;       // ให้ main ทราบว่า “ส่งล่าสุด ok”
    }
  } else {
    // code <= 0 มักคือ error ภายใน หรือเชื่อมต่อปลายทางไม่ได้
    Serial.println("[HTTP] Failed to send data.");
  }

  http.end();
}

#endif