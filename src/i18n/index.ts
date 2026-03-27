import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import Chinese translations
import zhCNCommon from './locales/zh-CN/common.json';
import zhCNSidebar from './locales/zh-CN/sidebar.json';
import zhCNWorkspace from './locales/zh-CN/workspace.json';
import zhCNSettings from './locales/zh-CN/settings.json';
import zhCNFramework from './locales/zh-CN/framework.json';
import zhCNHistory from './locales/zh-CN/history.json';
import zhCNAgent from './locales/zh-CN/agent.json';
import zhCNErrors from './locales/zh-CN/errors.json';

// Import English translations
import enUSCommon from './locales/en-US/common.json';
import enUSSidebar from './locales/en-US/sidebar.json';
import enUSWorkspace from './locales/en-US/workspace.json';
import enUSSettings from './locales/en-US/settings.json';
import enUSFramework from './locales/en-US/framework.json';
import enUSHistory from './locales/en-US/history.json';
import enUSAgent from './locales/en-US/agent.json';
import enUSErrors from './locales/en-US/errors.json';

export const resources = {
  'zh-CN': {
    common: zhCNCommon,
    sidebar: zhCNSidebar,
    workspace: zhCNWorkspace,
    settings: zhCNSettings,
    framework: zhCNFramework,
    history: zhCNHistory,
    agent: zhCNAgent,
    errors: zhCNErrors,
  },
  'en-US': {
    common: enUSCommon,
    sidebar: enUSSidebar,
    workspace: enUSWorkspace,
    settings: enUSSettings,
    framework: enUSFramework,
    history: enUSHistory,
    agent: enUSAgent,
    errors: enUSErrors,
  },
} as const;

export const supportedLanguages = ['zh-CN', 'en-US'] as const;
export type SupportedLanguage = (typeof supportedLanguages)[number];

export const languageNames: Record<SupportedLanguage, string> = {
  'zh-CN': '中文',
  'en-US': 'EN',
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'zh-CN',
    supportedLngs: supportedLanguages,
    ns: ['common', 'sidebar', 'workspace', 'settings', 'framework', 'history', 'agent', 'errors'],
    defaultNS: 'common',
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'topgun-language',
    },
  });

export default i18n;