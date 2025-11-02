import React, { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Legend } from "recharts";
import { useNavigate } from "react-router-dom";
import bg from "./assets/bg.png";

// ===== Config =====
const DEFAULT_BASE = "http://172.20.10.2:8080";
const POLL_MS = 5000;
const TZ = "Asia/Bangkok";

// ทำ key วันรูปแบบ YYYY-MM-DD ตามโซนเวลาไทย
function todayKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date());
}

// initial โครงสร้างข้อมูลรายวัน
function makeEmptyDaily() {
  return {
    totalUsers: 0,
    totalUseMs: 0,
    cleanCount: 0,
    perHour: Array.from({ length: 24 }, (_, i) => ({
      time: String(i).padStart(2, "0"),
      users: 0,
    })),
    _prev: {
      lastCleanTsMs: 0,
      rooms: {
        1: { use: 0, ms: 0 },
        2: { use: 0, ms: 0 },
        3: { use: 0, ms: 0 },
      },
    },
  };
}

export default function ManagerPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("usage"); // usage | evaluationSummary
  const [base] = useState(() => DEFAULT_BASE.replace(/\/$/, ""));
  const [dayKey, setDayKey] = useState(todayKey());
  const [daily, setDaily] = useState(() => {
    const k = todayKey();
    const raw = localStorage.getItem("manager-agg-" + k);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {}
    }
    const empty = makeEmptyDaily();
    localStorage.setItem("manager-agg-" + k, JSON.stringify(empty));
    return empty;
  });

  // บันทึกข้อมูลรายวัน
  useEffect(() => {
    localStorage.setItem("manager-agg-" + dayKey, JSON.stringify(daily));
  }, [daily, dayKey]);

  // ตรวจว่าวันใหม่หรือยัง
  useEffect(() => {
    const id = setInterval(() => {
      const k = todayKey();
      if (k !== dayKey) {
        setDayKey(k);
        const raw = localStorage.getItem("manager-agg-" + k);
        if (raw) {
          try {
            setDaily(JSON.parse(raw));
            return;
          } catch {}
        }
        const empty = makeEmptyDaily();
        setDaily(empty);
        localStorage.setItem("manager-agg-" + k, JSON.stringify(empty));
      }
    }, 10000);
    return () => clearInterval(id);
  }, [dayKey]);

  // ดึงข้อมูลจาก backend
  const fetchingRef = useRef(false);
  useEffect(() => {
    async function fetchLatest() {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      try {
        const res = await fetch(`${base}/api/restroom/status/latest`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (!data.ok) throw new Error("Backend not ok");

        setDaily((prev) => {
          const now = new Date();
          const hourIdx = parseInt(
            new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now),
            10
          );

          const next = JSON.parse(JSON.stringify(prev));
          const lastCleanTs = data.last_clean_ts_ms ?? 0;
          if (lastCleanTs > 0 && lastCleanTs !== prev._prev.lastCleanTsMs) {
            next.cleanCount += 1;
            next._prev.lastCleanTsMs = lastCleanTs;
          }

          const prevRooms = prev._prev.rooms;
          (data.rooms || []).forEach((r) => {
            const id = r.room_id;
            const prevUse = prevRooms[id]?.use ?? 0;
            const prevMs = prevRooms[id]?.ms ?? 0;

            const du = Math.max(0, (r.use_count ?? 0) - prevUse);
            const dms = Math.max(0, (r.total_use_ms ?? 0) - prevMs);

            if (du > 0) {
              next.totalUsers += du;
              next.perHour[hourIdx].users += du;
            }
            if (dms > 0) next.totalUseMs += dms;
            next._prev.rooms[id] = { use: r.use_count ?? 0, ms: r.total_use_ms ?? 0 };
          });

          return next;
        });
      } catch (e) {
        console.error(e);
      } finally {
        fetchingRef.current = false;
      }
    }

    fetchLatest();
    const id = setInterval(fetchLatest, POLL_MS);
    return () => clearInterval(id);
  }, [base]);

  // สรุปข้อมูลวันนี้
  const summary = useMemo(() => {
    const totalUsers = daily.totalUsers;
    const totalMin = daily.totalUseMs / 60000;
    const avgPerUser = totalUsers > 0 ? totalMin / totalUsers : 0;
    return {
      totalUsers,
      totalMin: totalMin.toFixed(0),
      avgPerUser: avgPerUser.toFixed(1),
      cleanCount: daily.cleanCount,
    };
  }, [daily]);

  // ข้อมูลสรุปผลการประเมิน (จะถูก fetch จาก backend)
  const [evaluationData, setEvaluationData] = useState([]);
  const [selectedDate, setSelectedDate] = useState("all");
  // ดึงข้อมูลการประเมินจาก backend (ทุก POLL_MS)
  useEffect(() => {
    async function fetchEvaluation() {
      try {
        const res = await fetch(`${base}/api/evaluation`, { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data = await res.json();
        if (!data.ok) throw new Error("Backend not ok");
        // data.data = [{ date: "...", scores: {...} }, ...]
        setEvaluationData(data.data);
      } catch (err) {
        console.error("fetchEvaluation error:", err);
      }
    }

    fetchEvaluation();
    const id = setInterval(fetchEvaluation, POLL_MS);
    return () => clearInterval(id);
  }, [base]);

  const filteredRecords =
    selectedDate === "all"
      ? evaluationData
      : evaluationData.filter((r) => r.date === selectedDate);

  const criteria = ["ความสะอาด", "ทิชชู่", "พื้น", "กลิ่น"];
  const filteredSummaryData = criteria.map((c) => {
    let total = 0,
      count = 0;
    filteredRecords.forEach((r) => {
      if (r.scores[c]) {
        total += r.scores[c];
        count++;
      }
    });
    return { criterion: c, average: count ? (total / count).toFixed(2) : 0 };
  });

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center p-0"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="w-full max-w-6xl mx-auto px-8 pt-14 pb-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-700 via-purple-500 to-blue-600 bg-clip-text text-transparent drop-shadow-2xl mb-2">
              Manager Dashboard
            </h1>
            <p className="text-lg text-blue-700 font-medium drop-shadow">
              แดชบอร์ดสำหรับผู้จัดการ (ข้อมูล “เฉพาะวันนี้” และรีเซ็ตอัตโนมัติ)
            </p>
          </div>
          <div className="flex gap-4">
            <button
              className="px-6 py-2 bg-gradient-to-r from-blue-400/80 to-blue-600/80 text-white border border-blue-400 rounded-xl shadow-lg font-semibold"
              onClick={() => navigate("/overview")}
            >
              Overview
            </button>
            <button
              className="px-6 py-2 bg-gradient-to-r from-pink-400/80 to-pink-600/80 text-white border border-pink-400 rounded-xl shadow-lg font-semibold"
              onClick={() => navigate("/")}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex w-full max-w-5xl mx-auto rounded-2xl bg-white/80 backdrop-blur-lg border-2 border-blue-100 overflow-hidden mb-10 shadow-lg">
          {[
            { key: "usage", label: "📈 อัตราการใช้งานห้องน้ำ" },
            { key: "evaluationSummary", label: "📊 สรุปผลการประเมิน" },
          ].map((tab, i) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-lg font-semibold transition-all duration-200 ${
                activeTab === tab.key
                  ? "bg-gradient-to-r from-blue-100 via-blue-50 to-blue-200 text-blue-700 shadow-inner scale-105 z-10"
                  : "bg-white/0 text-gray-700 hover:bg-blue-50"
              }`}
              style={{
                borderRadius:
                  i === 0
                    ? "2rem 0 0 2rem"
                    : i === 1
                    ? "0 2rem 2rem 0"
                    : "0",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* === Tab: Usage === */}
        {activeTab === "usage" && (
          <div className="bg-white/90 rounded-3xl shadow-lg p-8 border border-blue-200">
            <h2 className="text-2xl font-bold text-center text-sky-800 mb-4">
              วิเคราะห์พฤติกรรมการใช้ห้องน้ำ (เฉพาะวันนี้)
            </h2>
            <p className="text-center text-slate-600 mb-8">
              ระบบสะสมข้อมูลจาก {POLL_MS / 1000}s polling และรีเซ็ตอัตโนมัติเมื่อข้ามวัน ({dayKey})
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              {[
                { label: "จำนวนผู้ใช้รวม", value: `${summary.totalUsers} คน` },
                { label: "เวลาการใช้รวม", value: `${summary.totalMin} นาที` },
                { label: "เฉลี่ยต่อคน", value: `${summary.avgPerUser} นาที` },
                { label: "ทำความสะอาดแล้ว", value: `${summary.cleanCount} ครั้ง` },
              ].map((item, i) => (
                <div key={i} className="bg-white/80 shadow-md rounded-2xl p-4 text-center border border-blue-100">
                  <h2 className="text-blue-700 font-semibold">{item.label}</h2>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{item.value}</p>
                </div>
              ))}
            </div>
            <div className="bg-white/90 rounded-2xl shadow-lg p-6 border border-blue-100">
              <h2 className="text-xl font-semibold text-blue-800 mb-4 text-center">
                ช่วงเวลาที่มีการใช้ห้องน้ำมากที่สุด (Peak Time วันนี้)
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={daily.perHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="time" label={{ value: "เวลา (ชั่วโมง)", position: "insideBottom", offset: -5 }} />
                  <YAxis allowDecimals={false} label={{ value: "จำนวนผู้ใช้", angle: -90, position: "insideLeft" }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="users" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* === Tab: Evaluation Summary === */}
        {activeTab === "evaluationSummary" && (
          <div className="bg-white/90 rounded-3xl shadow-lg p-8 border border-blue-200">
            <h2 className="text-2xl font-bold text-blue-900 mb-6">📊 สรุปผลการประเมิน</h2>
            {evaluationData.length === 0 ? (
              <p className="text-center text-gray-500">ยังไม่มีข้อมูลการประเมิน</p>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                  <h3 className="text-lg font-semibold text-blue-900">🗓 เลือกวันที่ต้องการดู</h3>
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="border border-blue-300 rounded-lg px-4 py-2 text-blue-800 bg-white shadow-sm focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="all">ทั้งหมด</option>
                    {Array.from(new Set(evaluationData.map((r) => r.date))).map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                </div>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={filteredSummaryData} barSize={120} barGap={8}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="criterion" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="average" fill="#3b82f6" name="คะแนนเฉลี่ย" />
                  </BarChart>
                </ResponsiveContainer>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
