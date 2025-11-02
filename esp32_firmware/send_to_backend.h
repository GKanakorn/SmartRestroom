#ifndef SEND_TO_BACKEND_H
#define SEND_TO_BACKEND_H
 
#include <WiFi.h>
#include <HTTPClient.h>
#include <esp_wifi.h>
#include "esp_task_wdt.h"   // ✅ reset watchdog ระหว่างเน็ตหน่วง
#include "credentials.h"

/* ===== Structures ===== */
struct Room {
  int pirPin;
  int ledPin;
  bool occupied;
  bool prevOccupied;
  unsigned long lastMotionMS;
  unsigned long sessionStartMS;
  unsigned long useCount;
  unsigned long totalUseMS;
};

extern bool cleaningRequired;
extern unsigned long lastCleanTimestamp;
extern Room rooms[3];

extern uint32_t reportUses[3];
extern uint32_t reportTotalMs[3];
extern bool persistLoaded;

/* ✅ สถานะประตูที่มาจาก main */
extern bool doorClosed[3];

/* ให้ main เห็นสถานะการส่งล่าสุด: true = OK, false = ล้มเหลว/ยังไม่ส่ง */
extern bool backend_ok;

/* ===== Wi-Fi ensure (hard reset radio + cooldown) ===== */
static inline const char* wlStatusName(wl_status_t s){
  switch(s){
    case WL_IDLE_STATUS:      return "IDLE";
    case WL_NO_SSID_AVAIL:    return "NO_SSID";
    case WL_SCAN_COMPLETED:   return "SCAN_DONE";
    case WL_CONNECTED:        return "CONNECTED";
    case WL_CONNECT_FAILED:   return "CONNECT_FAIL";
    case WL_CONNECTION_LOST:  return "CONN_LOST";
    case WL_DISCONNECTED:     return "DISCONNECTED";
    default:                  return "UNKNOWN";
  }
}

static inline void wifiEnsure() {
  static bool inProgress = false;
  static unsigned long lastTryMs = 0;
  const unsigned long COOLDOWN_MS = 10000;  // กันเรียกถี่เกินไป

  if (WiFi.status() == WL_CONNECTED) return;
  if (inProgress) return;
  if (millis() - lastTryMs < COOLDOWN_MS) return;

  inProgress = true;
  lastTryMs = millis();

  Serial.println("\n[WiFi] Ensure: start");

  WiFi.setAutoReconnect(false);
  WiFi.persistent(false);

  WiFi.disconnect(true, true);
  delay(150);

  WiFi.mode(WIFI_OFF);
  delay(150);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);

  Serial.printf("[WiFi] Connecting to SSID='%s' ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  const unsigned long TIMEOUT_MS = 30000UL;
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < TIMEOUT_MS) {
    delay(500);
    Serial.print(".");

    // ✅ กัน watchdog ตายตอนรอ WiFi นาน
    esp_task_wdt_reset();
  }

  wl_status_t st = WiFi.status();
  Serial.printf("\n[WiFi] status=%d (%s)\n", st, wlStatusName(st));
  if (st == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected, IP=%s  RSSI=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
    WiFi.setAutoReconnect(true);
  } else {
    Serial.println("[WiFi] Failed. (เช็ค SSID/PASS, ใช้ 2.4GHz/WPA2, ปิด MAC filter)");
  }

  inProgress = false;
}

/* ===== Helper ===== */
static inline const char* roomStateWord(bool occupied, bool cleaning) {
  if (cleaning) return "cleaning";
  return occupied ? "occupied" : "vacant";
}

/* ===== JSON Builder ===== */
static inline String buildStatusJson() {
  unsigned long now = millis();

  String j = "{";
  j += "\"device_id\":\"" + String(DEVICE_ID) + "\",";
  j += "\"last_clean_ts_ms\":" + String(lastCleanTimestamp) + ",";
  j += "\"cleaning_required\":" + String(cleaningRequired ? "true" : "false") + ",";
  j += "\"rooms\":[";

  for (int i = 0; i < 3; i++) {
    j += "{";
    j += "\"room_id\":" + String(i+1) + ",";
    j += "\"state\":\""; j += roomStateWord(rooms[i].occupied, cleaningRequired); j += "\",";
    j += "\"use_count\":" + String(reportUses[i]) + ",";
    j += "\"total_use_ms\":" + String(reportTotalMs[i]) + ",";
    j += "\"door_closed\":" + String(doorClosed[i] ? "true" : "false");
    j += "}";
    if (i < 2) j += ",";
  }

  j += "],";
  j += "\"ts_ms\":" + String(now);
  j += "}";
  return j;
}

/* ===== POST Function (ดีบัก payload + ตั้ง backend_ok) ===== */
static inline void sendStatusImmediately() {
  backend_ok = false; // เริ่มต้นคิดว่ายังส่งไม่สำเร็จ

  wifiEnsure();

  // เผื่อ WiFi ยังช้าอยู่ -> รีเฟรช watchdog ตรงนี้ด้วย
  esp_task_wdt_reset();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi not connected, skip send.");
    return;
  }

  if (!persistLoaded) {
    Serial.println("[WARN] Persist not loaded yet; skip send.");
    return;
  }

  String payload = buildStatusJson();

  Serial.println("[DEBUG] payload:");
  Serial.println(payload);

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");

  int code = http.POST(payload);

  // กันกรณี HTTP POST ช้าจนน็อค
  esp_task_wdt_reset();

  Serial.printf("[HTTP] POST %s -> code=%d\n", API_URL, code);
  if (code > 0) {
    String resp = http.getString();
    Serial.println(resp);

    if (code == 200 && resp.indexOf("\"ok\": true") >= 0) {
      backend_ok = true;
    }
  } else {
    Serial.println("[HTTP] Failed to send data.");
  }

  http.end();
}

#endif