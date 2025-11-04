#ifndef SEND_TO_LINE_H
#define SEND_TO_LINE_H

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>  // ✅ ใช้ TLS/HTTPS กับ LINE API

/* ===== CONFIG =====
 * ⚠️ หมายเหตุด้านความปลอดภัย:
 * - การฝัง TOKEN/USER ID ไว้ในเฟิร์มแวร์มีความเสี่ยงถูกดึงออก (แม้จะยากแต่เป็นไปได้)
 * - ในงานจริงควรย้ายค่าเหล่านี้ไปเก็บฝั่ง Backend แล้วให้บอร์ดเรียกผ่าน Backend แทน
 */
static const char* LINE_TOKEN =
  "qQFVIYsD+6lJ0h3/ODwG9mRWfWRf+MZfv/N9pSWpKvSkh8RMYzT1i7lGMFOZi07JDF6fkwPME0DEgPGv2MtdbM7tEbotD/6vVM16bC1eOcDyF0W4ix71XxcoPxm+WGL/26DW6ixfjgTwc6Z7pk9/VwdB04t89/1O/w1cDnyilFU="; // LINE Channel Access Token (Bearer)
static const char* LINE_TO_ID =
  "Uba5eb45419be7c60b7897936b355e743"; // userId ผู้รับ (ต้องเคยทัก OA มาก่อน ถึง push ได้)

/* -------------------------------------------------------
 * helper: แปลงสถานะ Wi-Fi (enum) → string เพื่อพิมพ์ log
 * ----------------------------------------------------- */
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

/* -------------------------------------------------------
 * sendLineMessage(message)
 *
 * หน้าที่:
 * - ส่ง “push message” (ข้อความเชิงรุก) ไปยังผู้ใช้ปลายทาง LINE OA
 * - เรียกใช้ LINE Messaging API: /v2/bot/message/push (HTTPS)
 *
 * เงื่อนไขสำคัญ:
 * - ต้องเชื่อม Wi-Fi แล้ว (มิฉะนั้น return ทันที)
 * - ผู้รับ (to) ต้อง “เคยคุยกับ OA” มาก่อนแล้วเท่านั้น (ข้อจำกัดของ LINE)
 * - ใช้ Bearer Token ใน header “Authorization”
 *
 * ขั้นตอน:
 * 1) ตรวจสถานะ Wi-Fi
 * 2) สร้าง WiFiClientSecure (TLS) แล้วตั้งค่า (ตอนนี้ setInsecure เพื่อข้ามตรวจ cert สำหรับทดสอบ)
 * 3) http.begin() ชี้ endpoint LINE push API
 * 4) ใส่ header: Content-Type และ Authorization
 * 5) escape ข้อความ (แทน " → \") กัน JSON พัง
 * 6) สร้าง payload JSON ตามรูปแบบของ LINE API
 * 7) http.POST(payload) แล้วพิมพ์ผลลัพธ์/response
 * 8) ปิดการเชื่อมต่อและคืนหน่วยความจำ
 *
 * ----------------------------------------------------- */
static inline void sendLineMessage(const String &message) {
  // 1) ต้องต่อเน็ตก่อน ไม่งั้นไม่ทำอะไร
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[LINE] ❌ WiFi not connected (status=%s)\n",
                  line_wlStatusName(WiFi.status()));
    return;
  }

  // 2) เตรียม HTTPS client (TLS)
  WiFiClientSecure *client = new WiFiClientSecure;
  if (!client) {
    Serial.println("[LINE] ❌ no mem for WiFiClientSecure");
    return;
  }
  client->setInsecure();  // ⚠️ ข้ามการตรวจ cert (ปลอดภัยน้อยกว่า) — ใช้สำหรับทดสอบ/Dev

  HTTPClient http;

  // 3) เปิดการเชื่อมต่อไปยัง LINE push endpoint
  if (!http.begin(*client, "https://api.line.me/v2/bot/message/push")) {
    Serial.println("[LINE] ❌ http.begin() failed");
    delete client;
    return;
  }

  // 4) ใส่ header ตามที่ LINE กำหนด
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + LINE_TOKEN);

  // 5) escape เครื่องหมาย " ภายในข้อความ กัน JSON แตก
  String safeMsg = message;
  safeMsg.replace("\"", "\\\"");

  // 6) สร้าง payload ตามสเปค LINE (to=userId, messages=[{type:"text", text:"..."}])
  String payload =
    String("{\"to\":\"") + LINE_TO_ID + "\","
    "\"messages\":[{\"type\":\"text\",\"text\":\"" + safeMsg + "\"}]}";

  // 7) ส่ง HTTP POST แล้วพิมพ์ผลลัพธ์
  int httpCode = http.POST(payload);

  Serial.printf("[LINE] POST /push -> code=%d\n", httpCode);
  if (httpCode > 0) {
    String resp = http.getString();          // body จาก LINE (มักว่างเปล่าเมื่อสำเร็จ)
    Serial.printf("[LINE] resp: %s\n", resp.c_str());
  } else {
    Serial.println("[LINE] HTTP POST failed (maybe TLS / cert / no internet?)");
  }

  // 8) ปิดการเชื่อมต่อและคืนหน่วยความจำ
  http.end();
  delete client;
}

/* -------------------------------------------------------
 * Helpers สำหรับข้อความสำเร็จรูปที่ใช้ในโปรเจกต์
 * (เรียกฟังก์ชันเดียวจบ ไม่ต้องต่อสตริงเองซ้ำ ๆ)
 * ----------------------------------------------------- */

// แจ้งว่าห้องหมายเลข X ถึงเกณฑ์ต้องทำความสะอาด พร้อมจำนวนรอบที่ใช้ไป
static inline void notifyCleaningRequired(int roomIndex, unsigned long useCount) {
  String m = "🚨 Room " + String(roomIndex+1) +
             " needs cleaning (" + String(useCount) + " uses)";
  sendLineMessage(m);
}

// แจ้งเมื่อกดรีเซ็ตตัวนับ (ถือว่าแม่บ้านทำความสะอาดแล้ว)
static inline void notifyCountersReset() {
  sendLineMessage("✅ Counters have been reset. All rooms marked clean.");
}

// ส่งสรุปสถานะคร่าว ๆ แบบ heartbeat (ให้รู้ว่ายังมีชีวิต + รวมจำนวนรอบต่อห้อง)
// *ถ้าเด้งบ่อยไปสามารถย้ายไปเรียกเป็นระยะเวลานานขึ้นหรือปิดได้
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