import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { Mail, Lock, User, Eye, EyeOff, Loader, Check } from "lucide-react";
import { signUp } from "../../lib/auth";
import { supabaseConfigured } from "../../lib/supabase";
import { toast } from "sonner";

const AVATARS = ["♟", "♛", "⚔️", "🛡️", "🦁", "🐺", "🔥", "🌙"];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const finishRegistration = (message: string) => {
    toast.success(message);
    navigate(supabaseConfigured ? "/auth/login" : "/local", { replace: true });
  };

  const handleQuickRegister = async () => {
    setLoading(true);
    const quickNickname = nickname.trim() || "Игрок";
    const { user, error } = await signUp(
      email.trim() || "guest@shashki.local",
      password || "guest-password-2026",
      quickNickname,
      selectedAvatar,
    );

    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }

    if (user) {
      finishRegistration(supabaseConfigured ? "Аккаунт создан! Проверьте email." : "Гостевой профиль готов — играем!");
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!supabaseConfigured) {
      await handleQuickRegister();
      return;
    }

    // Валидация
    if (!email || !password || !confirmPassword || !nickname) {
      toast.error("Заполните все поля");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Пароли не совпадают");
      return;
    }

    if (password.length < 8) {
      toast.error("Пароль должен быть минимум 8 символов");
      return;
    }

    if (nickname.length < 3 || nickname.length > 20) {
      toast.error("Никнейм должен быть 3-20 символов");
      return;
    }

    setLoading(true);

    const { user, error } = await signUp(email, password, nickname, selectedAvatar);

    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }

    if (user) {
      finishRegistration("Аккаунт создан! Проверьте email для подтверждения.");
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col px-4 py-6"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md mx-auto flex flex-col flex-1 overflow-y-auto"
      >
        {/* Back Button */}
        <motion.button
          onClick={() => navigate(-1)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="self-start p-2 rounded-lg mb-4 transition-all"
          style={{
            background: "rgba(212,175,55,0.08)",
            border: "1px solid rgba(212,175,55,0.15)",
            color: "#D4AF37",
          }}
          title="Вернуться назад"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </motion.button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
          >
            ♔ Шашки Рояль ♔
          </h1>
          <p style={{ color: "rgba(212,175,55,0.6)" }}>Создание аккаунта</p>
        </div>

        {/* Form Card */}
        <div
          className="p-6 rounded-2xl backdrop-blur-sm flex-1"
          style={{
            background: "rgba(26, 8, 0, 0.9)",
            border: "1px solid rgba(212,175,55,0.25)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div className="space-y-4 mb-6">
            <motion.button
              type="button"
              onClick={handleQuickRegister}
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)",
                color: "#0d0400",
                boxShadow: "0 0 28px rgba(255,215,0,0.25)",
              }}
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Готовим вход...
                </>
              ) : (
                "Создать и играть"
              )}
            </motion.button>
            <p className="text-center text-xs leading-relaxed" style={{ color: "rgba(212,175,55,0.55)" }}>
              Можно нажать сразу: ник, email и пароль не обязательны для гостевой игры.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            {/* Email Input */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
              >
                Email
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: "rgba(212,175,55,0.5)" }}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-opacity-50 outline-none transition-all"
                  style={{
                    background: "rgba(212,175,55,0.08)",
                    border: "1px solid rgba(212,175,55,0.2)",
                    color: "#fff",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.2)";
                  }}
                />
              </div>
            </div>

            {/* Nickname Input */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
              >
                Никнейм
              </label>
              <div className="relative">
                <User
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: "rgba(212,175,55,0.5)" }}
                />
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value.slice(0, 20))}
                  placeholder="Ваш никнейм"
                  className="w-full pl-10 pr-4 py-3 rounded-lg bg-opacity-50 outline-none transition-all"
                  style={{
                    background: "rgba(212,175,55,0.08)",
                    border: "1px solid rgba(212,175,55,0.2)",
                    color: "#fff",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.2)";
                  }}
                />
              </div>
              <p className="text-xs mt-1" style={{ color: "rgba(212,175,55,0.4)" }}>
                {nickname.length}/20 символов
              </p>
            </div>

            {/* Avatar Selection */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
              >
                Аватар
              </label>
              <div className="grid grid-cols-4 gap-2">
                {AVATARS.map((avatar, idx) => (
                  <motion.button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedAvatar(idx)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="py-3 rounded-lg text-2xl font-bold transition-all relative"
                    style={{
                      background:
                        selectedAvatar === idx
                          ? "rgba(212,175,55,0.3)"
                          : "rgba(212,175,55,0.08)",
                      border:
                        selectedAvatar === idx
                          ? "2px solid #D4AF37"
                          : "1px solid rgba(212,175,55,0.2)",
                    }}
                  >
                    {avatar}
                    {selectedAvatar === idx && (
                      <Check
                        className="absolute top-1 right-1 w-4 h-4"
                        style={{ color: "#D4AF37" }}
                      />
                    )}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
              >
                Пароль
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: "rgba(212,175,55,0.5)" }}
                />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-lg bg-opacity-50 outline-none transition-all"
                  style={{
                    background: "rgba(212,175,55,0.08)",
                    border: "1px solid rgba(212,175,55,0.2)",
                    color: "#fff",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.2)";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="w-5 h-5" style={{ color: "rgba(212,175,55,0.5)" }} />
                  ) : (
                    <Eye className="w-5 h-5" style={{ color: "rgba(212,175,55,0.5)" }} />
                  )}
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: "rgba(212,175,55,0.4)" }}>
                Минимум 8 символов
              </p>
            </div>

            {/* Confirm Password Input */}
            <div>
              <label
                className="block text-sm font-semibold mb-2"
                style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
              >
                Подтвердить пароль
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5"
                  style={{ color: "rgba(212,175,55,0.5)" }}
                />
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-lg bg-opacity-50 outline-none transition-all"
                  style={{
                    background: "rgba(212,175,55,0.08)",
                    border: "1px solid rgba(212,175,55,0.2)",
                    color: "#fff",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.5)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(212,175,55,0.2)";
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showConfirm ? (
                    <EyeOff className="w-5 h-5" style={{ color: "rgba(212,175,55,0.5)" }} />
                  ) : (
                    <Eye className="w-5 h-5" style={{ color: "rgba(212,175,55,0.5)" }} />
                  )}
                </button>
              </div>
            </div>

            {/* Register Button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)",
                color: "#0d0400",
              }}
            >
              {loading ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  Регистрация...
                </>
              ) : (
                "Создать аккаунт"
              )}
            </motion.button>
          </form>

          {/* Login Link */}
          <div className="mt-6 pt-6 border-t" style={{ borderColor: "rgba(212,175,55,0.2)" }}>
            <p
              className="text-center text-sm"
              style={{ color: "rgba(212,175,55,0.6)" }}
            >
              Уже есть профиль?{" "}
              <Link
                to="/auth/login"
                className="font-semibold transition-colors"
                style={{ color: "#D4AF37" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "#FFD700";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "#D4AF37";
                }}
              >
                Войти
              </Link>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs" style={{ color: "rgba(212,175,55,0.4)" }}>
          <p>🎮 Шашки Рояль © 2026</p>
          <p>Ставки • Турниры • Рейтинг</p>
        </div>
      </motion.div>
    </div>
  );
}
