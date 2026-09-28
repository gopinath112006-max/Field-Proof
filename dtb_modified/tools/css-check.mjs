/**
 * CSS coverage check for the modular app.
 *
 * Reports classes the new markup/template code asks for that the consolidated
 * stylesheet does not define (a real bug: the element renders unstyled), and
 * classes the stylesheet defines that nothing references (dead weight).
 *
 * Only "class used in markup -> defined in CSS" is treated as an error. The
 * reverse direction is informational, because a selector can be a legitimate
 * hook for runtime code or a pseudo-element target.
 *
 * Usage: node tools/css-check.mjs <stylesheet> <markup-or-dir...>
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const [sheet, ...targets] = process.argv.slice(2);
if (!sheet || targets.length === 0) {
  console.error("usage: node tools/css-check.mjs <stylesheet> <markup-or-dir...>");
  process.exit(1);
}

function expand(entries) {
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name === "node_modules" || name === "styles") continue;
        walk(full);
      } else if (/\.(js|mjs|html)$/.test(name)) {
        files.push(full);
      }
    }
  };
  for (const entry of entries) {
    if (statSync(entry).isDirectory()) walk(entry);
    else files.push(entry);
  }
  return files;
}

const css = readFileSync(sheet, "utf8");
const files = expand(targets);
const sources = files.map((f) => ({ file: f, text: readFileSync(f, "utf8") }));

/** Classes the stylesheet defines. */
const defined = new Set();
for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) defined.add(m[1]);

/** Classes the markup asks for, per file. */
const used = new Map();
for (const { file, text } of sources) {
  // class="..." attributes, classList.add("..."), classList.toggle("...","...")
  // and className = "..." are all valid ways this project sets a class.
  const patterns = [
    /class="([^"]*)"/g,
    /class='([^']*)'/g,
    // Only string literals count: `classList.toggle(x)` passes a variable, and
    // treating that variable name as a class would produce false findings.
    /classList\.(?:add|remove|toggle|contains)\(\s*['"`]([^'"`]*)['"`]/g,
    /className\s*=\s*[`'"]([^`'"]*)[`'"]/g,
  ];
  for (const pattern of patterns) {
    for (const m of text.matchAll(pattern)) {
      // Split on whitespace, then drop anything that came from an
      // interpolation. `class="bar ${kind}"` contributes `bar`; the `${kind}`
      // is runtime data, not a class name. A fragment like `tone-${t}` is
      // incomplete on its own and is skipped rather than guessed at.
      for (let part of m[1].split(/\s+/)) {
        part = part.replace(/\$\{[^{}]*\}/g, "");
        if (!part) continue;
        if (/[${}]/.test(part)) continue;
        if (!/^-?[_a-zA-Z][\w-]*$/.test(part)) continue;
        if (!used.has(part)) used.set(part, new Set());
        used.get(part).add(file);
      }
    }
  }
}

const missing = [...used.entries()]
  .filter(([name]) => !defined.has(name))
  .sort((a, b) => a[0].localeCompare(b[0]));

const orphans = [...defined]
  .filter((name) => !used.has(name))
  .sort((a, b) => a.localeCompare(b));

console.log(`stylesheet: ${sheet}`);
console.log(`markup:     ${files.length} file(s)`);
console.log(`defined classes: ${defined.size}`);
console.log(`used classes:    ${used.size}`);

console.log(`\nMISSING (used in markup, not defined in CSS): ${missing.length}`);
for (const [name, where] of missing) {
  console.log(`  .${name}`);
  for (const f of where) console.log(`      ${f}`);
}

console.log(`\nUNREFERENCED (defined in CSS, never used): ${orphans.length}`);
for (let i = 0; i < orphans.length; i += 6) {
  console.log(`  ${orphans.slice(i, i + 6).map((n) => `.${n}`).join("  ")}`);
}

process.exitCode = missing.length > 0 ? 1 : 0;
