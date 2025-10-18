import React from "react";
import { Phone, Mail, Star, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import bg from "./assets/bg.png";

export default function StaffPage() {
  const navigate = useNavigate();

  const staff = {
    name: "Ms. Somjai Jaidee",
    position: "Housekeeping Staff - Building A",
    phone: "081-234-5678",
    email: "somjai@example.com",
    rating: 4.5,
    image: "https://cdn-icons-png.flaticon.com/512/2922/2922510.png",
  };

  const schedule = [
    { day: "Monday", room: "1st Floor Restroom", time: "08:00 - 16:00" },
    { day: "Tuesday", room: "2nd Floor Restroom", time: "08:00 - 16:00" },
    { day: "Wednesday", room: "3rd Floor Restroom", time: "08:00 - 16:00" },
    { day: "Thursday", room: "1st Floor Restroom", time: "08:00 - 16:00" },
    { day: "Friday", room: "2nd Floor Restroom", time: "08:00 - 16:00" },
    { day: "Saturday", room: "General Cleaning", time: "09:00 - 15:00" },
    { day: "Sunday", room: "Off", time: "-" },
  ];

  return (
    <div
      className="min-h-screen w-screen flex flex-col items-center justify-center p-6 font-sans"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Header */}
      <div className="w-full max-w-5xl flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-700 via-purple-500 to-blue-600 bg-clip-text text-transparent drop-shadow-2xl">
          Staff Information
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/overview")}
            className="px-5 py-2 bg-gradient-to-r from-pink-400/80 to-pink-600/80 hover:from-pink-500 hover:to-pink-700 text-white border border-pink-400 rounded-xl shadow-lg shadow-pink-500/40 hover:shadow-pink-500/80 transition-all duration-300 backdrop-blur-md font-semibold"
          >
            Overview
          </button>
          <button
            onClick={() => navigate("/")}
            className="px-5 py-2 bg-gradient-to-r from-blue-400/80 to-blue-600/80 hover:from-blue-500 hover:to-blue-700 text-white border border-blue-400 rounded-xl shadow-lg shadow-blue-500/40 hover:shadow-blue-500/80 transition-all duration-300 backdrop-blur-md font-semibold"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Profile + Schedule Box */}
      <div className="backdrop-blur-md bg-white/70 w-full max-w-5xl rounded-3xl shadow-2xl border border-blue-200 flex flex-col md:flex-row overflow-hidden">
        {/* Left Side - Profile */}
        <div className="w-full md:w-1/3 bg-gradient-to-b from-blue-100/80 to-blue-200/60 border-b md:border-b-0 md:border-r border-blue-200 p-8 flex flex-col items-center justify-center">
          <img
            src={staff.image}
            alt="Staff"
            className="w-36 h-36 rounded-full border-4 border-blue-300 object-cover mb-6 shadow-lg"
          />
          <div className="text-blue-900 space-y-3 w-full text-left">
            <div>
              <p className="font-semibold text-blue-700">Name</p>
              <p className="border-b border-blue-200 pb-1">{staff.name}</p>
            </div>
            <div>
              <p className="font-semibold text-blue-700">Position</p>
              <p className="border-b border-blue-200 pb-1">{staff.position}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Phone className="w-4 h-4 text-blue-500" />
              <p>{staff.phone}</p>
            </div>
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-500" />
              <p>{staff.email}</p>
            </div>
            <div className="flex items-center gap-1 mt-2">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              <span className="font-semibold text-gray-700">
                {staff.rating.toFixed(1)} / 5.0 Satisfaction
              </span>
            </div>
          </div>
        </div>

        {/* Right Side - Schedule Table */}
        <div className="w-full md:w-2/3 p-10 overflow-x-auto flex flex-col justify-center">
          <div className="flex items-center justify-center mb-6 text-blue-800">
            <Calendar className="text-blue-600 mr-2" />
            <h3 className="text-2xl font-bold">Weekly Work Schedule</h3>
          </div>

          <table className="w-full text-blue-900 border border-blue-200 rounded-xl overflow-hidden shadow-md">
            <thead className="bg-blue-200/80 text-blue-900">
              <tr>
                <th className="py-3 px-4 text-left">Day</th>
                <th className="py-3 px-4 text-left">Assigned Area</th>
                <th className="py-3 px-4 text-left">Time</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((s, index) => (
                <tr
                  key={index}
                  className={`border-t border-blue-100 ${
                    index % 2 === 0 ? "bg-blue-50/60" : "bg-white/80"
                  } ${s.day === "Sunday" ? "text-gray-400 italic" : ""}`}
                >
                  <td className="py-3 px-4">{s.day}</td>
                  <td className="py-3 px-4">{s.room}</td>
                  <td className="py-3 px-4">{s.time}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-8 text-center text-blue-600 text-sm">
            🧹 Last Updated: October 11, 2025
          </div>
        </div>
      </div>
    </div>
  );
}
