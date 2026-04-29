import { motion } from "motion/react";

// Valid room code characters (no 0,1,I,O to avoid confusion)
const KEY_ROWS = [
  ["A", "B", "C", "D", "E", "F", "G", "H"],
  ["J", "K", "L", "M", "N", "P", "Q", "R"],
  ["S", "T", "U", "V", "W", "X", "Y", "Z"],
  ["2", "3", "4", "5", "6", "7", "8", "9"],
];

type CustomKeypadProps = {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
};

export default function CustomKeypad({
  value,
  onChange,
  maxLength = 6,
}: CustomKeypadProps) {
  const handleKey = (key: string) => {
    if (value.length < maxLength) onChange(value + key);
  };
  const handleDelete = () => onChange(value.slice(0, -1));
  const handleClear = () => onChange("");

  return (
    <div className="w-full select-none">
      {/* Code display */}
      <div className="flex justify-center gap-1.5 mb-4">
        {Array.from({ length: maxLength }).map((_, i) => (
          <motion.div
            key={i}
            animate={
              value[i]
                ? { scale: [1, 1.15, 1], transition: { duration: 0.15 } }
                : {}
            }
            className="w-10 h-12 flex items-center justify-center rounded-lg text-xl font-bold"
            style={{
              background: value[i]
                ? "rgba(200,150,30,0.18)"
                : "rgba(0,0,0,0.3)",
              border: `1px solid ${value[i] ? "rgba(200,150,30,0.55)" : "rgba(200,150,30,0.18)"}`,
              color: "#ffd700",
              fontFamily: "Cinzel, serif",
              boxShadow: value[i]
                ? "0 0 8px rgba(200,150,30,0.25)"
                : "none",
              transition: "all 0.15s ease",
            }}
          >
            {value[i] ?? ""}
          </motion.div>
        ))}
      </div>

      {/* Key rows */}
      <div className="space-y-1">
        {KEY_ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1 justify-center">
            {row.map((key) => (
              <motion.button
                key={key}
                whileTap={{ scale: 0.88 }}
                onClick={() => handleKey(key)}
                disabled={value.length >= maxLength}
                className="flex-1 h-8 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-35 transition-colors"
                style={{
                  background: "rgba(200,150,30,0.1)",
                  border: "1px solid rgba(200,150,30,0.22)",
                  color: "#ffd700",
                  fontFamily: "Cinzel, serif",
                  maxWidth: "38px",
                  minWidth: "28px",
                }}
              >
                {key}
              </motion.button>
            ))}
          </div>
        ))}
      </div>

      {/* Delete / Clear */}
      <div className="flex gap-2 mt-2.5">
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={handleClear}
          disabled={value.length === 0}
          className="flex-1 h-9 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-35 transition-colors"
          style={{
            background: "rgba(180,30,0,0.18)",
            border: "1px solid rgba(200,50,30,0.3)",
            color: "#ff9999",
          }}
        >
          Очистить
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={handleDelete}
          disabled={value.length === 0}
          className="flex-1 h-9 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-35 transition-colors"
          style={{
            background: "rgba(100,70,0,0.18)",
            border: "1px solid rgba(200,150,30,0.22)",
            color: "#ffd700",
          }}
        >
          ← Удалить
        </motion.button>
      </div>
    </div>
  );
}
