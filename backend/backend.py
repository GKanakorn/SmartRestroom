from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from models import StatusPayload
import os
import hmac
import hashlib
import base64
import httpx
import json
from pydantic import BaseModel
from typing import List, Dict, Optional
from threading import Lock

# =========================
# FastAPI app + CORS
# =========================
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Globals
# =========================

# เก็บแพ็กเก็ตสถานะล่าสุดจาก ESP32 (แบบแปลงแล้ว)
_last_payload: Optional[StatusPayload] = None

# เก็บค่าเวลา "ดิบ" ที่ ESP ส่งมาจริง ๆ (เพราะใน model อาจจะไม่ได้ define ไว้)
_last_clean_ts_ms: Optional[int] = None
_ts_ms: Optional[int] = None

# เก็บผลการประเมินความสะอาด (แบบประเมินจาก EvaluationPage)
# NOTE: เก็บในหน่วยความจำ (RAM) ชั่วคราวก่อน / ยังไม่ได้เขียนลง DB
class EvaluationRecord(BaseModel):
    date: str                  # วันที่แบบฝั่ง frontend เช่น "03/11/2568"
    scores: Dict[str, int]     # {"ความสะอาด":5,"ทิชชู่":4,...}

evaluation_records: List[EvaluationRecord] = []
eval_lock = Lock()

# =========================
# LINE Messaging API config
# =========================
LINE_CHANNEL_ACCESS_TOKEN = os.getenv(
    "LINE_CHANNEL_ACCESS_TOKEN",
    "qQFVIYsD+6lJ0h3/ODwG9mRWfWRf+MZfv/N9pSWpKvSkh8RMYzT1i7lGMFOZi07JDF6fkwPME0DEgPGv2MtdbM7tEbotD/6vVM16bC1eOcDyF0W4ix71XxcoPxm+WGL/26DW6ixfjgTwc6Z7pk9/VwdB04t89/1O/w1cDnyilFU="
)
LINE_CHANNEL_SECRET = os.getenv(
    "LINE_CHANNEL_SECRET",
    "2aae51f867c7abdeaf9e2c19b1ed6c56"
)

# =========================
# Build status text for LINE reply
# =========================

def build_status_text_for_line() -> str:
    """
    ใช้ตอนตอบผู้ใช้ใน LINE เมื่อเขาพิมพ์ 'เช็ค'
    จะสรุปสถานะว่าง/ไม่ว่าง ของแต่ละห้อง
    """
    global _last_payload
    if _last_payload is None:
        return "ยังไม่มีข้อมูลจาก Smart Restroom เลยครับ 💤"

    p = _last_payload

    lines = []
    for r in p.rooms:
        state_th = {
            "occupied": "ไม่ว่าง 🚫",
            "vacant": "ว่าง ✅",
            "cleaning": "ปิดทำความสะอาด 🧹",
        }.get(r.state, r.state)
        lines.append(f"ห้อง {r.room_id}: {state_th}")

    msg = "📊 สถานะห้องน้ำล่าสุด\n"
    msg += "\n".join(lines)
    return msg

# =========================
# LINE helpers
# =========================

async def line_reply_message(reply_token: str, message_text: str):
  """
  ใช้ LINE Reply API ตอบกลับข้อความของผู้ใช้ (ต้องใช้ replyToken สด ๆ)
  """
  url = "https://api.line.me/v2/bot/message/reply"
  headers = {
      "Content-Type": "application/json",
      "Authorization": f"Bearer {LINE_CHANNEL_ACCESS_TOKEN}",
  }
  body = {
      "replyToken": reply_token,
      "messages": [
          {
              "type": "text",
              "text": message_text
          }
      ]
  }

  # debug
  print("[DEBUG] line_reply_message() sending to LINE ...")
  print("[DEBUG] body:", body)

  async with httpx.AsyncClient(timeout=10.0) as client:
      r = await client.post(url, headers=headers, json=body)

  print("[LINE reply] status =", r.status_code)
  print("[LINE reply] resp   =", r.text)


def verify_line_signature(raw_body: bytes, x_line_signature: str) -> bool:
    """
    ตรวจสอบว่า webhook นี้มาจาก LINE จริงหรือไม่
    LINE จะส่ง header: X-Line-Signature
    ซึ่งเป็น HMAC-SHA256(body, CHANNEL_SECRET) แล้ว base64 encode
    """
    secret = LINE_CHANNEL_SECRET.encode("utf-8")
    mac = hmac.new(secret, raw_body, hashlib.sha256).digest()
    calc_sig = base64.b64encode(mac).decode("utf-8")
    ok = hmac.compare_digest(calc_sig, x_line_signature)
    if not ok:
        print("[WARN] LINE signature mismatch")
        print(" calc =", calc_sig)
        print(" head =", x_line_signature)
    return ok

# =========================
# REST endpoints
# =========================

@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "smartrestroom-backend"
    }


