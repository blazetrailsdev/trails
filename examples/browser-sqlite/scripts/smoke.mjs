import { chromium } from "playwright";
import { createServer } from "vite";

let server;
let url = process.argv[2];
if (!url) {
  server = await createServer({ server: { port: 4179, strictPort: true } });
  await server.listen();
  url = "http://localhost:4179/";
}
const shots = process.env.SCREENSHOTS;
const browser = await chromium.launch();
const colorScheme = process.env.COLOR_SCHEME === "dark" ? "dark" : "light";
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, colorScheme });
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
if (process.env.VERBOSE) page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
const frame = page.frameLocator("#preview");
const shot = async (name) => {
  if (!shots) return;
  await page.evaluate(() => globalThis.scrollTo(0, 0));
  await page.screenshot({ path: `${shots}/${name}-editor-${colorScheme}.png` });
  await page
    .locator("#preview")
    .screenshot({ path: `${shots}/${name}-preview-${colorScheme}.png` });
};
const see = (selector, hasText) =>
  frame.locator(selector, { hasText }).first().waitFor({ timeout: 30_000 });
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
  if ((await status.textContent()) !== "Running") throw new Error("the app did not boot");

  await see("h1", "Posts");
  await frame.locator("nav a", { hasText: "New post" }).click();
  await see("h1", "New post");
  await frame.locator("input[type=submit]").click();
  await see(".errors", "Title can't be blank");
  console.log("a blank title re-renders the form with its error");
  await shot("validation");

  await frame.locator("input[name='post[title]']").fill("  Hello   from the smoke test ");
  await frame.locator("textarea[name='post[body]']").fill("First paragraph.\n\nSecond paragraph.");
  await frame.locator("input[type=submit]").click();
  await see(".notice", "Post was successfully created.");
  await see("h1", "Hello from the smoke test");
  console.log("created a post; the beforeValidation callback squished its title");

  await frame.locator("input[value='Add comment']").click();
  await see(".errors", "Author can't be blank");
  console.log("an invalid comment re-renders the post with its errors");

  await frame.locator("input[name='comment[author]']").fill("Ada");
  await frame.locator("textarea[name='comment[body]']").fill("Runs in a tab. Nice.");
  await frame.locator("input[value='Add comment']").click();
  await see(".notice", "Thanks for your comment.");
  await see("h2", "1 comment");
  console.log("commented through the nested resource; the counter cache counted it");
  await shot("show");

  await frame.locator("a", { hasText: "Edit this post" }).click();
  await frame.locator("input[name='post[published]'][type=checkbox]").check();
  await frame.locator("input[type=submit]").click();
  await see(".notice", "Post was successfully updated.");
  await see(".badge.published", "published");
  console.log("edited the post and published it");

  await frame.locator("nav a", { hasText: "All posts" }).click();
  await see("article", "Hello from the smoke test");
  await shot("index");

  await page.locator("#tree .file", { hasText: "index.html.tse" }).click();
  const editor = page.locator("#editor");
  await editor.fill((await editor.inputValue()).replace("<h1>Posts</h1>", "<h1>Edited posts</h1>"));
  await see("h1", "Edited posts");
  await see("article", "Hello from the smoke test");
  console.log("an edit to a view restarted the app, and the post survived the restart");
} finally {
  console.log("--- console ---\n" + (await page.locator("#console").innerText()));
  await browser.close();
  await server?.close();
}
