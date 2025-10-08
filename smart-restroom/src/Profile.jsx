import React from "react";

export default function HousekeeperProfile() {
  const housekeepers = [
    { name: "สมศรี", position: "แม่บ้าน", contact: "081-111-1111" },
    { name: "มาลี", position: "แม่บ้าน", contact: "082-222-2222" },
    { name: "อมร", position: "แม่บ้าน", contact: "083-333-3333" },
  ];

  const schedule = [
    { time: "08:00 - 09:00", area: "ห้องน้ำชาย ชั้น 1", assigned: "สมศรี" },
    { time: "09:00 - 10:00", area: "ห้องน้ำหญิง ชั้น 1", assigned: "มาลี" },
    { time: "10:00 - 11:00", area: "โถงกลาง ชั้น 1", assigned: "อมร" },
    { time: "11:00 - 12:00", area: "ห้องน้ำชาย ชั้น 2", assigned: "สมศรี" },
    { time: "13:00 - 14:00", area: "ห้องน้ำหญิง ชั้น 2", assigned: "มาลี" },
    { time: "14:00 - 15:00", area: "โถงกลาง ชั้น 2", assigned: "อมร" },
    { time: "15:00 - 16:00", area: "ตรวจความสะอาดรวม", assigned: "ทุกคน" },
  ];

  const profile = housekeepers[0]; // สมมติเปิดหน้า "สมศรี"

  // ✅ กรองเฉพาะของสมศรี + พื้นที่ที่เป็นห้องน้ำ
  const filteredSchedule = schedule.filter(
    (task) =>
      task.assigned === profile.name && task.area.includes("ห้องน้ำ")
  );

  return (
    <div className="min-h-screen w-screen bg-sky-100 flex justify-center items-center p-6 font-sans">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-sky-200 flex overflow-hidden">
        {/* ฝั่งซ้าย – ข้อมูลแม่บ้าน */}
        <div className="w-1/3 bg-sky-50 border-r border-sky-200 p-6 flex flex-col items-center">
          {/* วงกลมรูปภาพ */}
          <div className="w-32 h-32 rounded-full border-4 border-sky-300 bg-sky-100 mb-6 flex items-center justify-center text-sky-500 text-4xl font-bold">
            🧹
          </div>

          {/* ข้อมูล */}
          <div className="w-full text-left text-sky-800 space-y-4">
            <div>
              <p className="font-semibold">Name</p>
              <p className="border-b border-sky-300 pb-1">{profile.name}</p>
            </div>
            <div>
              <p className="font-semibold">Position</p>
              <p className="border-b border-sky-300 pb-1">{profile.position}</p>
            </div>
            <div>
              <p className="font-semibold">Contact</p>
              <p className="border-b border-sky-300 pb-1">{profile.contact}</p>
            </div>
          </div>
        </div>

        {/* ฝั่งขวา – ตารางงานเฉพาะของสมศรี */}
        <div className="w-2/3 p-8 overflow-x-auto">
          <h2 className="text-2xl font-bold text-sky-800 mb-4 text-center">
            ตารางทำความสะอาดห้องน้ำของ {profile.name}
          </h2>

          <table className="w-full text-sky-800 border border-sky-200 rounded-xl overflow-hidden">
            <thead className="bg-sky-200 text-sky-900">
              <tr>
                <th className="py-3 px-4 text-left">เวลา</th>
                <th className="py-3 px-4 text-left">พื้นที่รับผิดชอบ</th>
              </tr>
            </thead>
            <tbody>
              {filteredSchedule.map((task, index) => (
                <tr
                  key={index}
                  className={`border-t border-sky-100 ${
                    index % 2 === 0 ? "bg-sky-50" : "bg-white"
                  }`}
                >
                  <td className="py-3 px-4">{task.time}</td>
                  <td className="py-3 px-4">{task.area}</td>
                </tr>
              ))}

              {/* ถ้าไม่มีข้อมูล */}
              {filteredSchedule.length === 0 && (
                <tr>
                  <td
                    colSpan="2"
                    className="text-center py-6 text-sky-500 italic"
                  >
                    ไม่มีตารางทำความสะอาดห้องน้ำสำหรับวันนี้
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
