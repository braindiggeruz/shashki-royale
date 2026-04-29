import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "motion/react";
import { Mail, ArrowLeft, Loader, Check } from "lucide-react";
import { resetPassword } from "../../lib/auth";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await resetPassword(email);

    if (error) {
      toast.error(error);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    toast.success("Ссылка для восстановления отправлена на email!");
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(ellipse at 50% 0%, rgba(120,50,0,0.35) 0%, transparent 60%), linear-gradient(180deg, #0d0400 0%, #1a0800 50%, #0d0400 100%)",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
          >
            ♔ Шашки Рояль ♔
          </h1>
          <p style={{ color: "rgba(212,175,55,0.6)" }}>Восстановление пароля</p>
        </div>

        {/* Form Card */}
        <div
          className="p-8 rounded-2xl backdrop-blur-sm"
          style={{
            background: "rgba(26, 8, 0, 0.9)",
            border: "1px solid rgba(212,175,55,0.25)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {!submitted ? (
            <form onSubmit={handleReset} className="space-y-6">
              <p
                className="text-sm text-center mb-6"
                style={{ color: "rgba(212,175,55,0.7)" }}
              >
                Введите email, связанный с вашим аккаунтом. Мы отправим ссылку для восстановления пароля.
              </p>

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

              {/* Send Button */}
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
                    Отправка...
                  </>
                ) : (
                  "Отправить ссылку"
                )}
              </motion.button>
            </form>
          ) : (
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ background: "rgba(212,175,55,0.2)" }}
                >
                  <Check className="w-8 h-8" style={{ color: "#D4AF37" }} />
                </div>
              </div>
              <div>
                <h2
                  className="text-xl font-bold mb-2"
                  style={{ color: "#D4AF37", fontFamily: "Cinzel, serif" }}
                >
                  Проверьте email
                </h2>
                <p
                  className="text-sm"
                  style={{ color: "rgba(212,175,55,0.7)" }}
                >
                  Мы отправили ссылку для восстановления пароля на <strong>{email}</strong>
                </p>
              </div>
              <p
                className="text-xs"
                style={{ color: "rgba(212,175,55,0.5)" }}
              >
                Ссылка действительна 1 час. Если письмо не пришло, проверьте папку спама.
              </p>
            </div>
          )}

          {/* Back Link */}
          <div className="mt-6 pt-6 border-t" style={{ borderColor: "rgba(212,175,55,0.2)" }}>
            <Link
              to="/auth/login"
              className="flex items-center justify-center gap-2 text-sm font-semibold transition-colors"
              style={{ color: "#D4AF37" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#FFD700";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "#D4AF37";
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Вернуться к входу
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs" style={{ color: "rgba(212,175,55,0.4)" }}>
          <p>🎮 Шашки Рояль © 2026</p>
        </div>
      </motion.div>
    </div>
  );
}
