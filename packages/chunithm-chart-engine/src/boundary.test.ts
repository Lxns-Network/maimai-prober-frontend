import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(__dirname);

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.ts$/.test(entry.name) && !/\.test(kit)?\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * Static `import`/`export … from` specifiers, plus the dynamic and CommonJS forms. The static forms
 * exclude `(` so a dynamic `import(...)` on the same statement is not matched twice.
 */
const IMPORT = [
  /^\s*(?:import|export)(?:\s[^"'()]*)?\s*["']([^"']+)["']/gm,
  /\bimport\s*\(\s*["']([^"']+)["']/g,
  /\brequire\s*\(\s*["']([^"']+)["']/g,
];

function specifiers(source: string): string[] {
  const out: string[] = [];
  for (const pattern of IMPORT) for (const match of source.matchAll(pattern)) out.push(match[1]);
  return out;
}

describe("engine runtime import boundary", () => {
  it("catches every import form, not just static ones", () => {
    expect(specifiers('const a = await import("../renderers/x");')).toEqual(["../renderers/x"]);
    expect(specifiers('const b = require("../core/y");')).toEqual(["../core/y"]);
    expect(specifiers('export { c } from "../renderers/z";')).toEqual(["../renderers/z"]);
    expect(specifiers('import { d } from "./local";')).toEqual(["./local"]);
  });

  it("imports nothing outside engine and no JSON except the parser tables", async () => {
    const violations: string[] = [];
    for (const file of await walk(root)) {
      const rel = path.relative(root, file).replace(/\\/g, "/");
      for (const spec of specifiers(await readFile(file, "utf8"))) {
        if (spec.endsWith(".json") && !rel.startsWith("chart/parse/c2s/"))
          violations.push(`${rel}: ${spec}`);
        if (!spec.startsWith(".")) continue;
        const target = path.relative(root, path.resolve(path.dirname(file), spec));
        if (target.startsWith("..")) violations.push(`${rel}: ${spec}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
