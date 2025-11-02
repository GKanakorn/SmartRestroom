import React, { useState } from "react";
import { Save } from "lucide-react";
import bg from "./assets/bg.png";

export default function EvaluationPage() {
  const criteria = ["ความสะอาด", "ทิชชู่", "พื้น", "กลิ่น"];
  const [scores, setScores] = useState({});
  const [evaluationData, setEvaluationData] = useState(() => {
    return JSON.parse(localStorage.getItem("evaluationRecords") || "[]");
  });

  const handleScore = (criterion, value) => {
    setScores((prev) => ({ ...prev, [criterion]: value }));
  };

  const handleSaveEvaluation = async () => {
    const incomplete = criteria.filter((c) => !scores[c]);
    if (incomplete.length > 0) {
      alert("⚠️ กรุณาให้คะแนนครบทุกหัวข้อก่อนบันทึก");
      return;
    }

    const record = {
      date: new Date().toLocaleDateString("th-TH"),
      scores,
    };

    // === ส่งขึ้น backend เพื่อให้ทุกเครื่องเห็นร่วมกัน ===
    try {
      const res = await fetch("http://172.20.10.2:8080/api/evaluation", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(record),
      });
      const data = await res.json();
      if (!data.ok) {
        alert("บันทึกไม่สำเร็จ (backend ตอบไม่ ok)");
        return;
      }
    } catch (err) {
      console.error(err);
      alert("❌ บันทึกไม่สำเร็จ (ติดต่อเซิร์ฟเวอร์ไม่ได้)");
      return;
    }

    // === อัปเดต state/localStorage ฝั่ง client ไว้เป็น cache ชั่วคราว ===
    const updated = [...evaluationData, record];
    setEvaluationData(updated);
    localStorage.setItem("evaluationRecords", JSON.stringify(updated));

    // reset form
    setScores({});
    alert("✅ บันทึกผลการประเมินเรียบร้อยแล้ว!");
  };

  return (
    <div
      className="w-screen h-screen flex items-center justify-center" // จัด container ตรงกลาง
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="w-11/12 max-w-4xl bg-white/90 rounded-3xl shadow-lg p-6 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h2 className="text-xl sm:text-2xl font-bold text-blue-900 flex-1">🧹 แบบประเมิน</h2>
        </div>

        {/* ตาราง */}
        <div className="flex-1 overflow-x-auto">
          <table className="w-full min-w-[480px] border-separate border-spacing-y-3 text-center">
            <thead>
              <tr className="bg-blue-400/80">
                <th className="text-left text-white w-32 p-3 rounded-l-xl font-semibold">หัวข้อ</th>
                <th className="text-center text-white font-semibold rounded-r-xl" colSpan={5}>
                  คะแนน (1–5)
                </th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c, idx) => (
                <tr
                  key={c}
                  className={`${idx % 2 === 0 ? "bg-sky-100/40" : "bg-sky-100/60"} transition-all hover:bg-sky-50`}
                >
                  <td className="text-left text-sky-900 font-medium px-4 py-3 rounded-l-lg">{c}</td>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const isSelected = scores[c] === n;
                    return (
                      <td key={n} className="px-2 py-2">
                        <button
                          onClick={() => handleScore(c, n)}
                          className={`w-12 h-12 rounded-full font-bold text-lg border-2 transition-all ${
                            isSelected
                              ? "bg-gray-900 text-black-800 shadow-lg scale-100"
                              : "bg-white text-blue-500 shadow-lg scale-90"
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
        <div className="flex justify-center sm:justify-end mt-4 sm:mt-6">
          <button
            onClick={handleSaveEvaluation}
            className="bg-gradient-to-r from-blue-400 to-blue-600 text-white font-bold px-6 sm:px-8 py-2 sm:py-3 rounded-xl shadow-md hover:scale-105 transition-transform flex items-center gap-2 text-sm sm:text-base"
          >
            <Save size={16} />
            <span>บันทึกผลการประเมิน</span>
          </button>
        </div>
      </div>
    </div>
  );
}
