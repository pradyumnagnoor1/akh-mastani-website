import { rm } from "node:fs/promises";

// Fixed, repo-local generated paths only. Keep dependencies, environment files,
// deployment linking, source, migrations and project workflow records.
const generatedPaths = [
  ".next",
  ".next-e2e",
  ".next-e2e-segments",
  "test-results",
  "playwright-report",
  "coverage",
  "tsconfig.tsbuildinfo",
  "next-env.d.ts",
];
const root = new URL("../", import.meta.url);

for (const relativePath of generatedPaths) {
  await rm(new URL(relativePath, root), { recursive: true, force: true });
}

console.log("Removed generated build, typecheck and test output.");
