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
import { useAnonymousBootstrap } from "./hooks/useAnonymousBootstrap.ts";
import "./i18n.ts";

function AppInner() {
  useServiceWorker();
  // Auto-create anonymous player/profile/wallet on first visit.
  useAnonymousBootstrap();

  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes — anonymous players play immediately, no login wall */}
        <Route path="/" element={<Index />} />
        <Route path="/rules" element={<Rules />} />
        <Route path="/local" element={<LocalGame />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/online-game" element={<OnlineGame />} />
        <Route path="/stake-lobby" element={<StakeLobbyPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/wallet" element={<WalletPage />} />

        {/* Auth routes are optional — reachable from /profile if user wants
            to upgrade their anonymous account to a real one. Keep them so
            existing accounts still work. */}
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/auth/reset-password" element={<ProtectedRoute><ResetPasswordPage /></ProtectedRoute>} />

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
