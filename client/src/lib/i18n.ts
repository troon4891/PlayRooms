import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import common from "../locales/en/common.json";
import room from "../locales/en/room.json";
import toybox from "../locales/en/toybox.json";
import consent from "../locales/en/consent.json";
import moderation from "../locales/en/moderation.json";

const resources = {
  en: {
    common,
    room,
    toybox,
    consent,
    moderation,
  },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common", "room", "toybox", "consent", "moderation"],
  interpolation: {
    escapeValue: false,
  },
  detection: {
    order: ["navigator", "htmlTag"],
  },
});

export default i18n;
