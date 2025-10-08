import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const data = [
  { time: "10", users: 8 },
  { time: "11", users: 15 },
  { time: "12", users: 28 },
  { time: "13", users: 22 },
  { time: "14", users: 12 },
  { time: "15", users: 9 },
];

export default function BathroomUsageAnalysis() {
  return (
    <div
      className="min-h-screen w-screen flex justify-center items-center p-6"
      style={{
        background: "linear-gradient(135deg, #e0f7ff 0%, #f0faff 60%, #ffffff 100%)", // 💙 พื้นหลังฟ้าอ่อนไล่เฉด
      }}
    >
      <div className="bg-white/90 backdrop-blur-md w-full max-w-5xl mx-auto rounded-3xl shadow-2xl p-8 border border-sky-200">
        {/* หัวเรื่อง */}
        <h1 className="text-3xl font-bold text-center mb-2 text-sky-800">
          วิเคราะห์พฤติกรรมการใช้ห้องน้ำ
        </h1>
        <p className="text-center text-slate-600 mb-8">
          แสดงข้อมูลการใช้งานรวม ระยะเวลาเฉลี่ย และช่วงเวลา Peak Time
        </p>

        {/* สรุปข้อมูลตัวเลข */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white shadow-md rounded-2xl p-4 text-center border border-sky-100">
            <h2 className="text-sky-700 font-semibold">จำนวนผู้ใช้รวม</h2>
            <p className="text-2xl font-bold text-sky-900 mt-1">94 คน</p>
          </div>
          <div className="bg-white shadow-md rounded-2xl p-4 text-center border border-sky-100">
            <h2 className="text-sky-700 font-semibold">เวลาการใช้รวม</h2>
            <p className="text-2xl font-bold text-sky-900 mt-1">180 นาที</p>
          </div>
          <div className="bg-white shadow-md rounded-2xl p-4 text-center border border-sky-100">
            <h2 className="text-sky-700 font-semibold">เฉลี่ยต่อคน</h2>
            <p className="text-2xl font-bold text-sky-900 mt-1">1.9 นาที</p>
          </div>
          <div className="bg-white shadow-md rounded-2xl p-4 text-center border border-sky-100">
            <h2 className="text-sky-700 font-semibold">ทำความสะอาดแล้ว</h2>
            <p className="text-2xl font-bold text-sky-900 mt-1">3 ครั้ง</p>
          </div>
        </div>

        {/* กราฟแสดงช่วงเวลา Peak */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-sky-100">
          <h2 className="text-xl font-semibold text-sky-800 mb-4 text-center">
            ช่วงเวลาที่มีการใช้ห้องน้ำมากที่สุด (Peak Time)
          </h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="time"
                label={{
                  value: "เวลา (ชั่วโมง)",
                  position: "insideBottom",
                  offset: -5,
                }}
              />
              <YAxis
                label={{
                  value: "จำนวนผู้ใช้",
                  angle: -90,
                  position: "insideLeft",
                }}
              />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="users"
                stroke="#0ea5e9"
                strokeWidth={3}
                dot={{ r: 5, fill: "#0284c7" }}
                activeDot={{ r: 7 }}
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-center text-slate-600 mt-3">
            🔹 ช่วงเวลาที่มีผู้ใช้มากที่สุดคือเวลา <b>12:00 น.</b>
          </p>
        </div>
      </div>
    </div>
  );
}
