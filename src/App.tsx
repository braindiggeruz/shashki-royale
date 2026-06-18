import { BrowserRouter, Route, Routes } from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import { ProtectedRoute } from "./components/ProtectedRoute.tsx";
import AuthCallback from "./pages/auth/Callback.tsx";
import LoginPage from "./pages/auth/Login.tsx";
import RegisterPage from "./pages/auth/Register.tsx";
import ForgotPasswordPage from "./pages/auth/ForgotPassword.tsx";
import ResetPasswordPage from "./pages/auth/ResetPassword.tsx";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Rules from "./pages/Rules.tsx";
import LocalGame from "./pages/LocalGame.tsx";
import Lobby from "./pages/Lobby.tsx";
import OnlineGame from "./pages/OnlineGame.tsx";
import ProfilePage from "./pages/ProfilePage.tsx";
import LeaderboardPage from "./pages/LeaderboardPage.tsx";
import StakeLobbyPage from "./pages/StakeLobbyPage.tsx";
import WalletPage from "./pages/WalletPage.tsx";
import { useServiceWorker } from "./hooks/use-service-worker.ts";
import "./i18n.ts";

function AppInner() {
  useServiceWorker();
  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<Index />} />
        <Route path="/rules" element={<Rules />} />
        
        {/* Auth Routes */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
        
        {/* Protected Routes */}
        <Route path="/local" element={<ProtectedRoute><LocalGame /></ProtectedRoute>} />
        <Route path="/lobby" element={<ProtectedRoute><Lobby /></ProtectedRoute>} />
        <Route path="/online-game" element={<ProtectedRoute><OnlineGame /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/stake-lobby" element={<ProtectedRoute><StakeLobbyPage /></ProtectedRoute>} />
        <Route path="/wallet" element={<ProtectedRoute><WalletPage /></ProtectedRoute>} />
        
        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <DefaultProviders>
      <AppInner />
    </DefaultProviders>
  );
}
