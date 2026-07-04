/**
 * Captures the README screenshots from a running dev server (http://localhost:3000).
 *
 *   pnpm --filter web dev   # in another terminal
 *   node scripts/screenshots.mjs
 *
 * Output: docs/screenshots/*.png
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";

const pages = [
  {
    name: "canvas",
    url: `${BASE}/canvas?flowId=seed-flow-rwc`,
    // Fit the flow to the viewport before capturing
    prepare: async (page) => {
      // Wait until the whole seed flow is mounted (8 nodes), then fit it to the viewport
      await page.waitForFunction(
        () => document.querySelectorAll(".react-flow__node").length >= 8,
        { timeout: 20000 },
      );
      await page.waitForTimeout(500);
      await page.click(".react-flow__controls-fitview");
      await page.waitForTimeout(1000);
    },
  },
  {
    name: "run-trace",
    url: `${BASE}/runs/${process.env.RUN_ID ?? "cmr6b19lh00fhsrg5dvzzd7m7"}`,
    prepare: async (page) => page.waitForTimeout(4000),
  },
  {
    name: "vault",
    url: `${BASE}/vault`,
    prepare: async (page) => page.waitForTimeout(4000),
  },
  {
    name: "runs-list",
    url: `${BASE}/runs`,
    prepare: async (page) => page.waitForTimeout(3000),
  },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });

for (const p of pages) {
  await page.goto(p.url, { waitUntil: "networkidle" });
  await p.prepare(page);
  await page.screenshot({ path: `${OUT}/${p.name}.png` });
  console.log(`✓ ${OUT}/${p.name}.png`);
}

await browser.close();
