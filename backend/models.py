from pydantic import BaseModel, Field
from typing import List, Literal

RoomState = Literal["vacant", "occupied", "cleaning"]

class RoomPayload(BaseModel):
    room_id: int = Field(ge=1, le=3)
    state: RoomState
    # เพิ่มตัวนับการใช้งานและเวลาสะสมต่อห้อง (มิลลิวินาที)
    use_count: int = Field(ge=0)
    total_use_ms: int = Field(ge=0)

class StatusPayload(BaseModel):
    device_id: str
    last_clean_ts_ms: int
    cleaning_required: bool
    rooms: List[RoomPayload]
    ts_ms: int
