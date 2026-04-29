import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { Mail, Lock, Eye, EyeOff, Loader } from "lucide-react";
import { signIn, signInWithGoogle } from "../../lib/auth";
import { supabaseConfigured } from "../../lib/supabase";
import { toast } from "sonner";

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const finishFastEntry = (message = "Добро пожаловать!") => {
    toast.success(message);
    navigate(supabaseConfigured ? "/lobby" : "/local", { replace: true });
  };

  const handleQuickPlay = () => {
    finishFastEntry("Игра запущена — без лишних шагов!");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { user, error } = await signIn(email, password);
    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }
    if (user) finishFastEntry();
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    const { error } = await signInWithGoogle();
    if (error) {
      toast.error(error);
      setGoogleLoading(false);
      return;
    }
    if (!supabaseConfigured) finishFastEntry("Гостевой вход активирован!");
  };

  return (
    <div
      className="min-h-screen flex flex-col px-4 py-4 overflow-y-auto"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md mx-auto flex flex-col"
      >
        {/* Back Button */}
        <motion.button
          onClick={() => navigate(-1)}
          whileTap={{ scale: 0.95 }}
          className="self-start p-2 rounded-lg mb-3"
          style={{
            background: "rgba(212,175,55,0.08)",
            border: "1px solid rgba(212,175,55,0.15)",
            color: "#D4AF37",
          }}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </motion.button>

        {/* Header */}
        <div className="text-center mb-4">
          <h1 className="text-3xl font-bold mb-1" style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}>
            ♔ Шашки Рояль ♔
          </h1>
          <p className="text-sm" style={{ color: "rgba(212,175,55,0.6)" }}>Вход в игру</p>
        </div>

        {/* Main Card */}
        <div
          className="p-5 rounded-2xl"
          style={{
            background: "rgba(26, 8, 0, 0.9)",
            border: "1px solid rgba(212,175,55,0.25)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Quick Play */}
          <motion.button
            type="button"
            onClick={handleQuickPlay}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3.5 rounded-xl font-bold text-lg mb-3"
            style={{
              background: "linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)",
              color: "#0d0400",
              boxShadow: "0 0 20px rgba(255,215,0,0.2)",
            }}
          >
            Играть сразу
          </motion.button>

          {/* Google Login - ВИДНА СРАЗУ */}
          <motion.button
            type="button"
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            whileTap={{ scale: 0.98 }}
            className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 mb-4 disabled:opacity-50"
            style={{
              background: "rgba(255,255,255,0.95)",
              color: "#333",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
            }}
          >
            {googleLoading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Войти через Google
              </>
            )}
          </motion.button>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px" style={{ background: "rgba(212,175,55,0.2)" }} />
            <span className="text-xs" style={{ color: "rgba(212,175,55,0.5)" }}>или email</span>
            <div className="flex-1 h-px" style={{ background: "rgba(212,175,55,0.2)" }} />
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg outline-none text-sm"
                style={{
                  background: "rgba(212,175,55,0.08)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  color: "#fff",
                }}
              />
            </div>

            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-9 py-2.5 rounded-lg outline-none text-sm"
                style={{
                  background: "rgba(212,175,55,0.08)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  color: "#fff",
                }}
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                {showPassword ? <EyeOff className="w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} /> : <Eye className="w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />}
              </button>
            </div>

            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              className="w-full py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)",
                color: "#0d0400",
              }}
            >
              {loading ? <Loader className="w-5 h-5 animate-spin" /> : "Войти"}
            </motion.button>
          </form>

          {/* Links */}
          <div className="mt-4 text-center space-y-2">
            {supabaseConfigured && (
              <Link to="/auth/forgot-password" className="text-xs block" style={{ color: "rgba(212,175,55,0.6)" }}>
                Забыли пароль?
              </Link>
            )}
            <p className="text-xs" style={{ color: "rgba(212,175,55,0.6)" }}>
              Нет аккаунта?{" "}
              <Link to="/auth/register" className="font-semibold" style={{ color: "#D4AF37" }}>
                Зарегистрироваться
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
