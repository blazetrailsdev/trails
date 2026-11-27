import * as playwright from "playwright";
import { createServer, preview } from "vite";

let server;
let url = process.argv[2];
const dist = process.env.DIST;
if (dist) {
  const base = process.env.BASE ?? "/";
  server = await preview({
    base,
    build: { outDir: dist },
    preview: { port: 4179, strictPort: true },
  });
  url = `http://localhost:4179${base}`;
} else if (!url) {
  server = await createServer({ server: { port: 4179, strictPort: true } });
  await server.listen();
  url = "http://localhost:4179/";
}
const shots = process.env.SCREENSHOTS;
const engine = process.env.BROWSER ?? "chromium";
if (!["chromium", "firefox", "webkit"].includes(engine)) {
  throw new Error(`BROWSER must be chromium, firefox or webkit, not ${engine}`);
}
const browser = await playwright[engine].launch();
console.log("browser:", engine);
const colorScheme = process.env.COLOR_SCHEME === "dark" ? "dark" : "light";
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, colorScheme });
if (process.env.REGEXP_MODIFIERS === "off") {
  await context.addInitScript(() => {
    const Native = RegExp;
    const hasModifierGroup = (source) => {
      let inClass = false;
      for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === "\\") i++;
        else if (inClass) inClass = c !== "]";
        else if (c === "[") inClass = true;
        else if (c === "(" && /^\(\?(?!:)[ims]*(?:-[ims]+)?:/.test(source.slice(i))) return true;
      }
      return false;
    };
    const reject = (pattern) => {
      const source = pattern instanceof Native ? pattern.source : String(pattern);
      if (hasModifierGroup(source)) {
        throw new SyntaxError("Invalid regular expression: unrecognized character after (?");
      }
    };
    globalThis.RegExp = new Proxy(Native, {
      construct: (target, args, newTarget) => (
        reject(args[0]),
        Reflect.construct(target, args, newTarget)
      ),
      apply: (target, self, args) => (reject(args[0]), Reflect.apply(target, self, args)),
    });
  });
  console.log("regexp modifier groups: rejected, as Safari before 26 does");
}
const page = await context.newPage();
page.on("pageerror", (e) => console.log("[pageerror]", e.message));
const mailerRequests = [];
const infoRequests = [];
context.on("request", (r) => {
  if (r.serviceWorker()) return;
  if (/mailers-controller|\/actionmailer\//.test(r.url())) mailerRequests.push(r.url());
  if (/info-controller/.test(r.url())) infoRequests.push(r.url());
});
if (process.env.VERBOSE)
  page.on("response", (r) => r.status() >= 400 && console.log("[bad]", r.status(), r.url()));
if (process.env.VERBOSE) page.on("console", (m) => console.log(`[${m.type()}]`, m.text()));
const frame = page.frameLocator("#preview");
const shot = async (name) => {
  if (!shots) return;
  await page.waitForTimeout(500);
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
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("trails-browser:hint-seen", "1");
  });
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
  if (!infoRequests.length) throw new Error("boot fetched no info controller to compare with");
  if (mailerRequests.length) throw new Error(`boot fetched the mailers: ${mailerRequests[0]}`);
  console.log("boot loaded no mailers controller");

  await see("h1", "Posts");
  await see("article", "Three days on the Wonderland Trail");
  await see("article", "Draft: winter trip planning");
  console.log("db/seeds.ts seeded the new database");
  await shot("index");

  await frame.locator("article a", { hasText: "Wonderland Trail" }).click();
  await see("h2", "3 comments");
  await shot("show");
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

  await frame.locator("a", { hasText: "Edit this post" }).click();
  await frame.locator("input[name='post[published]'][type=checkbox]").check();
  await frame.locator("input[type=submit]").click();
  await see(".notice", "Post was successfully updated.");
  await see(".badge.published", "published");
  console.log("edited the post and published it");

  await frame.locator("nav a", { hasText: "All posts" }).click();
  await see("article", "Hello from the smoke test");

  await page.locator("#tree .file", { hasText: "_form.html.tse" }).first().click();
  await page.locator("#highlight .line").first().waitFor({ timeout: 30_000 });
  console.log("the editor highlights a .tse view");
  await shot("view");

  await page.locator("#tree .file", { hasText: "index.html.tse" }).click();
  const editor = page.locator("#editor");
  await editor.fill((await editor.inputValue()).replace("<h1>Posts</h1>", "<h1>Edited posts</h1>"));
  await see("h1", "Edited posts");
  await see("article", "Hello from the smoke test");
  console.log("an edit to a view restarted the app, and the post survived the restart");

  const consoleHas = (text) =>
    page.locator("#console", { hasText: text }).waitFor({ timeout: 30_000 });
  await page.locator("#repl-input").fill("await Post.count()");
  await page.locator("#repl-input").press("Enter");
  await consoleHas(/› await Post\.count\(\)\s[\s\S]*\b7\b/);
  console.log("the console ran a query against the app's models");

  await page.locator("#tab-database").click();
  await page.locator("#database .tables button", { hasText: "posts (7)" }).click();
  await page.locator("#database td", { hasText: "Hello from the smoke test" }).waitFor();
  await shot("database");
  await page.locator("#tab-console").click();
  console.log("the database tab lists the tables and their rows");

  await page.locator("#tree .file", { hasText: "post.ts" }).click();
  const model = await editor.inputValue();
  await editor.fill(model.replace("export class Post", "export clas Post"));
  await page
    .locator("#overlay", { hasText: "/app/models/post.ts:6:" })
    .waitFor({ timeout: 30_000 });
  if ((await status.getAttribute("data-state")) !== "error") throw new Error("status is not red");
  await page.locator("#problems", { hasText: "Line 6" }).waitFor();
  await shot("syntax-error");
  await editor.fill(model);
  await page.locator("#overlay").waitFor({ state: "hidden", timeout: 30_000 });
  await see("h1", "Edited posts");
  console.log("a syntax error names its file and line over the preview, and fixing it recovers");

  await editor.fill(
    model.replace("export class Post", 'const typo: number = "x";\nexport class Post'),
  );
  await page
    .locator("#problems button.warning", { hasText: "Line 6: Type 'string' is not assignable" })
    .waitFor({ timeout: 60_000 });
  await page.locator("#gutter .warning").first().waitFor();
  await status.filter({ hasText: "Running" }).waitFor({ timeout: 30_000 });
  await see("h1", "Edited posts");
  await shot("type-error");
  await editor.fill(model);
  await page.locator("#problems").waitFor({ state: "hidden", timeout: 30_000 });
  await status.filter({ hasText: "Running" }).waitFor({ timeout: 30_000 });
  console.log("a type error is a warning in the editor, and the app keeps running");

  if (engine === "chromium") {
    const cdp = await context.newCDPSession(page);
    await cdp.send("ServiceWorker.enable");
    await cdp.send("ServiceWorker.stopAllWorkers");
    await page.locator("#reload").click();
    await see("h1", "Edited posts");
    console.log("the preview survives the browser stopping the service worker");
  }

  const other = await context.newPage();
  await other.goto(url);
  await other.locator("#status", { hasText: /^Running$/ }).waitFor({ timeout: 120_000 });
  await other.locator("#console", { hasText: "open in another tab" }).waitFor({ timeout: 30_000 });
  await other.close();
  await page.locator("#reload").click();
  await see("h1", "Edited posts");
  console.log("a second tab runs its own app and leaves this one serving");

  await page.locator("#tree .file", { hasText: "index.html.tse" }).click();
  await editor.focus();
  await page.keyboard.press("Control+f");
  await page.locator("#find [name=find]").fill("Edited posts");
  await page.locator("#find [name=find]").press("Enter");
  await page.locator("#find output", { hasText: "1 of 1" }).waitFor();
  await page.locator("#find [name=replace]").fill("Found posts");
  await page.locator("#find [name=all]").click();
  await see("h1", "Found posts");
  await page.keyboard.press("Escape");
  console.log("find and replace changed the open view");

  page.once("dialog", (dialog) => dialog.accept("model Tag name:string"));
  await page.locator("#generate").click();
  await page.locator("#tree .file", { hasText: "tag.ts" }).first().waitFor({ timeout: 60_000 });
  await page.locator("#tree .file", { hasText: "_create_tags.ts" }).waitFor();
  await page.locator("#status", { hasText: /^Running$/ }).waitFor({ timeout: 60_000 });
  await page.locator("#repl-input").fill("await Tag.count()");
  await page.locator("#repl-input").press("Enter");
  await consoleHas(/› await Tag\.count\(\)\s[\s\S]*\b0\b/);
  console.log("bin/trails generate model wrote a model and a migration, and the migration ran");

  await page.locator("#example").selectOption("library");
  await page.waitForURL(/./);
  await page.locator("#status", { hasText: /^Running$/ }).waitFor({ timeout: 120_000 });
  await frame.locator("body", { hasText: "Ursula K. Le Guin" }).waitFor({ timeout: 30_000 });
  if (await page.locator("#tree .file", { hasText: "tag.ts" }).count())
    throw new Error("the library example shows the blog's files");
  console.log("the library example runs with its own files and database");
  await page.locator("#example").selectOption("blog");
  await page.locator("#status", { hasText: /^Running$/ }).waitFor({ timeout: 120_000 });
  await see("h1", "Found posts");
  console.log("switching back to the blog keeps its edits");

  if (dist && engine === "chromium") {
    await page.waitForFunction(
      async () => {
        const sw = await (await fetch("sw.js")).text();
        const { version, files } = JSON.parse(/const PRECACHE = (\{.*?\});/.exec(sw)[1]);
        const cache = await caches.open(`trails-playground-${version}`);
        return (await cache.keys()).length > files.length;
      },
      null,
      { timeout: 120_000, polling: 1000 },
    );
    await context.setOffline(true);
    await page.reload();
    await page.locator("#status", { hasText: /^Running$/ }).waitFor({ timeout: 120_000 });
    await see("h1", "Found posts");
    await context.setOffline(false);
    console.log("offline, the playground boots from its cache and serves the app");
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#phone-note").waitFor({ state: "visible" });
  if (await page.locator("#editor").isVisible()) throw new Error("the editor shows at phone width");
  await see("h1", "Found posts");
  await shot("phone");
  console.log("at phone width the page is the running app alone");
} finally {
  console.log("--- console ---\n" + (await page.locator("#console").innerText()));
  await browser.close();
  await server?.close();
}
