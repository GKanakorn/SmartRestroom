#ifndef SEND_TO_BACKEND_H
#define SEND_TO_BACKEND_H
 
#include <WiFi.h>
#include <HTTPClient.h>
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

/* ให้ main เห็นสถานะการส่งล่าสุด: true = OK, false = ล้มเหลว/ยังไม่ส่ง */
extern bool backend_ok;

/* ===== Wi-Fi ensure (อัปเกรดดีบัก + สแกน + auto-reconnect) ===== */
static inline void wifiEnsure() {
  if (WiFi.status() == WL_CONNECTED) return;

  // โหมด STATION + ปิด sleep + เปิด auto-reconnect ให้นิ่ง
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);

  // สแกนเครือข่าย (ช่วยไล่ปัญหา SSID/สัญญาณ/เข้ารหัส)
  Serial.println("\n[WiFi] Scanning...");
  int n = WiFi.scanNetworks(/*async=*/false, /*hidden=*/true);
  if (n >= 0) {
    for (int i = 0; i < n && i < 15; i++) {
      Serial.printf("  %2d) %s  RSSI=%d  %s\n",
        i+1, WiFi.SSID(i).c_str(), WiFi.RSSI(i),
        (WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "OPEN" : "SECURED"));
    }
  } else {
    Serial.println("  (scan failed)");
  }

  Serial.printf("[WiFi] Connecting to SSID='%s' ...\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  const unsigned long TIMEOUT_MS = 30000UL; // รอ 30 วินาที
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < TIMEOUT_MS) {
    delay(500);
    Serial.print(".");
  }
  wl_status_t st = WiFi.status();
  if (st == WL_CONNECTED) {
    Serial.printf("\n[WiFi] Connected, IP=%s  RSSI=%d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.printf("\n[WiFi] Failed. status=%d  (ตรวจ SSID/PASS, ใช้ 2.4GHz, ปิด MAC filter)\n", st);
  }
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
    j += "\"use_count\":" + String(rooms[i].useCount) + ",";
    j += "\"total_use_ms\":" + String(rooms[i].totalUseMS);
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
  backend_ok = false;               // สมมติล้มเหลวจนกว่าจะพิสูจน์ว่า ok
  wifiEnsure();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WARN] WiFi not connected, skip send.");
    return;
  }
  String payload = buildStatusJson();

  // DEBUG: ดู payload ที่จะส่ง (ช่วยไล่เคส rooms ไม่ครบ)
  Serial.println("[DEBUG] payload:");
  Serial.println(payload);

  HTTPClient http;
  http.begin(API_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
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