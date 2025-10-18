import React, { useMemo, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";
import bg from "./assets/bg.png";

// === Config ===
const DEFAULT_BASE = "http://172.20.10.2:8080";
const POLL_MS = 2000;
const TZ = "Asia/Bangkok";
const CLEAN_INTERVAL_MIN = 20;
const CLEAN_INTERVAL_MS = CLEAN_INTERVAL_MIN * 60 * 1000;

export default function Overview() {
  const navigate = useNavigate();

  // ---- เวลา & ภาษา ----
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const [lang, setLang] = useState("th");
  useEffect(() => {
    const id = setInterval(() => setLang((p) => (p === "th" ? "en" : "th")), 5000);
    return () => clearInterval(id);
  }, []);

  // ---- i18n ----
  const i18n = {
    th: {
      title: "ห้องน้ำ",
      update: "อัปเดตล่าสุด",
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
      date: "วันที่ & เวลา",
      availableRooms: "ห้องน้ำว่าง",
      onlyAvail: "พร้อมใช้งาน",
      cleaningOverlay: "กำลังทำความสะอาด",
    },
    en: {
      title: "Restroom",
      update: "Last updated",
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
      date: "Date & Time",
      availableRooms: "Available Rooms",
      onlyAvail: "Available now",
      cleaningOverlay: "Cleaning in progress",
    },
  };
  const L = lang === "th" ? i18n.th : i18n.en;

  // ---- ฟอร์แมตเวลา ----
  const fmtNowDate = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { timeZone: TZ }).format(now);
  const fmtNowTime = new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: TZ,
  }).format(now);

  const formatDT = (date) => {
    const locale = lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB";
    try {
      return new Intl.DateTimeFormat(locale, {
        timeZone: TZ, dateStyle: "medium", timeStyle: "medium", hour12: false,
      }).format(date);
    } catch {
      return date.toLocaleString(lang === "th" ? "th-TH" : "en-GB", { timeZone: TZ });
    }
  };

  const formatTimeOnly = (date) =>
    new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
      timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(date);

  // ---- BASE URL ----
  const [base] = useState(() => DEFAULT_BASE.replace(/\/$/, ""));

  // ---- สถานะจาก backend ----
  const [cleaningRequired, setCleaningRequired] = useState(false);
  const [rooms, setRooms] = useState([
    { id: 1, name: L.roomNames[0], status: "available", noteTh: "—", noteEn: "—", use: 0, totalMs: 0 },
    { id: 2, name: L.roomNames[1], status: "available", noteTh: "—", noteEn: "—", use: 0, totalMs: 0 },
    { id: 3, name: L.roomNames[2], status: "available", noteTh: "—", noteEn: "—", use: 0, totalMs: 0 },
  ]);
  const [lastPacketAt, setLastPacketAt] = useState(null);

  // เวลา “ทำความสะอาดล่าสุด” (เก็บทั้งแบบข้อความและ millis จริง)
  const [lastCleanReal, setLastCleanReal] = useState("—");  // ไม่ใช้แสดงแล้ว แต่เก็บไว้ได้
  const [lastCleanRealMs, setLastCleanRealMs] = useState(null);

  // --- จับ "เวลาเริ่มเข้า" ของแต่ละห้อง (ใช้ฝั่ง FE) ---
  const sessionStartRef = useRef({ 1: null, 2: null, 3: null });

  // ---- ดึงข้อมูลล่าสุด ----
  const fetchLatest = async () => {
    try {
      const res = await fetch(`${base}/api/restroom/status/latest`, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data.ok) throw new Error("Backend not ok");

      setCleaningRequired(!!data.cleaning_required);

      const ts_ms = data.ts_ms;
      const last_clean_ms = data.last_clean_ts_ms;
      if (typeof ts_ms === "number" && typeof last_clean_ms === "number") {
        // ประมาณ "เวลาจริง" ตอนกดปุ่ม
        const delta = ts_ms - last_clean_ms;
        const estimateMs = Date.now() - delta;
        setLastCleanReal(formatDT(new Date(estimateMs)));
        setLastCleanRealMs(estimateMs);
      } else {
        setLastCleanReal("—");
        setLastCleanRealMs(null);
      }

      setLastPacketAt(new Date());

      // สร้างสถานะใหม่ และอัปเดต sessionStart เมื่อมี transition -> occupied
      const prevRooms = rooms;
      const mapState = (s) => (s === "vacant" ? "available" : s === "occupied" ? "occupied" : "cleaning");

      const next = [1, 2, 3].map((rid, i) => {
        const r = (data.rooms || []).find((x) => x.room_id === rid);
        const status = r ? mapState(r.state) : "available";
        const useCount = r ? r.use_count : 0;
        const totalMs = r ? r.total_use_ms : 0;

        // transition detection
        const prevStatus = prevRooms[i]?.status ?? "available";
        if (status === "occupied" && prevStatus !== "occupied") {
          sessionStartRef.current[rid] = Date.now();
        }
        if (status !== "occupied" && prevStatus === "occupied") {
          sessionStartRef.current[rid] = null;
        }

        const noteTh =
          status === "occupied"
            ? `กำลังใช้งาน (รวม ${(totalMs / 60000).toFixed(1)} นาที)`
            : status === "cleaning"
            ? "กำลังทำความสะอาด"
            : L.onlyAvail;
        const noteEn =
          status === "occupied"
            ? `In use (total ${(totalMs / 60000).toFixed(1)} min)`
            : status === "cleaning"
            ? "Being cleaned"
            : L.onlyAvail;

        return {
          id: rid,
          name: (lang === "th" ? i18n.th : i18n.en).roomNames[i],
          status,
          noteTh,
          noteEn,
          use: useCount,
          totalMs,
        };
      });

      setRooms(next);
    } catch (e) {
      console.error(e);
    }
  };

  // ---- polling ----
  useEffect(() => {
    fetchLatest();
    const id = setInterval(fetchLatest, POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  // ---- สไตล์สถานะห้อง ----
  const statusMap = useMemo(
    () => ({
      available: { bg: "bg-green-200/100", glow: "shadow-md shadow-emerald-500/20" },
      occupied: { bg: "bg-rose-200/100", glow: "shadow-md shadow-rose-500/20" },
      cleaning: { bg: "bg-amber-200/70", glow: "shadow-md shadow-amber-500/20" },
    }),
    []
  );

  // ---- รอบทำความสะอาดถัดไป ----
  const nextCleanTimeText = useMemo(() => {
    const nowMs = now.getTime();
    const currentSlotStart = Math.floor(nowMs / CLEAN_INTERVAL_MS) * CLEAN_INTERVAL_MS;
    let candidate = currentSlotStart + CLEAN_INTERVAL_MS;
    if (
      typeof lastCleanRealMs === "number" &&
      lastCleanRealMs >= currentSlotStart &&
      lastCleanRealMs < candidate
    ) {
      candidate += CLEAN_INTERVAL_MS;
    }
    return formatTimeOnly(new Date(candidate));
  }, [now, lastCleanRealMs, lang]);

  // ---- ทำความสะอาดล่าสุด: แสดง HH:mm เท่านั้น ----
  const lastCleanTimeOnly = useMemo(() => {
    return typeof lastCleanRealMs === "number" ? formatTimeOnly(new Date(lastCleanRealMs)) : "—";
  }, [lastCleanRealMs, lang]);

  // ---- meta ----
  const meta = {
    title: L.title,
    lastCleanTime: lastCleanTimeOnly, // ใช้ HH:mm เท่านั้น
    lastCleanBy: lang === "th" ? "—" : "—",
    usageCount: rooms.reduce((s, r) => s + (r.use || 0), 0),
    cleanDueTime: nextCleanTimeText,
  };

  const availableCount = rooms.filter((r) => r.status === "available").length;
  const lastUpdateTimeOnly = lastPacketAt
    ? new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", {
        timeZone: TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }).format(lastPacketAt)
    : "—";
  const nowDateTime = `${fmtNowDate} ${fmtNowTime}`;

  // เพิ่มเวลานับ (mm:ss) ตอน occupied
  const displayRooms = rooms.map((r) => {
    if (r.status !== "occupied") return { ...r, elapsedText: "" };
    const t0 = sessionStartRef.current[r.id];
    if (!t0) return { ...r, elapsedText: "" };
    const elapsed = Math.max(0, Date.now() - t0);
    const mm = String(Math.floor(elapsed / 60000)).padStart(2, "0");
    const ss = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
    return { ...r, elapsedText: ` (${mm}:${ss})` };
  });

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
      {/* Back */}
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
        <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
          {/* ซ้ายบน: “ห้องน้ำว่าง” */}
          <div className="rounded-2xl border border-emerald-300/60 bg-emerald-200/80 backdrop-blur-md px-6 py-4 drop-shadow-md shadow-md text-emerald-900
             flex flex-col items-center justify-center text-center min-h-[120px]">
            <div className="text-sm md:text-base opacity-80">{L.availableRooms}</div>
            <div className="leading-none font-extrabold tabular-nums" style={{ fontSize: "64px", lineHeight: "0.9" }}>
              {availableCount}
            </div>
          </div>

          {/* ขวาบน: Last update + Date&Time */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="rounded-full border border-white/20 bg-white/70 backdrop-blur-md px-4 py-2 drop-shadow-sm shadow-sm">
              <span className="text-sm text-slate-600">{L.update}</span>
              <span className="ml-2 font-semibold tabular-nums text-sm md:text-base">{lastUpdateTimeOnly}</span>
            </div>
            <div className="rounded-full border border-white/20 bg-white/70 backdrop-blur-md px-4 py-2 drop-shadow-sm shadow-sm">
              <span className="text-sm text-slate-600">{L.date}</span>
              <span className="ml-2 font-semibold tabular-nums text-sm md:text-base">{nowDateTime}</span>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex flex-1 gap-6 w-full">
          <div className="flex-1 flex flex-col gap-8">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {displayRooms.map((r) => (
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
        <div className="mt-2 rounded-2xl border-l-5 border-orange-400 bg-orange-200/70 px-6 py-4 text-base text-slate-700 shadow-md shadow-orange-500/20 w-full">
          <div className="font-medium mb-1">📢 {lang === "th" ? "ประกาศ" : "Announcement"}</div>
          <div className="text-slate-500 text-base">{i18n[lang].announce}</div>
        </div>
      </div>

      {/* ===== Overlay: Cleaning Required ===== */}
      {cleaningRequired && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 18 }}
            className="rounded-3xl px-10 py-12 bg-white text-center shadow-2xl border-4 border-amber-400"
          >
            <div className="text-4xl md:text-6xl font-extrabold text-amber-700 drop-shadow">
              {L.cleaningOverlay}
            </div>
            <div className="mt-4 text-slate-600">
              {lang === "th" ? "โปรดรอสักครู่ ขณะนี้อยู่ในช่วงทำความสะอาด" : "Please wait. Restroom is being cleaned."}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function RoomCard({ room, statusMap, L, lang }) {
  const s = statusMap[room.status];

  // ——— กรอบวงกลม: แสดงเฉพาะสถานะล้วน ๆ (ไม่ใส่เวลา) ———
  const statusText =
    room.status === "available"
      ? L.status.available
      : room.status === "occupied"
      ? L.status.occupied
      : L.status.cleaning;

  // ——— บรรทัดล่าง: ถ้า occupied ให้แสดง “In use (mm:ss)” / “กำลังใช้งาน (mm:ss)” ———
  const bottomLine =
    room.status === "available"
      ? L.onlyAvail
      : room.status === "occupied"
      ? (lang === "th" ? `กำลังใช้งาน${room.elapsedText || ""}` : `In use${room.elapsedText || ""}`)
      : (lang === "th" ? room.noteTh : room.noteEn);

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

        {/* กรอบวงกลมสถานะ — แสดงทุกเคส */}
        <div className="w-full max-w-[240px] rounded-full p-4 border border-white/20 bg-white/70 grid place-items-center">
          <div className="font-semibold text-xl">{statusText}</div>
        </div>

        {/* บรรทัดล่าง */}
        <div className="text-sm text-slate-500">{bottomLine}</div>

        {/* ตัวเลขสรุป */}
        <div className="text-xs text-slate-500">
          {lang === "th"
            ? `ใช้ไป ${room.use} ครั้ง • รวม ${(room.totalMs / 60000).toFixed(1)} นาที`
            : `Uses ${room.use} • Total ${(room.totalMs / 60000).toFixed(1)} min`}
        </div>
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
      <div className="mt-3 font-semibold text-2xl md:text-3xl tabular-nums text-slate-800 break-words">
        {value}
      </div>
    </motion.div>
  );
}