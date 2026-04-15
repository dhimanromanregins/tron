import { Routes, Route, Navigate } from "react-router-dom";
import ConnectPage from "./components/ConnectPage";
import Dashboard from "./components/Dashboard";
import TronLinkPage from "./components/TronLinkPage";

export default function App() {
  return (
    <Routes>
      <Route path="/"          element={<ConnectPage />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/tron"      element={<TronLinkPage />} />
      <Route path="*"          element={<Navigate to="/" replace />} />
    </Routes>
  );
}
