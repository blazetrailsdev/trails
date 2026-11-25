import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { ApplicationSystemTestCase } from "../application-system-test-case.ts";
import { loadFixtures } from "../test-helper.ts";
import { Book } from "../../app/models/book.ts";

const fileFixture = (name: string) =>
  fileURLToPath(new URL(`../fixtures/files/${name}`, import.meta.url));

describe("BookCoverTest", () => {
  let t: ApplicationSystemTestCase;

  beforeEach(async () => {
    await loadFixtures();
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!);
    await t.signIn("kevin@example.com");
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("upload a cover, and keep it when the book is edited without choosing another", async () => {
    const page = await t.page();
    await page.goto(t.url("newBookUrl"));

    await page.getByPlaceholder("Book title", { exact: true }).fill("Covered");
    await page.locator("[name='book[cover]']").setInputFiles(fileFixture("reading.webp"));
    await page.locator("footer").getByRole("button").click();

    await expect.element(page.locator("img[alt='Cover for Covered']")).toBeInTheDocument();
    const covered = (await Book.findByBang({ title: "Covered" })) as Book;
    const cover = covered.cover as unknown as {
      load(): Promise<void>;
      blob: Promise<{ filename: { toString(): string } }>;
    };
    await cover.load();
    expect((await cover.blob).filename.toString()).toBe("reading.webp");

    await page.goto(t.url("editBookUrl", covered));
    await page.getByPlaceholder("Book title", { exact: true }).fill("Still covered");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect.element(page.locator("img[alt='Cover for Still covered']")).toBeInTheDocument();
    const stillCovered = (await Book.findByBang({ title: "Still covered" })) as Book;
    await (stillCovered.cover as unknown as { load(): Promise<void> }).load();
    expect(stillCovered.cover.isAttached()).toBe(true);
  }, 60_000);
});
