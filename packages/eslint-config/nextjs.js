import { defineConfig } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

import baseConfig from "./base.js";

export default defineConfig([
  ...baseConfig,
  ...nextVitals,
  ...nextTypeScript,
]);
