/**
 * Syntax-check every source file.
 *
 * `node --check` takes a single path, so `npm run lint` could only ever cover
 * src/main.js. This walks the tree instead, so a syntax error in a page module
 * or a library module fails the check instead of surfacing as a blank page.
 *
 * Files are parsed but not executed, so importing this stays free of side
 * effects.
 *
 * Usage: node tools/syntax-check.mjs <dir-or-file...>
 */
import { readdirSync, statSync } from "node:fs";
import { join, extname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("usage: node tools/syntax-check.mjs <dir-or-file...>");
  process.exit(1);
}

function expand(entries) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "node_modules" || name === "dist") continue;
        walk(full);
      } else if ([".js", ".mjs"].includes(extname(full))) files.push(full);
    }
  };
  for (const entry of targets) {
    if (statSync(entry).isDirectory()) walk(entry);
    else files.push(entry);
  }
  return files.sort();
}

const files = expand(targets);
const failed = [];

for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: ["ignore", "ignore", "pipe"] });
  } catch (error) {
    failed.push({ file: relative(process.cwd(), file), message: String(error.stderr || error.message).trim() });
  }
}

if (failed.length) {
  console.error(`syntax errors in ${failed.length} file(s):\n`);
  for (const { file, message } of failed) {
    console.error(`--- ${file}\n${message}\n`);
  }
  process.exit(1);
}

console.log(`syntax ok: ${files.length} file(s)`);
