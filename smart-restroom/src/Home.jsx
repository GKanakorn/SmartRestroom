import React from "react";
import { useNavigate } from "react-router-dom";
import HomeImg from "./assets/Home.png";
import bg from "./assets/bg.png";

const Home = () => {
  const navigate = useNavigate();
  return (
    <main
      className="min-h-screen w-screen overflow-hidden m-0 p-0"
      style={{
        backgroundImage: `url(${bg})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <section className="relative w-full min-h-screen flex items-center justify-center px-4 md:px-8 py-16">
        <div className="backdrop-blur-sm bg-white/10 rounded-xl shadow-lg w-full max-w-7xl mx-auto p-12 md:p-20 min-h-[85vh] flex items-center">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            
            {/* text-content-section */}
            <div className="space-y-4 text-center md:text-left">
              <h1
                data-aos="fade-right"
                data-aos-delay="300"
                className="text-3xl font-semibold text-blue-500 drop-shadow-xl"
              >
                Welcome to
              </h1>
              <h1
                data-aos="fade-up"
                className="text-5xl font-bold uppercase bg-gradient-to-r from-blue-700 via-purple-500 to-blue-600 bg-clip-text text-transparent drop-shadow-2xl"
              >
                Smart Restroom
              </h1>
              <p
                data-aos="fade-up"
                data-aos-delay="300"
                className="text-lg text-blue-600 drop-shadow-lg max-w-md mx-auto md:mx-0"
              >
                A smart solution for real-time restroom monitoring, 
                staff task management, and user satisfaction — all in one platform!
              </p>

              {/* ปุ่มสองปุ่ม */}
              <div
                data-aos="fade-up"
                data-aos-delay="500"
                className="flex justify-center md:justify-start gap-4 mt-6"
              >
                <button
                  className="border border-blue-400 px-6 py-2 rounded-lg 
                             bg-gradient-to-r from-blue-500/80 to-blue-400/70 
                             text-white font-semibold shadow-lg shadow-blue-500/40 
                             hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/80 
                             transition-all duration-300 backdrop-blur-md"
                  onClick={() => navigate("/overview")}
                >
                  Overview
                </button>

                <button
                  className="border border-blue-400 px-6 py-2 rounded-lg 
                             bg-gradient-to-r from-blue-500/80 to-blue-400/70 
                             text-white font-semibold shadow-lg shadow-blue-500/40 
                             hover:from-blue-500 hover:to-blue-400 hover:shadow-blue-500/80 
                             transition-all duration-300 backdrop-blur-md"
                  onClick={() => navigate("/login")}
                >
                  Login
                </button>
              </div>
            </div>

            {/* image section */}
            <div className="flex justify-center">
              <img
                data-aos="zoom-in"
                className="w-[300px] md:w-[400px] drop-shadow-xl"
                src={HomeImg}
                alt="logo"
              />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
