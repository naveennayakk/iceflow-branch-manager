import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import te from './locales/te.json';
import hi from './locales/hi.json';
import ml from './locales/ml.json';
import kn from './locales/kn.json';
import ta from './locales/ta.json';
import or from './locales/or.json';
import mr from './locales/mr.json';

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    te: { translation: te },
    hi: { translation: hi },
    ml: { translation: ml },
    kn: { translation: kn },
    ta: { translation: ta },
    or: { translation: or },
    mr: { translation: mr },
  },
  lng: localStorage.getItem('iceflow_lang') || 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;

export const LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'తెలుగు' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'ml', label: 'മലയാളം' },
  { code: 'kn', label: 'ಕನ್ನಡ' },
  { code: 'ta', label: 'தமிழ்' },
  { code: 'or', label: 'ଓଡ଼ିଆ' },
  { code: 'mr', label: 'मराठी' },
];