@app.post("/api/restroom/status")
async def receive_status(request: Request):
    """
    ESP32 ยิง POST มาที่นี่ทุกครั้งที่มีอัพเดต
    เราเก็บ payload ล่าสุดไว้ แล้วตอบกลับ 200 OK
    เพิ่มเติม: เราดึง last_clean_ts_ms / ts_ms จาก JSON ดิบด้วย
    """
    global _last_payload, _last_clean_ts_ms, _ts_ms

    # อ่าน json ดิบก่อน เพื่อให้ได้ทุก field ที่ ESP ส่งมา
    raw = await request.json()

    # เก็บเวลาจริงที่ ESP ส่งมา (ถ้ามี)
    _last_clean_ts_ms = raw.get("last_clean_ts_ms")
    _ts_ms = raw.get("ts_ms")

    # จากนั้นค่อยแปลงเป็น model เดิมของคุณ
    p = StatusPayload(**raw)
    _last_payload = p

    print("\n=== STATUS RECEIVED ===")
    print(f"device = {p.device_id}")
    print(f"clean? = {p.cleaning_required}")
    print(f"last_clean_ts_ms(raw) = {_last_clean_ts_ms}")
    print(f"ts_ms(raw)            = {_ts_ms}")
    for r in p.rooms:
        print(
            f"Room#{r.room_id}: {r.state} | "
            f"uses={r.use_count} | total={r.total_use_ms/60000:.2f} min"
        )

    # ตอบกลับแบบใส่เวลาที่เราเพิ่งรับมาเลย
    return {
        "ok": True,
        "device": p.device_id,
        "cleaning_required": p.cleaning_required,
        "last_clean_ts_ms": _last_clean_ts_ms,
        "ts_ms": _ts_ms,
        "rooms": [
            {
                "room_id": r.room_id,
                "state": r.state,
                "use_count": r.use_count,
                "total_use_ms": r.total_use_ms,
            }
            for r in p.rooms
        ],
    }


@app.get("/api/restroom/status/latest")
async def latest():
    """
    ดึง snapshot ล่าสุดที่เราเก็บไว้ใน _last_payload
    """
    if _last_payload is None:
        return {"ok": False, "message": "no data yet"}

    p = _last_payload
    return {
        "ok": True,
        "device": p.device_id,
        "cleaning_required": p.cleaning_required,
        # ⬇⬇ ตอนนี้ส่งค่าที่เราเก็บจาก JSON ดิบจริง ๆ
        "last_clean_ts_ms": _last_clean_ts_ms,
        "ts_ms": _ts_ms,
        "rooms": [
            {
                "room_id": r.room_id,
                "state": r.state,
                "use_count": r.use_count,
                "total_use_ms": r.total_use_ms,
            } for r in p.rooms
        ],
    }

# =========================
# Evaluation endpoints
# =========================

@app.post("/api/evaluation")
async def post_evaluation(record: EvaluationRecord):
    """
    มือถือ/แท็บเล็ต/โน้ตบุ๊ก ยิงมาบันทึกผลการประเมิน
    """
    with eval_lock:
        evaluation_records.append(record)
    print("[EVAL] new record =", record)
    return {"ok": True}


@app.get("/api/evaluation")
async def get_evaluation():
    """
    ManagerPage เรียกอันนี้เพื่อดึงข้อมูลการประเมินทั้งหมด
    """
    with eval_lock:
        return {
            "ok": True,
            "data": [r.dict() for r in evaluation_records],
        }

# =========================
# LINE Webhook endpoint
# =========================

@app.post("/line/webhook")
async def line_webhook(request: Request):
    """
    LINE จะยิง event มาที่นี่เวลามีคนคุยกับบอท
    ถ้ามีคนพิมพ์ 'เช็ค' -> เราจะตอบสรุปสถานะห้องน้ำล่าสุดกลับไป
    """
    raw_body = await request.body()
    sig = request.headers.get("X-Line-Signature", "")

    # 1) verify signature ก่อน
    if not verify_line_signature(raw_body, sig):
        raise HTTPException(status_code=400, detail="Bad signature")

    # 2) parse body เป็น JSON
    try:
        body_json = json.loads(raw_body.decode("utf-8"))
    except Exception as e:
        print("[ERR] cannot parse webhook JSON:", e)
        raise HTTPException(status_code=400, detail="invalid json")

    print("=== [LINE] webhook data ===")
    print(json.dumps(body_json, ensure_ascii=False, indent=2))

    # 3) loop events
    events = body_json.get("events", [])
    for ev in events:
        etype = ev.get("type")
        if etype != "message":
            continue  # ตอนนี้สนใจเฉพาะข้อความ

        msg = ev.get("message", {})
        if msg.get("type") != "text":
            continue  # ถ้าไม่ใช่ข้อความตัวหนังสือก็ข้าม

        user_text = msg.get("text", "").strip()
        reply_token = ev.get("replyToken")

        # ถ้าผู้ใช้พิมพ์ "เช็ค"
        if user_text == "เช็ค":
            ans = build_status_text_for_line()
            await line_reply_message(reply_token, ans)
        else:
            # default: บอทตอบช่วยอธิบายวิธีใช้
            help_text = (
                "พิมพ์ \"เช็ค\" เพื่อดูสถานะห้องน้ำล่าสุด 🧼🚻\n"
                "ระบบ Smart Restroom 🤖"
            )
            await line_reply_message(reply_token, help_text)

    # ต้องตอบ 200 เสมอให้ LINE พอใจ
    return {"ok": True}