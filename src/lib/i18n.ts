import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./messages/en";
import zh from "./messages/zh";

function detectLocale(): string {
  const stored = localStorage.getItem("locale");
  if (stored === "en" || stored === "zh") return stored;
  return navigator.language.startsWith("zh") ? "zh" : "en";
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: detectLocale(),
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
});

i18n.on("languageChanged", (lng) => {
  localStorage.setItem("locale", lng);
});

export default i18n;
