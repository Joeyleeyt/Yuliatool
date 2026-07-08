// Production packaging fix for the pnpm-deployed worker.
//
// The @yulia/* workspace packages declare `exports` pointing at TypeScript
// source (./src/*.ts) so that `tsx` can run them directly in development. In a
// production image we run plain `node dist/main.js`, which cannot import .ts
// from node_modules. `pnpm deploy` copies each package's compiled `dist/`
// alongside `src/` but leaves `exports` pointing at src (it does not apply
// `publishConfig` on deploy as of pnpm 9.7).
//
// This script rewrites every deployed @yulia/* package.json so each `exports`
// target resolves to the compiled output: ./src/foo.ts -> ./dist/foo.js. It runs
// only inside the Docker build (never in local dev), so the dev flow is
// untouched.
//
// Usage: node fix-workspace-exports.mjs <deployDir>
import { readdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';

const deployDir = process.argv[2];
if (!deployDir) {
  console.error('usage: fix-workspace-exports.mjs <deployDir>');
  process.exit(1);
}
// Never follow a symlink out of the deploy tree and rewrite real source files
// (pnpm deploy on some platforms symlinks back to the workspace).
const deployRoot = realpathSync(resolve(deployDir));

const srcToDist = (value) =>
  value.replace(/^\.\/src\//, './dist/').replace(/\.ts$/, '.js');

const rewriteExports = (exports) => {
  if (typeof exports === 'string') return srcToDist(exports);
  if (exports && typeof exports === 'object') {
    const out = {};
    for (const [key, val] of Object.entries(exports)) out[key] = rewriteExports(val);
    return out;
  }
  return exports;
};

const nodeModules = join(deployDir, 'node_modules');
const seen = new Set();
let patched = 0;

// Walk node_modules for package.json files; only touch @yulia/* packages.
for (const path of readdirSync(nodeModules, { recursive: true })) {
  if (!path.endsWith('package.json')) continue;
  const full = join(nodeModules, path);
  let real;
  try {
    real = realpathSync(full);
  } catch {
    continue;
  }
  if (seen.has(real)) continue;
  seen.add(real);
  // Guard: only touch files that physically live inside the deploy tree.
  if (real !== deployRoot && !real.startsWith(deployRoot + '\\') && !real.startsWith(deployRoot + '/')) {
    continue;
  }

  let pkg;
  try {
    pkg = JSON.parse(readFileSync(real, 'utf8'));
  } catch {
    continue;
  }
  if (!pkg.name?.startsWith('@yulia/') || !pkg.exports) continue;

  pkg.exports = rewriteExports(pkg.exports);
  writeFileSync(real, JSON.stringify(pkg, null, 2) + '\n');
  patched += 1;
  console.log(`rewrote exports -> dist: ${pkg.name}`);
}

console.log(`fix-workspace-exports: patched ${patched} package(s)`);
