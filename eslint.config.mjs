import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.data/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/*.d.ts"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: { ecmaVersion: 2023, sourceType: "module" }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ],
      "no-restricted-globals": "off"
    }
  },
  {
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "tests/**/*.ts",
      "packages/db/src/cli.ts",
      "apps/**/src/main.ts",
      "**/migrate.ts",
      "**/env.ts",
      "scripts/**",
      "**/*.mjs",
      "playwright.config.ts",
      "vitest.workspace.ts"
    ],
    rules: { "no-restricted-globals": "off", "no-undef": "off" }
  }
];
