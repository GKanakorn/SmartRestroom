import React, { useState } from "react";
import { Save } from "lucide-react";

export default function ManagerEvaluation() {
  const employees = ["คุณนิดา", "คุณมานี", "คุณสมชาย"];
  const [selectedEmp, setSelectedEmp] = useState("");
  const [scores, setScores] = useState({});
  const criteria = ["ความสะอาด", "ทิชชู่", "พื้น", "กลิ่น"];

  const handleScore = (criterion, value) => {
    setScores((prev) => ({ ...prev, [criterion]: value }));
  };

  const handleSave = () => {
    if (!selectedEmp) {
      alert("⚠️ กรุณาเลือกพนักงานก่อนบันทึก");
      return;
    }

    const incomplete = criteria.filter((c) => !scores[c]);
    if (incomplete.length > 0) {
      alert("⚠️ กรุณาให้คะแนนครบทุกหัวข้อก่อนบันทึก");
      return;
    }

    console.log("พนักงาน:", selectedEmp);
    console.log("คะแนนที่ประเมิน:", scores);
    alert("✅ บันทึกผลการประเมินเรียบร้อยแล้ว!");
  };

  return (
    <div
      className="w-screen h-screen bg-gradient-to-br from-sky-100 via-blue-50 to-white flex justify-center items-center p-6"
      style={{
        backgroundImage:
          "radial-gradient(circle at 20% 20%, #e0f2fe 0%, #f0f9ff 100%)",
      }}
    >
      <div className="bg-white/95 backdrop-blur-xl w-full max-w-4xl md:w-4/5 lg:w-3/5 flex flex-col p-8 rounded-3xl shadow-2xl border border-blue-200">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-blue-200 pb-4 mb-6">
          <h2 className="text-3xl font-bold text-sky-900 tracking-wide">
            🧹 Manager Evaluation
          </h2>
          <div className="bg-sky-100 px-5 py-2 rounded-2xl text-sky-700 font-semibold shadow-inner border border-sky-200">
            ประเมินห้องน้ำ
          </div>
        </div>

        {/* Employee Select */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 w-full">
          <label className="text-sky-900 font-semibold w-full sm:w-32">
            พนักงาน
          </label>
          <select
            value={selectedEmp}
            onChange={(e) => setSelectedEmp(e.target.value)}
            className="border border-sky-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300 flex-1 w-full sm:w-auto bg-sky-50/40 text-sky-900 shadow-inner transition-all duration-200 hover:ring-1 hover:ring-sky-400"
          >
            <option value="">เลือกพนักงาน</option>
            {employees.map((emp) => (
              <option key={emp} value={emp}>
                {emp}
              </option>
            ))}
          </select>
        </div>

        {/* Criteria Table */}
        <div className="overflow-auto">
          <table className="w-full border-separate border-spacing-y-3 text-center">
            <thead>
              <tr className="bg-blue-400/80">
                <th className="text-left text-white w-32 p-3 rounded-l-xl font-semibold">
                  หัวข้อ
                </th>
                <th
                  className="text-center text-white font-semibold rounded-r-xl"
                  colSpan={5}
                >
                  คะแนน (1–5)
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, idx) => (
                <tr
                  key={c}
                  className={`${
                    idx % 2 === 0 ? "bg-sky-100/40" : "bg-sky-100/60"
                  } transition-all duration-200 hover:bg-sky-50`}
                >
                  <td className="text-left text-sky-900 font-medium px-4 py-3 rounded-l-lg">
                    {c}
                  </td>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const isSelected = scores[c] === n;
                    return (
                      <td key={n} className="px-2 py-2">
                        <button
                          onClick={() => handleScore(c, n)}
                          className={`w-14 h-14 rounded-full flex justify-center items-center font-bold text-lg border-2 transition-all duration-200 ${
                            isSelected
                              /*? "border-gray-700 bg-gray-300 text-gray-900 shadow-lg scale-105"
                              : "border-sky-300 bg-white text-sky-800 hover:bg-sky-100 hover:scale-105"*/
                              ? " bg-gray-900 text-black-800 shadow-lg scale-100"
                              : " bg-white text-blue-500 shadow-lg scale-90"
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

        {/* Save Button */}
        <div className="flex justify-end mt-6">
          <button
            onClick={handleSave}
            className="flex flex-col items-center justify-center bg-gradient-to-r from-sky-400/60 to-blue-500/80 
               hover:from-sky-600 hover:to-blue-700 text-white font-bold px-8 py-3 rounded-xl 
               shadow-md hover:shadow-blue-400/50 transition-all duration-200 hover:scale-105 border border-blue-500"
          >
            <div className="flex items-center gap-2 text-base">
              <Save size={16} />
              <span>บันทึกผลการประเมิน</span>
            </div>
            <span className="text-xs font-normal opacity-90 mt-1">
              Save Evaluation
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
