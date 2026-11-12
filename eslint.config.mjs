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
    // Wrangler's local files (npx wrangler pages dev)
    ".wrangler/**",
    // Third-party files served as they are (the map's Arabic text plugin).
    "public/vendor/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
