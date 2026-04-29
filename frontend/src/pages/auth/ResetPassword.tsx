import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Lock, Eye, EyeOff, Loader, Check } from "lucide-react";
import { updatePassword } from "../../lib/auth";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || !confirmPassword) {
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

    setLoading(true);

    const { error } = await updatePassword(password);

    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }

    setSuccess(true);
    toast.success("Пароль успешно обновлён!");

    setTimeout(() => {
      navigate("/auth/login", { replace: true });
    }, 2000);
  };

  if (success) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center p-8 rounded-2xl"
          style={{ background: "rgba(20,10,5,0.9)", border: "1px solid rgba(212,175,55,0.3)" }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ background: "rgba(34,197,94,0.2)", border: "2px solid rgba(34,197,94,0.5)" }}
          >
            <Check className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}>
            Пароль обновлён!
          </h2>
          <p className="text-sm" style={{ color: "rgba(212,175,55,0.7)" }}>
            Перенаправляем на страницу входа...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "radial-gradient(ellipse at center, #2C1810 0%, #0A0503 100%)" }}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm p-6 rounded-2xl"
        style={{
          background: "rgba(20,10,5,0.95)",
          border: "1px solid rgba(212,175,55,0.25)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div className="text-center mb-6">
          <div
            className="w-14 h-14 mx-auto mb-3 rounded-full flex items-center justify-center"
            style={{ background: "rgba(212,175,55,0.15)", border: "2px solid rgba(212,175,55,0.3)" }}
          >
            <Lock className="w-7 h-7" style={{ color: "#D4AF37" }} />
          </div>
          <h1 className="text-xl font-bold" style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}>
            Новый пароль
          </h1>
          <p className="text-xs mt-1" style={{ color: "rgba(212,175,55,0.6)" }}>
            Введите новый пароль для вашего аккаунта
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleReset} className="space-y-4">
          {/* Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Новый пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-10 py-3 rounded-xl text-sm outline-none"
              style={{
                background: "rgba(212,175,55,0.08)",
                border: "1px solid rgba(212,175,55,0.2)",
                color: "#FFD700",
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              {showPassword ? (
                <EyeOff className="w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />
              ) : (
                <Eye className="w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />
              )}
            </button>
          </div>

          {/* Confirm Password */}
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(212,175,55,0.5)" }} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Подтвердите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none"
              style={{
                background: "rgba(212,175,55,0.08)",
                border: "1px solid rgba(212,175,55,0.2)",
                color: "#FFD700",
              }}
            />
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={loading}
            whileTap={{ scale: 0.97 }}
            className="w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2"
            style={{
              background: loading
                ? "rgba(212,175,55,0.3)"
                : "linear-gradient(135deg, #D4AF37 0%, #FFD700 100%)",
              color: "#0d0400",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                Обновление...
              </>
            ) : (
              "Обновить пароль"
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
