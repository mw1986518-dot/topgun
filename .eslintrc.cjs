module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ["@typescript-eslint", "react-hooks"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  ignorePatterns: [
    "dist/",
    "src-tauri/target/",
    "node_modules/",
    "playwright-report/",
    "test-results/",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        varsIgnorePattern: "^_",
        argsIgnorePattern: "^_",
      },
    ],
    // 本项目有不少与 Tauri IPC 交互的动态对象，先不强行禁 any。
    "@typescript-eslint/no-explicit-any": "off",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "e2e/**/*.ts"],
      globals: {
        describe: "readonly",
        it: "readonly",
        test: "readonly",
        expect: "readonly",
        vi: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
      },
    },
  ],
};
