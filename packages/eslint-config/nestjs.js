import { defineConfig } from "eslint/config";
import globals from "globals";

import baseConfig from "./base.js";

export default defineConfig([
  ...baseConfig,
  {
    files: ["**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
]);
