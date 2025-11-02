import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { HiArrowLeft } from "react-icons/hi";

// สมมติเก็บข้อมูลชั่วคราว (ใน production ควร POST ไป backend)
let feedbackStorage = [];

export function getFeedbackStorage() {
  return feedbackStorage;
}

export default function Feedback() {
  const navigate = useNavigate();
  const [cleanliness, setCleanliness] = useState(0);
  const [comfort, setComfort] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (cleanliness === 0 || comfort === 0) {
      alert("กรุณาให้คะแนนทุกข้อ");
      return;
    }

    // บันทึกข้อมูล
    feedbackStorage.push({
      cleanliness,
      comfort,
      comment,
      ts: Date.now(),
    });

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen p-6 bg-gray-50 font-sans">
      {/* Back button */}
      <button
        className="mb-6 flex items-center gap-2 text-blue-600 font-semibold hover:underline"
        onClick={() => navigate(-1)}
      >
        <HiArrowLeft size={24} /> กลับ
      </button>

      <div className="max-w-md mx-auto bg-white rounded-xl shadow-lg p-6">
        <h1 className="text-xl font-bold mb-4">Feedback / แบบประเมิน</h1>

        {submitted ? (
          <div className="text-center py-10">
            <div className="text-green-600 font-semibold text-lg">ขอบคุณสำหรับการประเมินของคุณ!</div>
            <button
              className="mt-6 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              onClick={() => navigate("/")}
            >
              กลับหน้าแรก
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Cleanliness */}
            <div>
              <div className="mb-2 font-medium">ความสะอาด (Cleanliness)</div>
              <RatingStars value={cleanliness} onChange={setCleanliness} />
            </div>

            {/* Comfort */}
            <div>
              <div className="mb-2 font-medium">ความสะดวกสบาย (Comfort)</div>
              <RatingStars value={comfort} onChange={setComfort} />
            </div>

            {/* Comment */}
            <div>
              <div className="mb-2 font-medium">ความคิดเห็นเพิ่มเติม (Optional)</div>
              <textarea
                className="w-full border rounded p-2"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="ใส่ความคิดเห็นของคุณ..."
              />
            </div>

            <button
              onClick={handleSubmit}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
            >
              ส่งฟีดแบ็ก
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ----- Rating Stars -----
function RatingStars({ value, onChange }) {
  return (
    <div className="flex gap-2">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} filled={i <= value} onClick={() => onChange(i)} />
      ))}
    </div>
  );
}

function Star({ filled, onClick }) {
  return (
    <span
      className={`text-2xl cursor-pointer ${filled ? "text-yellow-400" : "text-gray-300"}`}
      onClick={onClick}
    >
      ★
    </span>
  );
}
