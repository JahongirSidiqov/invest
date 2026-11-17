import { DEFAULT_LOCALE, LOCALES, type Locale } from '@invest/shared';
import en from '@invest/shared/locales/en.json';
import ru from '@invest/shared/locales/ru.json';
import uz from '@invest/shared/locales/uz.json';
import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

/** Device language if supported, otherwise Uzbek (the brief's default). */
export function deviceLocale(): Locale {
  const code = getLocales()[0]?.languageCode;
  return (LOCALES as readonly string[]).includes(code ?? '') ? (code as Locale) : DEFAULT_LOCALE;
}

void i18n.use(initReactI18next).init({
  resources: { uz: { translation: uz }, ru: { translation: ru }, en: { translation: en } },
  lng: deviceLocale(),
  fallbackLng: 'ru',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
