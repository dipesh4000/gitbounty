import { defineConfig, globalIgnores } from "eslint/config";
import eslint from "@eslint/js";
import next from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  // Build output and generated files only. No application file is excluded: the three that used to be
  // here were dead components, and they have been deleted rather than hidden from the linter.
  globalIgnores([".next/**", ".vinext/**", ".wrangler/**", "dist/**", "out/**", "build/**", "next-env.d.ts"]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    files: ["app/**/*.{tsx,jsx}"],
    // Full-page navigation is intentional, including same-origin OAuth/logout routes owned by FastAPI.
    // Browser tests cover the entry flow.
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "@next/next/no-location-assign-relative-destination": "off",
    },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    settings: { react: { version: "detect" } },
  },
]);

export default eslintConfig;
