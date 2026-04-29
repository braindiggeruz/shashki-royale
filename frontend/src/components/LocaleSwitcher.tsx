import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, SUPPORTED_LOCALES_ARRAY, changeLocale, type SupportedLocale } from "../i18n.ts";

type Props = {
  compact?: boolean;
};

export default function LocaleSwitcher({ compact = false }: Props) {
  const { i18n } = useTranslation();
  const current = i18n.language as SupportedLocale;

  const handleChange = (lng: SupportedLocale) => {
    void changeLocale(lng);
  };

  if (compact) {
    return (
      <div className="flex gap-1">
        {(SUPPORTED_LOCALES_ARRAY as SupportedLocale[]).map((lng) => {
          const meta = SUPPORTED_LOCALES[lng];
          const isActive = current === lng;
          return (
            <button
              key={lng}
              onClick={() => handleChange(lng)}
              className="px-2 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all"
              style={{
                background: isActive ? "rgba(255,215,0,0.18)" : "rgba(255,255,255,0.05)",
                border: isActive ? "1px solid rgba(255,215,0,0.5)" : "1px solid rgba(255,255,255,0.1)",
                color: isActive ? "#ffd700" : "rgba(200,150,50,0.5)",
                fontFamily: "Cinzel, serif",
              }}
            >
              {meta.emoji} {meta.nativeName}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {(SUPPORTED_LOCALES_ARRAY as SupportedLocale[]).map((lng) => {
        const meta = SUPPORTED_LOCALES[lng];
        const isActive = current === lng;
        return (
          <button
            key={lng}
            onClick={() => handleChange(lng)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all"
            style={{
              background: isActive ? "rgba(255,215,0,0.1)" : "rgba(255,255,255,0.04)",
              border: isActive ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <span className="text-2xl">{meta.emoji}</span>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: isActive ? "#ffd700" : "rgba(220,180,80,0.8)" }}>
                {meta.nativeName}
              </p>
              <p className="text-xs" style={{ color: "rgba(200,150,50,0.4)" }}>
                {meta.name}
              </p>
            </div>
            {isActive && (
              <div className="ml-auto w-2 h-2 rounded-full" style={{ background: "#ffd700" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
