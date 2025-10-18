import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./Home";
import Login from "./Login";
import StaffPage from "./StaffPage";
import ManagerPage from "./ManagerPage";
import Overview from "./overview";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/staff" element={<StaffPage />} />
      <Route path="/manager" element={<ManagerPage />} />
      <Route path="/overview" element={<Overview />} />
    </Routes>
  );
}
