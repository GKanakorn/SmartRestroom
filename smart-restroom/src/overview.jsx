import React, { useMemo, useEffect, useState } from "react";

export default function Overview() {
  // --- live clock (Asia/Bangkok) ---
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // --- language toggle every 5 seconds ---
  const [lang, setLang] = useState("th"); // "th" | "en"
  useEffect(() => {
    const id = setInterval(() => {
      setLang((prev) => (prev === "th" ? "en" : "th"));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  const currentDate = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    timeZone: "Asia/Bangkok",
  }).format(now);
  const currentTime = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Bangkok",
  }).format(now);

  const i18n = {
    th: {
      title: "ห้องน้ำ 3",
      update: "อัปเดต",
      date: "วันที่",
      time: "เวลา",
      status: { available: "✅ ว่าง", occupied: "❌ ไม่ว่าง", cleaning: "🧹 ทำความสะอาด" },
      lines: {
        lastCleanTime: "ทำความสะอาดล่าสุด",
        lastCleanBy: "พนักงานทำความสะอาด",
        lastIncident: "จำนวนการใช้งาน",
        nextClean: "ทำความสะอาดครั้งถัดไป" 
      },
      qr: { title: "QR Feedback", caption: "สแกนเพื่อให้คะแนน/แจ้งปัญหา" },
      announce: "— ตัวอย่าง: โปรดรักษาความสะอาดร่วมกัน ขอบคุณค่ะ —",
    },
    en: {
      title: "Restroom 3",
      update: "update",
      date: "Date",
      time: "Time",
      status: { available: "✅ Available", occupied: "❌ Occupied", cleaning: "🧹 Cleaning" },
      lines: {
        lastCleanTime: "Last cleaned at",
        lastCleanBy: "Last cleaned by",
        lastIncident: "Usage Count",
        nextClean: "Next cleaning time"
      },
      qr: { title: "QR Feedback", caption: "Scan to rate / report" },
      announce: "— Example: Please help keep this area clean. Thank you! —",
    },
  };
  const L = lang === "th" ? i18n.th : i18n.en;

  // --- Mock data (replace with your real data feed) ---
  const meta = {
    title: L.title,
    // ใช้เวลาปัจจุบันแทนค่าคงที่
    date: currentDate,
    time: currentTime,
    lastCleanTime: "16:00",
    lastCleanBy: "คุณนิดา",
    lastIncident: "พบปัญหาน้ำรั่วเล็กน้อย ห้อง 2",
    cleanProgress: 10, // percent
    cleanDueTime: "18:00",
    usageCount: 8,
  };

  const rooms = [
    { id: 1, name: "Room 1", status: "available", noteTh: "พร้อมใช้งาน", noteEn: "Available now" },
    { id: 2, name: "Room 2", status: "occupied", noteTh: "ใช้งานไปแล้ว 8 นาที", noteEn: "In use for 8 min" },
    { id: 3, name: "Room 3", status: "cleaning", noteTh: "กำลังทำความสะอาด", noteEn: "Being cleaned" },
  ];

  // Status palette
  const statusMap = useMemo(
    () => ({
      available: {
        bg: "bg-emerald-50",
        border: "border-emerald-400",
        text: "text-emerald-700",
        ring: "ring-emerald-300/60",
      },
      occupied: {
        bg: "bg-rose-50",
        border: "border-rose-400",
        text: "text-rose-700",
        ring: "ring-rose-300/60",
      },
      cleaning: {
        bg: "bg-amber-50",
        border: "border-amber-400",
        text: "text-amber-700",
        ring: "ring-amber-300/60",
      },
    }),
    []
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-gradient-to-br from-neutral-50 via-white to-neutral-100 text-neutral-900">
      {/* Canvas wrapper with safe center and breathing room */}
      <div className="h-full w-full px-0 py-3 lg:py-4 grid grid-rows-[auto,1fr]">
        {/* Header bar */}
        <div className="px-4 sm:px-6 lg:px-8 grid grid-cols-2 lg:grid-cols-3 items-center gap-3">
          <div className="col-span-1">
            <h1 className="font-semibold tracking-tight leading-none text-[clamp(22px,2.7vw,44px)]">{meta.title}</h1>
          </div>
          <div className="hidden lg:flex" />
          <div className="col-span-1 lg:justify-self-end text-right">
            <div className="inline-flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3 rounded-3xl border border-neutral-200/80 bg-white/60 backdrop-blur px-5 py-3 shadow-md">
              <div className="text-[clamp(14px,1.5vw,18px)]"><span className="opacity-60">{L.update}</span> <span className="font-medium">{meta.lastCleanTime}</span></div>
              <div className="text-[clamp(14px,1.5vw,18px)]"><span className="opacity-60">{L.date}</span> <span className="font-medium">{meta.date}</span></div>
              <div className="text-[clamp(14px,1.5vw,18px)]"><span className="opacity-60">{L.time}</span> <span className="font-medium tabular-nums">{meta.time}</span></div>
            </div>
          </div>
        </div>

        {/* Main grid: left content + right sidebar */}
        <div className="mt-1 pl-4 sm:pl-6 lg:pl-8 pr-0 grid grid-cols-1 gap-6 h-full w-full">
          {/* Left column */}
          <div className="pr-0 md:pr-2">
            {/* Rooms row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-8">
              {rooms.map((r) => {
                const s = statusMap[r.status];
                return (
                  <div key={r.id} className={`relative rounded-2xl ${s.bg} border ${s.border} py-3 px-4 lg:py-4 lg:px-5 shadow-lg`}> 
                    <div className="text-center">
                      <div className="text-[clamp(16px,2vw,24px)] font-bold tracking-wide mb-3 text-black">{r.name}</div>
                      {/* Oval status badge */}
                      <div className={`mx-auto aspect-[2.8/1.5] w-[min(70%,220px)] rounded-full border-[3px] ${s.border} flex items-center justify-center bg-white ${s.text} shadow-md`}>
                        <div className="flex items-center gap-4">
                          <div className="text-[clamp(22px,2.5vw,28px)] font-bold flex items-center gap-2">
                            {L.status[r.status]}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 text-[clamp(12px,1.3vw,16px)] opacity-80">{lang === "th" ? (r.noteTh ?? r.note) : (r.noteEn ?? r.note)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* KPI Cards row including QR Feedback */}
            <div className="mt-2">
              <div className="grid grid-cols-5 gap-3">
                {/* Card: Last cleaned time */}
                <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-lg">
                  <div className="text-[clamp(13px,1.4vw,18px)] font-semibold text-center">{L.lines.lastCleanTime}</div>
                  <div className="mt-3 text-center font-bold tabular-nums text-[clamp(32px,6vw,64px)] leading-tight">{meta.lastCleanTime}</div>
                </div>

                {/* Card: Last cleaned by */}
                <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-lg">
                  <div className="text-[clamp(13px,1.4vw,18px)] font-semibold text-center">{L.lines.lastCleanBy}</div>
                  <div className="mt-2 text-center font-semibold text-[clamp(24px,4.5vw,48px)] leading-none">{meta.lastCleanBy}</div>
                </div>

                {/* Card: Usage count since last clean */}
                <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-lg">
                  <div className="text-[clamp(13px,1.4vw,18px)] font-semibold text-center">{L.lines.lastIncident}</div>
                  <div className="mt-3 text-center font-bold tabular-nums text-[clamp(32px,6vw,64px)] leading-tight">{meta.usageCount}</div>
                </div>

                {/* Card: Usage count since last clean */}
                <div className="rounded-2xl border border-neutral-200 bg-white/80 p-6 shadow-lg">
                  <div className="text-[clamp(13px,1.4vw,18px)] font-semibold text-center">{L.lines.nextClean}</div>
                  <div className="mt-3 text-center font-bold tabular-nums text-[clamp(32px,6vw,64px)] leading-tight">{meta.cleanDueTime}</div>
                </div>

                {/* QR Feedback box */}
                <div className="rounded-2xl border border-neutral-200 bg-white/85 backdrop-blur p-5 shadow-lg flex flex-col items-center justify-center">
                  <div className="text-[clamp(11px,1.2vw,14px)] font-medium">{L.qr.title}</div>
                  <div className="mt-2 mx-auto aspect-square w-full max-w-[140px] rounded-xl border-2 border-neutral-300 grid place-items-center">
                    <div className="text-[clamp(11px,1.1vw,13px)] opacity-60">(QR)</div>
                  </div>
                  <div className="mt-0.5 text-[clamp(11px,1.1vw,13px)] opacity-70">{L.qr.caption}</div>
                </div>
              </div>
            </div>
              
            {/* Announcement box */}
            <div className="mt-3">
              <div className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 min-h-[64px] flex items-center gap-3 shadow-sm text-[clamp(13px,1.5vw,18px)]">
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11v2a1 1 0 001 1h2l3 3v-10l-3 3H4a1 1 0 00-1 1z" />
                  <path d="M13 5v14" />
                </svg>
                <span className="text-neutral-800">{L.announce}</span>
              </div>
            </div>
          </div>
        </div>
      </div> 
    </div>
  );
}

function Line({ label, value }) {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <div className="shrink-0 text-[clamp(14px,1.6vw,18px)] font-medium">{label}</div>
        <div className="w-full border-b border-neutral-300/70" />
        <div className="text-[clamp(13px,1.4vw,16px)] opacity-80 min-w-[120px] text-right">{value ?? "—"}</div>
      </div>
    </div>
  );
}
