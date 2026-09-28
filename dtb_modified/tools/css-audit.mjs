/**
 * One-off CSS audit: reports the duplication found in the original style.css so
 * the consolidation can be done with exact, reviewable edits.
 *
 * Usage: node tools/css-audit.mjs style.css
 */
import { readFileSync } from "node:fs";

const [file] = process.argv.slice(2);
const css = readFileSync(file, "utf8");
const lines = css.split("\n");

const lineOf = (index) => {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (css[i] === "\n") line += 1;
  return line;
};

console.log(`file: ${file}`);
console.log(`lines: ${lines.length}`);
console.log(`bytes: ${Buffer.byteLength(css)}`);

console.log("\n-- :root blocks --");
for (const m of css.matchAll(/:root\s*\{/g)) {
  const start = lineOf(m.index);
  const end = lineOf(css.indexOf("}", m.index));
  const body = css.slice(m.index, css.indexOf("}", m.index) + 1);
  const vars = body.match(/--[a-z0-9-]+\s*:/gi) || [];
  console.log(`  line ${start}-${end}: ${vars.length} custom properties`);
}

console.log("\n-- light-theme rule counts (expect 1 each) --");
const lightSelectors = new Map();
for (const m of css.matchAll(/html\[data-theme=["']?light["']?\]/g)) {
  // Walk back to the start of this rule's selector list.
  let i = m.index;
  while (i > 0 && css[i] !== "{" && css[i] !== "}") i -= 1;
  const sel = css.slice(i + 1, m.index).trim().replace(/\s+/g, " ");
  const key = sel || "(leading)";
  lightSelectors.set(key, (lightSelectors.get(key) || 0) + 1);
}
for (const [sel, count] of [...lightSelectors].sort((a, b) => b[1] - a[1])) {
  if (count > 1) console.log(`  x${count}  ${sel.slice(0, 110)}`);
}
console.log(`  distinct light-theme selector groups: ${lightSelectors.size}`);

console.log("\n-- suspected typos --");
for (const m of css.matchAll(/\.html\[data-theme[^{]*/g)) {
  console.log(`  line ${lineOf(m.index)}: ${m[0].slice(0, 110).replace(/\s+/g, " ")}`);
}
for (const m of css.matchAll(/@(?:media|supports)[^{]*prefers-reduced-motion[^{]*/g)) {
  console.log(`  line ${lineOf(m.index)}: ${m[0].slice(0, 110).replace(/\s+/g, " ")}`);
}

console.log("\n-- @import / @charset / url() usage --");
for (const m of css.matchAll(/@(import|charset|font-face)[^;{]*/g)) {
  console.log(`  line ${lineOf(m.index)}: ${m[0].slice(0, 120)}`);
}
console.log(`  url(...) count: ${(css.match(/url\(/g) || []).length}`);

console.log("\n-- .fc-3d / .tilt-card / display hooks --");
for (const sel of [".fc-3d", ".tilt-card", ".display-enhanced", ".uv-display", ".reduced-motion", ".siren-click"]) {
  const n = (css.match(new RegExp(`\\${sel}\\b`, "g")) || []).length;
  console.log(`  ${sel}: ${n} occurrence(s)`);
}
