// Phase 13 — ESLint flat config (server).
//
// Scope: the lint gate required by the PRD ("every PR runs typecheck, lint,
// test, npm audit"). Rules are the typescript-eslint recommended core plus a
// few hardening rules; stylistic opinions are deliberately left to
// `tsc --noEmit` (strict mode) and code review so the gate stays about
// correctness, not formatting.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**", "logs/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
    },
    rules: {
      // The codebase intentionally uses `any` at Mongoose/Express boundaries
      // and in test factories; strict typing there is enforced by tsc where
      // it matters. Flagging every `any` would drown the signal.
      "@typescript-eslint/no-explicit-any": "off",
      // Test files legitimately assert on loosely-typed payloads.
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      // Empty catch blocks are used for deliberate duplicate-key recovery.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  },
  {
    files: ["test/**/*.ts"],
    rules: {
      // Tests seed randomness / unique ids freely; unused vars there are noise.
      "@typescript-eslint/no-unused-vars": "warn",
    },
  }
);
