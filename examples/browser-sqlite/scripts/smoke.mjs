// Boots the example in headless Chromium, creates a post through the
// preview, edits a view and checks the restarted app, then prints the app
// console. Starts its own dev server, or pass the URL of a running one.
import { chromium } from "playwright";
import { createServer } from "vite";

let server;
let url = process.argv[2];
if (!url) {
  server = await createServer({ server: { port: 4179, strictPort: true } });
  await server.listen();
  url = "http://localhost:4179/";
}
const browser = await chromium.launch();
const page = await browser.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
if (process.env.VERBOSE) page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const status = page.locator("#status");
  await page.waitForFunction(
    () =>
      ["Running", "Boot failed"].includes(document.getElementById("status")?.textContent ?? "") ||
      /Error/.test(document.getElementById("console")?.textContent ?? ""),
    null,
    { timeout: 120_000 },
  );
  console.log("status:", await status.textContent());
  const frame = page.frameLocator("#preview");
  if ((await status.textContent()) === "Running") {
    await frame.locator("h1").waitFor({ timeout: 30_000 });
    await frame.locator("input[name='post[title]']").fill("Hello from the smoke test");
    await frame.locator("input[type=submit]").click();
    await frame
      .locator("li", { hasText: "Hello from the smoke test" })
      .waitFor({ timeout: 30_000 });
    console.log("created a post through the preview");

    await page.locator("#tree .file", { hasText: "index.html.tse" }).click();
    const editor = page.locator("#editor");
    await editor.fill(
      (await editor.inputValue()).replace("<h1>Posts</h1>", "<h1>Edited posts</h1>"),
    );
    await frame.locator("h1", { hasText: "Edited posts" }).waitFor({ timeout: 60_000 });
    await frame
      .locator("li", { hasText: "Hello from the smoke test" })
      .waitFor({ timeout: 10_000 });
    console.log("an edit to a view restarted the app, and the post survived the restart");
  }
  if (process.env.SCREENSHOT) await page.screenshot({ path: process.env.SCREENSHOT });
} finally {
  console.log("--- console ---\n" + (await page.locator("#console").innerText()));
  await browser.close();
  await server?.close();
}
