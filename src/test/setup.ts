import "@testing-library/jest-dom/vitest";
// Ensure i18n is initialized and locked to Chinese for consistent test assertions
import i18n from "../i18n";
i18n.changeLanguage("zh-CN");
