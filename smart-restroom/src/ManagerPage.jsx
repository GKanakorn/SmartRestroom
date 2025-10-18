import React, { useEffect, useMemo, useRef, useState } from "react";
import { Save } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useNavigate } from "react-router-dom";
import bg from "./assets/bg.png";

// ===== Config =====
const DEFAULT_BASE = "http://172.20.10.2:8080";
const POLL_MS = 5000;
const TZ = "Asia/Bangkok";

// ทำ key วันรูปแบบ YYYY-MM-DD ตามโซนเวลาไทย
function todayKey() {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(new Date()); // e.g., "2025-10-18"
}

// initial โครงสร้างข้อมูลรายวัน
function makeEmptyDaily() {
  return {
    // สรุป
    totalUsers: 0,        // จำนวนผู้ใช้รวม (ครั้ง)
    totalUseMs: 0,        // เวลาการใช้รวม (ms)
    cleanCount: 0,        // จำนวนครั้งกดทำความสะอาดวันนี้ (นับจาก last_clean_ts_ms เปลี่ยน)
    // กราฟ per-hour (00..23)
    perHour: Array.from({ length: 24 }, (_, i) => ({ time: String(i).padStart(2, "0"), users: 0 })),
    // เก็บสแน็ปช็อตล่าสุดเพื่อลดนับซ้ำ
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
  const [activeTab, setActiveTab] = useState("usage");

  // ===== Backend base =====
  const [base] = useState(() => DEFAULT_BASE.replace(/\/$/, ""));

  // ===== สถานะรายวัน — โหลด/เซฟ localStorage ตามวัน =====
  const [dayKey, setDayKey] = useState(todayKey());
  const [daily, setDaily] = useState(() => {
    const k = todayKey();
    const raw = localStorage.getItem("manager-agg-" + k);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch {
        // ถ้าอ่านพัง reset ใหม่
      }
    }
    const empty = makeEmptyDaily();
    localStorage.setItem("manager-agg-" + k, JSON.stringify(empty));
    return empty;
  });

  // เซฟเมื่อ daily เปลี่ยน
  useEffect(() => {
    localStorage.setItem("manager-agg-" + dayKey, JSON.stringify(daily));
  }, [daily, dayKey]);

  // ตรวจข้ามวัน -> reset ใหม่
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
        setDaily(makeEmptyDaily());
        localStorage.setItem("manager-agg-" + k, JSON.stringify(makeEmptyDaily()));
      }
    }, 10000);
    return () => clearInterval(id);
  }, [dayKey]);

  // ===== ดึงข้อมูลล่าสุดจาก backend และคำนวณ delta =====
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

        // เตรียมค่าเดิม
        setDaily((prev) => {
          const now = new Date();
          const hourIdx = parseInt(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(now), 10);

          // clone (immutable-ish)
          const next = JSON.parse(JSON.stringify(prev));

          // นับ clean ถ้า last_clean_ts_ms เปลี่ยนและเป็นวันเดียวกัน
          const lastCleanTs = data.last_clean_ts_ms ?? 0;
          if (lastCleanTs > 0 && lastCleanTs !== prev._prev.lastCleanTsMs) {
            next.cleanCount += 1;
            next._prev.lastCleanTsMs = lastCleanTs;
          }

          // สร้าง map ค่าเดิมห้อง
          const prevRooms = prev._prev.rooms;

          // rooms: delta use_count และ delta total_use_ms
          (data.rooms || []).forEach((r) => {
            const id = r.room_id;
            const prevUse = prevRooms[id]?.use ?? 0;
            const prevMs  = prevRooms[id]?.ms ?? 0;

            const du = Math.max(0, (r.use_count ?? 0) - prevUse);
            const dms = Math.max(0, (r.total_use_ms ?? 0) - prevMs);

            if (du > 0) {
              next.totalUsers += du;
              // อัปเดตกราฟตามชั่วโมงปัจจุบัน
              next.perHour[hourIdx].users += du;
            }
            if (dms > 0) {
              next.totalUseMs += dms;
            }

            // เก็บ prev ใหม่
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

    // ดึงทันที + ตั้ง polling
    fetchLatest();
    const id = setInterval(fetchLatest, POLL_MS);
    return () => clearInterval(id);
  }, [base]);

  // ===== UI: การ์ดสรุปจาก daily =====
  const summary = useMemo(() => {
    const totalUsers = daily.totalUsers;
    const totalMin = daily.totalUseMs / 60000;
    const avgPerUser = totalUsers > 0 ? (totalMin / totalUsers) : 0;
    return {
      totalUsers,
      totalMin: totalMin.toFixed(0),
      avgPerUser: avgPerUser.toFixed(1),
      cleanCount: daily.cleanCount,
    };
  }, [daily]);

  // ===== แท็บประเมิน (ของเดิมคงไว้) =====
  const employees = ["คุณนิดา", "คุณมานี", "คุณสมชาย"];
  const [selectedEmp, setSelectedEmp] = useState("");
  const [scores, setScores] = useState({});
  const criteria = ["ความสะอาด", "ทิชชู่", "พื้น", "กลิ่น"];
  const handleScore = (criterion, value) => setScores((p) => ({ ...p, [criterion]: value }));
  const handleSave = () => {
    if (!selectedEmp) return alert("⚠️ กรุณาเลือกพนักงานก่อนบันทึก");
    const incomplete = criteria.filter((c) => !scores[c]);
    if (incomplete.length > 0) return alert("⚠️ กรุณาให้คะแนนครบทุกหัวข้อก่อนบันทึก");
    alert("✅ บันทึกผลการประเมินเรียบร้อยแล้ว!");
  };

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
              className="px-6 py-2 bg-gradient-to-r from-blue-400/80 to-blue-600/80 hover:from-blue-500 hover:to-blue-700 text-white border border-blue-400 rounded-xl shadow-lg shadow-blue-500/40 hover:shadow-blue-500/80 transition-all duration-300 backdrop-blur-md font-semibold"
              onClick={() => navigate("/overview")}
            >
              Overview
            </button>
            <button
              className="px-6 py-2 bg-gradient-to-r from-pink-400/80 to-pink-600/80 hover:from-pink-500 hover:to-pink-700 text-white border border-pink-400 rounded-xl shadow-lg shadow-pink-500/40 hover:shadow-pink-500/80 transition-all duration-300 backdrop-blur-md font-semibold"
              onClick={() => navigate("/")}
            >
              Logout
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex w-full max-w-4xl mx-auto rounded-2xl bg-white/80 backdrop-blur-lg border-2 border-blue-100 overflow-hidden mb-10 shadow-lg">
          <button
            onClick={() => setActiveTab("usage")}
            className={`flex-1 py-3 text-lg font-semibold transition-all duration-200 ${
              activeTab === "usage"
                ? "bg-gradient-to-r from-blue-200 via-blue-100 to-blue-50 text-blue-700 shadow-inner scale-105 z-10"
                : "bg-white/0 text-gray-700 hover:bg-blue-50"
            }`}
            style={{ borderRadius: activeTab === "usage" ? "2rem 0 0 2rem" : "2rem 0 0 2rem" }}
          >
            📊 อัตราการใช้งานห้องน้ำ (วันนี้)
          </button>
          <button
            onClick={() => setActiveTab("evaluation")}
            className={`flex-1 py-3 text-lg font-semibold transition-all duration-200 ${
              activeTab === "evaluation"
                ? "bg-gradient-to-r from-blue-50 via-blue-100 to-blue-200 text-blue-700 shadow-inner scale-105 z-10"
                : "bg-white/0 text-gray-700 hover:bg-blue-50"
            }`}
            style={{ borderRadius: activeTab === "evaluation" ? "0 2rem 2rem 0" : "0 2rem 2rem 0" }}
          >
            🧹 ประเมินพนักงาน
          </button>
        </div>

        {/* Usage Tab */}
        {activeTab === "usage" && (
          <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-lg p-8 border border-blue-200">
            <h2 className="text-2xl font-bold text-center text-sky-800 mb-4">
              วิเคราะห์พฤติกรรมการใช้ห้องน้ำ (เฉพาะวันนี้)
            </h2>
            <p className="text-center text-slate-600 mb-8">
              ระบบสะสมข้อมูลจาก {POLL_MS / 1000}s polling และรีเซ็ตอัตโนมัติเมื่อข้ามวัน ({dayKey})
            </p>

            {/* ตัวเลขสรุป */}
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

            {/* กราฟ per-hour */}
            <div className="bg-white/90 rounded-2xl shadow-lg p-6 border border-blue-100">
              <h2 className="text-xl font-semibold text-blue-800 mb-4 text-center">
                ช่วงเวลาที่มีการใช้ห้องน้ำมากที่สุด (Peak Time วันนี้)
              </h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={daily.perHour}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="time"
                    label={{ value: "เวลา (ชั่วโมง)", position: "insideBottom", offset: -5 }}
                  />
                  <YAxis
                    allowDecimals={false}
                    label={{ value: "จำนวนผู้ใช้", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip />
                  <Line type="monotone" dataKey="users" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4, fill: "#0284c7" }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
              <p className="text-center text-blue-600 mt-3">
                🔹 ระบบจะเพิ่มจำนวนในชั่วโมงปัจจุบันเมื่อพบการใช้งานใหม่ (delta ของ use_count)
              </p>
            </div>
          </div>
        )}

        {/* Evaluation Tab (ของเดิม) */}
        {activeTab === "evaluation" && (
          <div className="bg-white/90 backdrop-blur-md rounded-3xl shadow-lg p-8 border border-blue-200">
            <div className="flex justify-between items-center border-b border-blue-200 pb-4 mb-6">
              <h2 className="text-2xl font-bold text-blue-900 tracking-wide drop-shadow">🧹 Manager Evaluation</h2>
              <div className="bg-blue-100 px-5 py-2 rounded-2xl text-blue-700 font-semibold shadow-inner border border-blue-200">
                ประเมินห้องน้ำ
              </div>
            </div>

            {/* เลือกพนักงาน */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 w-full">
              <label className="text-sky-900 font-semibold w-full sm:w-32">พนักงาน</label>
              <select
                value={selectedEmp}
                onChange={(e) => setSelectedEmp(e.target.value)}
                className="border border-blue-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300 flex-1 w-full sm:w-auto bg-blue-50/40 text-blue-900 shadow-inner transition-all duration-200 hover:ring-1 hover:ring-blue-400"
              >
                <option value="">เลือกพนักงาน</option>
                {employees.map((emp) => (
                  <option key={emp} value={emp}>{emp}</option>
                ))}
              </select>
            </div>

            {/* ตารางให้คะแนน */}
            <div className="overflow-auto">
              <table className="w-full border-separate border-spacing-y-3 text-center">
                <thead>
                  <tr className="bg-blue-400/80">
                    <th className="text-left text-white w-32 p-3 rounded-l-xl font-semibold">หัวข้อ</th>
                    <th className="text-center text-white font-semibold rounded-r-xl" colSpan={5}>คะแนน (1–5)</th>
                  </tr>
                </thead>
                <tbody>
                  {criteria.map((c, idx) => (
                    <tr key={c} className={`${idx % 2 === 0 ? "bg-sky-100/40" : "bg-sky-100/60"} transition-all duration-200 hover:bg-sky-50`}>
                      <td className="text-left text-sky-900 font-medium px-4 py-3 rounded-l-lg">{c}</td>
                      {[1, 2, 3, 4, 5].map((n) => {
                        const isSelected = scores[c] === n;
                        return (
                          <td key={n} className="px-2 py-2">
                            <button
                              onClick={() => handleScore(c, n)}
                              className={`w-12 h-12 rounded-full flex justify-center items-center font-bold text-lg border-2 transition-all duration-200 ${
                                isSelected ? " bg-gray-900 text-black-800 shadow-lg scale-100" : " bg-white text-blue-500 shadow-lg scale-90"
                              }`}
                            >
                              {n}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ปุ่มบันทึก */}
            <div className="flex justify-end mt-6">
              <button
                onClick={handleSave}
                className="flex flex-col items-center justify-center bg-gradient-to-r from-blue-400/80 to-blue-600/80 
             hover:from-blue-500 hover:to-blue-700 text-white font-bold px-8 py-3 rounded-xl 
             shadow-md hover:shadow-blue-400/50 transition-all duration-200 hover:scale-105 border border-blue-500"
              >
                <div className="flex items-center gap-2 text-base">
                  <Save size={16} />
                  <span>บันทึกผลการประเมิน</span>
                </div>
                <span className="text-xs font-normal opacity-90 mt-1">Save Evaluation</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}