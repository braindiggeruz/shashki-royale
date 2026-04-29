import { Navigate, useLocation } from "react-router-dom";
import { useAuthState } from "../hooks/useAuthState";
import { supabaseConfigured } from "../lib/supabase";
import { Spinner } from "./ui/spinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  // Локальная игра, лобби и онлайн-игра доступны без авторизации
  const publicRoutes = ["/local", "/lobby", "/online-game"];
  if (publicRoutes.includes(location.pathname)) {
    return <>{children}</>;
  }

  // If Supabase is not configured, allow guest access to all routes
  if (!supabaseConfigured) {
    return <>{children}</>;
  }

  const { isAuthenticated, loading } = useAuthState();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Spinner className="size-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/login" replace />;
  }

  return <>{children}</>;
}
