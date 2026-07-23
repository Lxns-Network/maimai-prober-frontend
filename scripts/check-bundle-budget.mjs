import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { gzipSync } from "node:zlib";

const clientRoot = resolve("dist/client");
const budgets = [
  { route: "login", html: "login/index.html", gzipBudget: 450 * 1024 },
  { route: "user/scores", html: "user/scores/index.html", gzipBudget: 550 * 1024 },
];

let failed = false;

for (const budget of budgets) {
  const html = readFileSync(resolve(clientRoot, budget.html), "utf8");
  const assets = new Set(
    [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map((match) => match[1]),
  );
  const gzipSize = [...assets].reduce(
    (total, asset) => total + gzipSync(readFileSync(resolve(clientRoot, `.${asset}`))).byteLength,
    0,
  );
  const formattedSize = `${(gzipSize / 1024).toFixed(1)} KiB`;
  const formattedBudget = `${(budget.gzipBudget / 1024).toFixed(0)} KiB`;

  if (gzipSize > budget.gzipBudget) {
    failed = true;
    console.error(`${budget.route}: ${formattedSize} exceeds ${formattedBudget}`);
  } else {
    console.log(`${budget.route}: ${formattedSize} / ${formattedBudget}`);
  }
}

if (failed) process.exitCode = 1;
