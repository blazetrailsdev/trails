import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vite } from "../../../actionpack/lib/action-dispatch/system-testing/server.js";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { app } from "../test-helper.js";
import { Article } from "../dummy/app/models/article.js";

type Page = Awaited<ReturnType<ApplicationSystemTestCase["page"]>>;

describe("FormSubmissionsTest", () => {
  let t: ApplicationSystemTestCase;
  let page: Page;

  const urlHelpers = () =>
    app.routes().urlHelpers() as unknown as Record<string, (...args: unknown[]) => string>;
  const visit = (path: string) => page.goto(new URL(path, vite.url).href);
  const clickOn = (locator: string) =>
    page
      .getByRole("link", { name: locator, exact: true })
      .or(page.getByRole("button", { name: locator, exact: true }))
      .click();
  const assertText = (text: string, { count }: { count?: number } = {}) =>
    count === undefined
      ? expect.element(page.locator("body")).toHaveTextContent(text)
      : expect.poll(() => page.getByText(text, { exact: true }).count()).toBe(count);
  const assertNoText = (text: string) =>
    expect.poll(() => page.locator("body").textContent()).not.toContain(text);

  beforeEach(async () => {
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!);
    page = await t.page();
    app.reloadRoutesUnlessLoaded();
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("form submission [method=get]", async () => {
    const article = await Article.createBang({ body: "My article" });

    await visit(urlHelpers().editArticlePath(article.id));
    await clickOn("articles#index");

    await assertText("Articles");
    await assertText("My article");
  }, 60_000);

  it("form submission method is encoded as _method", async () => {
    const article = await Article.createBang({ body: "My article" });

    await visit(urlHelpers().editArticlePath(article.id));
    await clickOn("Submit as DELETE");

    await assertText("Articles");
    await assertNoText("My article");
  }, 60_000);

  it("form submissions override _method when [formmethod] is present", async () => {
    const article = await Article.createBang({ body: "My article" });

    await visit(urlHelpers().editArticlePath(article.id));
    await clickOn("Submit as POST");

    await assertText("Articles");
    await assertText("My article", { count: 2 });
  }, 60_000);

  it("form submissions do not override _method when [formmethod] is absent", async () => {
    const article = await Article.createBang({ body: "My article" });

    await visit(urlHelpers().editArticlePath(article.id));
    await page.getByLabel("Body").fill("My edit");
    await clickOn("Submit as PATCH");

    await assertText("Articles");
    await assertText("My edit", { count: 1 });
    await assertNoText("My article");
  }, 60_000);
});
