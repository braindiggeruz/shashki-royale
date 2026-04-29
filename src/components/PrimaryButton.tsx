import { useState } from "react";
import { cn } from "@/lib/utils.ts";

type PrimaryButtonProps = {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "gold" | "red" | "ghost";
  disabled?: boolean;
  className?: string;
};

export default function PrimaryButton({
  onClick,
  children,
  variant = "gold",
  disabled = false,
  className,
}: PrimaryButtonProps) {
  const [hovered, setHovered] = useState(false);

  const getBoxShadow = () => {
    if (disabled) return "none";
    if (variant === "gold") {
      return hovered
        ? "0 6px 28px rgba(255,215,0,0.65), 0 2px 8px rgba(0,0,0,0.3)"
        : "0 4px 20px rgba(180,140,0,0.4)";
    }
    if (variant === "red") {
      return hovered
        ? "0 6px 28px rgba(180,0,0,0.7)"
        : "0 4px 20px rgba(139,0,0,0.4)";
    }
    return hovered ? "0 4px 18px rgba(212,175,55,0.4)" : "0 2px 12px rgba(0,0,0,0.3)";
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "w-full py-4 font-semibold text-base cursor-pointer transition-all duration-200 active:scale-95",
        disabled && "opacity-40 pointer-events-none",
        className,
      )}
      style={{
        borderRadius: "12px",
        fontFamily: "'Cinzel', serif",
        transform: hovered && !disabled ? "scale(1.02)" : "scale(1)",
        transition: "transform 0.18s ease, box-shadow 0.18s ease",
        ...(variant === "gold"
          ? {
              background: disabled
                ? "rgba(100,80,0,0.3)"
                : hovered
                ? "linear-gradient(135deg, #c9960e 0%, #ffe033 50%, #c9960e 100%)"
                : "linear-gradient(135deg, #b8860b 0%, #ffd700 50%, #b8860b 100%)",
              color: "#1a0800",
              border: "1px solid #D4AF37",
              boxShadow: getBoxShadow(),
            }
          : variant === "red"
          ? {
              background: hovered ? "#a30000" : "#8B0000",
              color: "#FFD700",
              border: "1px solid #D4AF37",
              boxShadow: getBoxShadow(),
            }
          : {
              background: hovered ? "#4E342E" : "#3E2723",
              color: "#FFD700",
              border: "1px solid #D4AF37",
              boxShadow: getBoxShadow(),
            }),
      }}
    >
      {children}
    </button>
  );
}
