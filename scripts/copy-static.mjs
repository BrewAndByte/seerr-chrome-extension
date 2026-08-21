// Copies every non-TypeScript file from src/ into dist/, preserving relative
// paths, so `npm run build` produces a single loadable unpacked-extension
// directory (dist/) without needing a bundler.
import { cpSync, readdirSync, mkdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, "src");
const distDir = join(root, "dist");

function copyRecursive(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const srcPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath);
      continue;
    }
    if (entry.name.endsWith(".ts")) continue;

    const relative = srcPath.slice(srcDir.length + 1);
    const destPath = join(distDir, relative);
    mkdirSync(dirname(destPath), { recursive: true });
    cpSync(srcPath, destPath);
  }
}

statSync(srcDir);
copyRecursive(srcDir);
console.log("Copied static assets into dist/");
