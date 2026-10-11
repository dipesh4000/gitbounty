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
  globalIgnores([".next/**", ".vinext/**", "dist/**", "out/**", "build/**", "next-env.d.ts"]),
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  react.configs.flat.recommended,
  react.configs.flat["jsx-runtime"],
  reactHooks.configs.flat["recommended-latest"],
  jsxA11y.flatConfigs.recommended,
  next.configs["core-web-vitals"],
  {
    files: ["app/**/*.{tsx,jsx}"],
    // vinext 1.0.0-beta.2's production Link handler throws on page navigation.
    // Native anchors are intentional; browser tests cover the entry flow.
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.serviceworker },
    },
    settings: { react: { version: "detect" } },
  },
]);

export default eslintConfig;
