import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["build/**", "public/**"],
  },
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
    rules: {
      "react-hooks/exhaustive-deps": "warn", // Ensure React hooks dependencies are checked
    },
  },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
];
