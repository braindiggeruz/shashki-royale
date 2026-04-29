import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { motion } from "motion/react";

interface AuthHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}

export default function AuthHeader({ title, subtitle, showBack = true }: AuthHeaderProps) {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between mb-8">
      {showBack && (
        <motion.button
          onClick={() => navigate(-1)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="p-2 rounded-lg transition-all"
          style={{
            background: "rgba(212,175,55,0.08)",
            border: "1px solid rgba(212,175,55,0.15)",
            color: "#D4AF37",
          }}
          title="Вернуться назад"
        >
          <ChevronLeft className="w-6 h-6" />
        </motion.button>
      )}
      <div className="flex-1 text-center">
        <h1
          className="text-3xl font-bold mb-1"
          style={{ color: "#FFD700", fontFamily: "Cinzel, serif" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ color: "rgba(212,175,55,0.6)" }}>
            {subtitle}
          </p>
        )}
      </div>
      {showBack && <div className="w-10" />}
    </div>
  );
}
