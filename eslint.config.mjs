import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // FU-7: 本地 artifact 与历史设计稿目录，非生产代码不做 lint
    ".claude/**",
    "design-system/**",
    "Peak Trekker Design System/**",
    "playwright-report/**",
    "output/**",
  ]),
]);

export default eslintConfig;
