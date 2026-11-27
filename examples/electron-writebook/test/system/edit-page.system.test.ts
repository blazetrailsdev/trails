import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApplicationSystemTestCase } from "../application-system-test-case.ts";
import { fixture, loadFixtures } from "../test-helper.ts";

describe("EditPageTest", () => {
  let t: ApplicationSystemTestCase;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!);
    await t.signIn("kevin@example.com");
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("edit page", async () => {
    const page = await t.page();
    await page.goto(
      t.url(
        "editBookPageUrl",
        await fixture("books", "handbook"),
        await fixture("leaves", "welcome_page"),
      ),
    );
    await expect.element(page.locator("house-md")).toBeInTheDocument();

    await t.fillHouseEditor("page[body]", "Welcome to the handbook! This is the **first** page.");

    await page.getByRole("button", { name: "Save" }).click();

    await expect
      .element(page.locator(".house-md-content"))
      .toHaveTextContent("Welcome to the handbook! This is the **first** page.");
    await expect
      .element(page.locator(".house-md-content strong", { hasText: "first" }))
      .toBeInTheDocument();
  }, 60_000);
});
