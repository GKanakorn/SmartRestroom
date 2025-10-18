# Smart Restroom (ESP32 + FastAPI)

## Structure
```
SmartRestroom/
├── esp32_firmware/
│   ├── main.ino
│   ├── send_to_backend.h
│   └── credentials.h
└── backend/
    ├── backend.py
    ├── models.py
    └── requirements.txt
```

## Run Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn backend:app --host 0.0.0.0 --port 8000 --reload
```

## Flash ESP32
- เปิด `esp32_firmware/main.ino` ใน Arduino IDE
- ติดตั้งไลบรารี: Adafruit GFX, Adafruit SSD1306
- ปรับ `credentials.h` ให้ชี้ `API_URL` เป็น IP ของเครื่อง backend
- อัปโหลดสเก็ตช์
