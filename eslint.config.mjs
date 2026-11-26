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
    // Vendored Solidity dependencies installed by forge.
    "contracts/lib/**",
    "contracts/out/**",
    // Separate Chainlink CRE project with its own toolchain and lint rules.
    "collect-oracle/**",
  ]),
]);

export default eslintConfig;
