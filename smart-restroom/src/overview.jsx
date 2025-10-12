import React, { useMemo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";
import bg from "./assets/bg.png"; // วางไฟล์ bg.png ใน src/assets/

export default function Overview() {
  const navigate = useNavigate();

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [lang, setLang] = useState("th");
  useEffect(() => {
    const id = setInterval(() => {
      setLang((prev) => (prev === "th" ? "en" : "th"));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const currentDate = new Intl.DateTimeFormat(
    lang === "th" ? "th-TH" : "en-GB",
    { timeZone: "Asia/Bangkok" }
  ).format(now);

  const currentTime = new Intl.DateTimeFormat(
    lang === "th" ? "th-TH" : "en-GB",
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: "Asia/Bangkok",
    }
  ).format(now);

  const i18n = {
    th: {
      title: "ห้องน้ำ",
      update: "อัปเดต",
      status: { available: "✅ ว่าง", occupied: "❌ ไม่ว่าง", cleaning: "🧹 ทำความสะอาด" },
      lines: {
        lastCleanTime: "ทำความสะอาดล่าสุด",
        lastCleanBy: "พนักงานทำความสะอาด",
        lastIncident: "จำนวนการใช้งาน",
        nextClean: "ทำความสะอาดครั้งถัดไป",
      },
      qr: { title: "QR Feedback", caption: "สแกนเพื่อให้คะแนน/แจ้งปัญหา" },
      announce: "— โปรดช่วยกันรักษาความสะอาดเพื่อความสุขของทุกคน —",
      roomNames: ["ห้อง 1", "ห้อง 2", "ห้อง 3"],
    },
    en: {
      title: "Restroom",
      update: "Update",
      status: { available: "✅ Available", occupied: "❌ Occupied", cleaning: "🧹 Cleaning" },
      lines: {
        lastCleanTime: "Last cleaned at",
        lastCleanBy: "Last cleaned by",
        lastIncident: "Usage Count",
        nextClean: "Next cleaning time",
      },
      qr: { title: "QR Feedback", caption: "Scan to rate / report" },
      announce: "— Please help keep this restroom clean for everyone's comfort —",
      roomNames: ["Room 1", "Room 2", "Room 3"],
    },
  };
  const L = lang === "th" ? i18n.th : i18n.en;

  const meta = {
    title: L.title,
    lastCleanTime: "16:00",
    lastCleanBy: "คุณนิดา",
    usageCount: 8,
    cleanDueTime: "18:00",
    dateTime: `${currentDate} ${currentTime}`,
  };

  const rooms = [
    { id: 1, name: L.roomNames[0], status: "available", noteTh: "พร้อมใช้งาน", noteEn: "Available now" },
    { id: 2, name: L.roomNames[1], status: "occupied", noteTh: "ใช้งานไปแล้ว 8 นาที", noteEn: "In use for 8 min" },
    { id: 3, name: L.roomNames[2], status: "cleaning", noteTh: "กำลังทำความสะอาด", noteEn: "Being cleaned" },
  ];

  const statusMap = useMemo(
    () => ({
      available: { bg: "bg-green-200/100", glow: "shadow-md shadow-emerald-500/20" },
      occupied: { bg: "bg-rose-200/100", glow: "shadow-md shadow-rose-500/20" },
      cleaning: { bg: "bg-amber-200/70", glow: "shadow-md shadow-amber-500/20" },
    }),
    []
  );

  return (
    <div
      className="min-h-screen w-screen p-6 text-slate-900 font-sans"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="w-full flex justify-start items-center mb-6">
        <button
          className="border border-transparent bg-white/80 hover:bg-white/100 text-blue-600 rounded-full p-2 transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-200 shadow-md"
          onClick={() => navigate(-1)}
          aria-label="ย้อนกลับ"
        >
          <HiArrowLeft size={28} />
        </button>
      </div>

      <div className="w-full h-full flex flex-col gap-8">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/20 bg-white/70 backdrop-blur-md px-5 py-3 drop-shadow-md shadow-md shadow-black-500/20 flex items-center justify-center gap-x-3">
              <div className="text-sm text-slate-600">{lang === "th" ? "ห้องน้ำว่าง" : "Available Rooms"}</div>
              <div className="font-semibold tabular-nums text-lg md:text-xl text-emerald-700">
                {rooms.filter((r) => r.status === "available").length} {lang === "th" ? "ห้อง" : "rooms"}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-white/20 bg-white/70 backdrop-blur-md px-4 py-3 drop-shadow-md shadow-md shadow-black-500/20 flex items-center justify-center gap-x-3">
              <div className="text-sm text-slate-600">{L.update}</div>
              <div className="font-semibold tabular-nums text-lg md:text-xl">{meta.lastCleanTime}</div>
            </div>

            <div className="rounded-full border border-white/20 bg-white/70 backdrop-blur-md px-4 py-3 drop-shadow-md shadow-md shadow-black-500/20 flex items-center justify-center gap-x-3">
              <div className="text-sm text-slate-600">{lang === "th" ? "วันที่ & เวลา" : "Date & Time"}</div>
              <div className="font-semibold tabular-nums text-sm md:text-base">{meta.dateTime}</div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 gap-6 w-full">
          <div className="flex-1 flex flex-col gap-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {rooms.map((r) => (
                <RoomCard key={r.id} room={r} statusMap={statusMap} L={L} lang={lang} />
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatCard label={L.lines.lastCleanTime} value={meta.lastCleanTime} />
              <StatCard label={L.lines.lastCleanBy} value={meta.lastCleanBy} />
              <StatCard label={L.lines.lastIncident} value={meta.usageCount} />
              <StatCard label={L.lines.nextClean} value={meta.cleanDueTime} />
            </div>
          </div>

          {/* QR Feedback */}
          <aside className="flex-shrink-0 w-60">
            <div className="rounded-2xl border border-purple-300/50 bg-purple-300/40 backdrop-blur-md p-4 drop-shadow-md shadow-md shadow-purple-500/20 h-full flex flex-col justify-center">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-slate-500">{L.qr.title}</div>
                  <div className="font-semibold">{L.qr.caption}</div>
                </div>
              </div>

              <div className="w-full grid place-items-center py-3 flex-1">
                <div className="aspect-square w-40 max-w-full rounded-lg border border-purple-300/50 bg-purple-100/40 grid place-items-center">
                  <div className="text-slate-500">(QR)</div>
                </div>
              </div>
            </div>
          </aside>
        </div>

        {/* Announcement */}
        <div className="mt-6 rounded-2xl border-l-5 border-orange-400 bg-orange-200/70 px-6 py-4 text-base text-slate-700 shadow-md shadow-orange-500/20 w-full">
          <div className="font-medium mb-1">📢 {lang === "th" ? "ประกาศ" : "Announcement"}</div>
          <div className="text-slate-500 text-base">{L.announce}</div>
        </div>
      </div>
    </div>
  );
}

function RoomCard({ room, statusMap, L, lang }) {
  const s = statusMap[room.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ scale: 1.03 }}
      transition={{ duration: 0.28 }}
      className={`rounded-2xl p-5 ${s.bg} ${s.glow} backdrop-blur-md`}
    >
      <div className="flex flex-col items-center gap-4">
        <div className="text-base text-slate-500">{room.name}</div>
        <div className={`w-full max-w-[240px] rounded-full p-4 border border-white/20 bg-white/70 grid place-items-center`}>
          <div className="font-semibold text-xl">{L.status[room.status]}</div>
        </div>
        <div className="text-sm text-slate-500">{lang === "th" ? room.noteTh : room.noteEn}</div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.32 }}
      className="rounded-2xl border border-white/20 bg-white/60 backdrop-blur-md p-5 shadow-md"
    >
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-3 font-semibold text-3xl tabular-nums text-slate-800">{value}</div>
    </motion.div>
  );
}
