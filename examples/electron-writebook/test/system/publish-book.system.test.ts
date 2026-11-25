import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApplicationSystemTestCase } from "../application-system-test-case.ts";
import { loadFixtures } from "../test-helper.ts";

describe("PublishTest", () => {
  let t: ApplicationSystemTestCase;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!);
    await t.signIn("kevin@example.com");
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("create and publish a book", async () => {
    const page = await t.page();
    await page.goto(t.url("newBookUrl"));

    await page.getByPlaceholder("Book title", { exact: true }).fill("My Book of Jokes");
    await page.getByPlaceholder("Author", { exact: true }).fill("Kevin");
    await page.locator("footer").getByRole("button").click();

    await expect.element(page.getByText("My Book of Jokes").first()).toBeInTheDocument();

    await page.getByText("Add a new section page").click();
    await page.locator("#leaf_title").fill("A horse walks into a bar");
    await page.getByRole("button", { name: "Save" }).click();

    await page.getByText("Add a new section page").click();
    await page.locator("#leaf_title").fill("And the barman says 'Why the long face?'");
    await page.getByRole("button", { name: "Save" }).click();

    await page.locator(".switch__btn").click();
    const publicUrl = await page.locator("#invite_url").inputValue();

    const publicContext = await page.context().browser()!.newContext();
    try {
      const publicPage = await publicContext.newPage();
      await publicPage.goto(publicUrl);
      await expect.element(publicPage.getByText("My Book of Jokes").first()).toBeInTheDocument();

      await publicPage.keyboard.press("ArrowRight");
      await expect
        .element(publicPage.getByText("A horse walks into a bar").first())
        .toBeInTheDocument();
    } finally {
      await publicContext.close();
    }
  }, 60_000);
});
