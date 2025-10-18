from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from models import StatusPayload

app = FastAPI()

# เปิด CORS ชั่วคราว
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def ms_to_iso(ms: int) -> str:
    return datetime.fromtimestamp(ms/1000, tz=timezone.utc).isoformat()

# เก็บแพ็กเก็ตล่าสุดไว้ดูย้อนหลัง
_last_payload: StatusPayload | None = None

@app.get("/health")
async def health():
    return {"ok": True, "service": "smartrestroom-backend"}

@app.post("/api/restroom/status")
async def receive_status(p: StatusPayload):
    global _last_payload
    _last_payload = p

    print("\n=== STATUS RECEIVED ===")
    for r in p.rooms:
        print(f"Room#{r.room_id}: {r.state} | uses={r.use_count} | total={r.total_use_ms/60000:.2f} min")

    return {
        "ok": True,
        "device": p.device_id,
        "packet_time_iso": ms_to_iso(p.ts_ms),
        "last_clean_iso": ms_to_iso(p.last_clean_ts_ms),
        "cleaning_required": p.cleaning_required,
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
    if _last_payload is None:
        return {"ok": False, "message": "no data yet"}
    p = _last_payload
    return {
        "ok": True,
        "device": p.device_id,
        "last_clean_ts_ms": p.last_clean_ts_ms,
        "cleaning_required": p.cleaning_required,
        "rooms": [
            {
                "room_id": r.room_id,
                "state": r.state,
                "use_count": r.use_count,
                "total_use_ms": r.total_use_ms,
            } for r in p.rooms
        ],
        "ts_ms": p.ts_ms,
    }