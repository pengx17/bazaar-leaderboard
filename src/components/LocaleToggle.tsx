import { useTranslation } from "react-i18next";

export function LocaleToggle() {
  const { i18n } = useTranslation();
  const isZh = i18n.language === "zh";

  return (
    <button
      onClick={() => i18n.changeLanguage(isZh ? "en" : "zh")}
      className="px-2 py-1.5 rounded-lg text-xs font-mono font-bold text-muted-foreground hover:text-foreground hover:bg-card/80 border border-transparent hover:border-border/40 transition-colors"
    >
      {isZh ? "EN" : "中"}
    </button>
  );
}
