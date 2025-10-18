import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { User, Lock } from "lucide-react";
import { HiArrowLeft } from "react-icons/hi";
import bg from "./assets/bg.png";
import HomeImg from "./assets/Home.png"; 
import restroomImg from "./assets/restroom.jpg";

export default function Login() {
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // Simple role check for demonstration
  const handleLogin = (e) => {
    e.preventDefault();
    // Replace this logic with real authentication as needed
    if (userId === "staff" && password === "staff") {
      navigate("/staff");
    } else if (userId === "manager" && password === "manager") {
      navigate("/manager");
    } else {
      setError("รหัสผู้ใช้หรือรหัสผ่านไม่ถูกต้อง / Invalid credentials");
    }
  };

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center bg-cover bg-center bg-no-repeat p-0 m-0"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* ปุ่มย้อนกลับ */}
      <div className="w-full flex items-start justify-start p-4 absolute top-0 left-0 z-10">
        <button
          className="bg-white/80 hover:bg-white/100 rounded-full p-2 shadow-md border border-blue-200 text-blue-600 transition-all flex items-center"
          onClick={() => navigate(-1)}
          aria-label="ย้อนกลับ"
        >
          <HiArrowLeft size={24} />
        </button>
      </div>
      <div className="flex flex-col md:flex-row bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl overflow-hidden w-full max-w-5xl mx-4 md:mx-auto border border-blue-200/40 mt-16 md:mt-0">
        {/* ซ้าย */}
  <div className="md:w-1/2 bg-gradient-to-b from-blue-600/90 to-sky-300/80 text-white p-10 flex flex-col justify-between">
          <div>
            <div className="flex items-center mb-6">
              {/* ✅ โลโก้รูปภาพแทน SVG */}
              <div className="bg-white/30 p-4 rounded-2xl mr-3 flex items-center justify-center shadow-md">
                <img
                  src={HomeImg}
                  alt="Smart Restroom Logo"
                  className="w-12 h-12 object-contain scale-350 translate-x-1.5 translate-y-0.5"
                />
              </div>

              <div>
                <h1 className="text-3xl font-bold drop-shadow-xl">Smart Restroom</h1>
                <p className="text-sm opacity-90 font-medium">Management System</p>
              </div>
            </div>

            <ul className="space-y-5 text-white/90 mt-6">
              <li>
                ✅ <strong>ตรวจจับการใช้งานแบบเรียลไทม์</strong>
                <br />
                <span className="text-sm opacity-80">
                  Real-time usage detection
                </span>
              </li>
              <li>
                ✅ <strong>แจ้งเตือนทำความสะอาดอัจฉริยะ</strong>
                <br />
                <span className="text-sm opacity-80">
                  Smart maid alert and cleaning schedule system
                </span>
              </li>
              <li>
                ✅ <strong>รายงานและวิเคราะห์ข้อมูลการใช้งาน</strong>
                <br />
                <span className="text-sm opacity-80">
                  Usage analytics and insight dashboard
                </span>
              </li>
            </ul>
          </div>

          <img
            src={restroomImg}
            alt="restroom"
            className="rounded-xl mt-10 object-cover w-full h-40 md:h-48 shadow-lg border-2 border-white/40"
          />
        </div>

        {/* ขวา */}
  <div className="md:w-1/2 p-10 flex flex-col justify-center bg-white/70 backdrop-blur-lg">
          <h2 className="text-3xl font-bold text-blue-700 mb-2 drop-shadow-md">
            เข้าสู่ระบบ
          </h2>
          <p className="text-blue-500 mb-8 font-medium">Sign in to your account</p>

          <form onSubmit={handleLogin}>
            <div className="mb-5">
              <label className="block font-medium text-blue-700 mb-2">
                รหัสผู้ใช้งาน / User ID
              </label>
              <div className="flex items-center bg-blue-50 rounded-lg px-3 shadow-inner">
                <User className="w-5 h-5 text-blue-400" />
                <input
                  type="text"
                  placeholder="กรอกรหัสผู้ใช้งาน"
                  className="bg-transparent flex-1 px-3 py-3 outline-none text-blue-900"
                  value={userId}
                  onChange={e => setUserId(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="mb-8">
              <label className="block font-medium text-blue-700 mb-2">
                รหัสผ่าน / Password
              </label>
              <div className="flex items-center bg-blue-50 rounded-lg px-3 shadow-inner">
                <Lock className="w-5 h-5 text-blue-400" />
                <input
                  type="password"
                  placeholder="กรอกรหัสผ่าน"
                  className="bg-transparent flex-1 px-3 py-3 outline-none text-blue-900"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="mb-4 text-red-500 text-sm text-center font-semibold drop-shadow">{error}</div>
            )}

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-blue-500/90 to-sky-400/80 text-white font-bold py-3 rounded-lg shadow-lg hover:from-blue-600 hover:to-sky-500 hover:opacity-95 transition-all text-lg tracking-wide"
            >
              เข้าสู่ระบบ →
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
