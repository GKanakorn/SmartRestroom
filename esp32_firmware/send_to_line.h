#ifndef SEND_TO_LINE_H
#define SEND_TO_LINE_H

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>  // <-- เพิ่มอันนี้

/* ===== CONFIG ===== */
static const char* LINE_TOKEN = "qQFVIYsD+6lJ0h3/ODwG9mRWfWRf+MZfv/N9pSWpKvSkh8RMYzT1i7lGMFOZi07JDF6fkwPME0DEgPGv2MtdbM7tEbotD/6vVM16bC1eOcDyF0W4ix71XxcoPxm+WGL/26DW6ixfjgTwc6Z7pk9/VwdB04t89/1O/w1cDnyilFU=";
static const char* LINE_TO_ID = "Uba5eb45419be7c60b7897936b355e743"; // ต้องเป็น userId ที่คุยกับบอทแล้ว

/*
   helper: แปลงสถานะ WiFi เป็นข้อความ (debug)
*/
static inline const char* line_wlStatusName(wl_status_t s){
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

/*
   sendLineMessage()

   - ส่ง push message ไปยัง LINE OA
   - ใช้ LINE Messaging API /v2/bot/message/push
   - ต้องเป็น Official Account ที่เปิด Messaging API แล้ว
*/
static inline void sendLineMessage(const String &message) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[LINE] ❌ WiFi not connected (status=%s)\n", line_wlStatusName(WiFi.status()));
    return;
  }

  // ใช้ HTTPS ผ่าน WiFiClientSecure
  WiFiClientSecure *client = new WiFiClientSecure;
  if (!client) {
    Serial.println("[LINE] ❌ no mem for WiFiClientSecure");
    return;
  }
  client->setInsecure();  // *** สำหรับทดสอบ: ข้ามการ verify cert CA

  HTTPClient http;
  if (!http.begin(*client, "https://api.line.me/v2/bot/message/push")) {
    Serial.println("[LINE] ❌ http.begin() failed");
    delete client;
    return;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + LINE_TOKEN);

  // escape message คร่าว ๆ: replace " -> \"  (กัน JSON พังถ้ามี quote)
  String safeMsg = message;
  safeMsg.replace("\"", "\\\"");

  String payload =
    String("{\"to\":\"") + LINE_TO_ID + "\","
    "\"messages\":[{\"type\":\"text\",\"text\":\"" + safeMsg + "\"}]}";

  int httpCode = http.POST(payload);

  Serial.printf("[LINE] POST /push -> code=%d\n", httpCode);
  if (httpCode > 0) {
    String resp = http.getString();
    Serial.printf("[LINE] resp: %s\n", resp.c_str());
  } else {
    Serial.println("[LINE] HTTP POST failed (maybe TLS / cert / no internet?)");
  }

  http.end();
  delete client;
}

/* helper แจ้งอีเวนต์ต่าง ๆ */
static inline void notifyCleaningRequired(int roomIndex, unsigned long useCount) {
  String m = "🚨 Room " + String(roomIndex+1) +
             " needs cleaning (" + String(useCount) + " uses)";
  sendLineMessage(m);
}

static inline void notifyCountersReset() {
  sendLineMessage("✅ Counters have been reset. All rooms marked clean.");
}

static inline void notifyHeartbeatSummary(bool cleaningRequired,
                                          unsigned long totalUse0,
                                          unsigned long totalUse1,
                                          unsigned long totalUse2) {
  String m = "💡 Heartbeat\n";
  m += "CleaningRequired=";
  m += (cleaningRequired ? "YES" : "NO");
  m += "\nR1 uses=" + String(totalUse0);
  m += "\nR2 uses=" + String(totalUse1);
  m += "\nR3 uses=" + String(totalUse2);
  sendLineMessage(m);
}

#endif