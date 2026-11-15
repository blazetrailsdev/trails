import { describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { FixtureSet } from "@blazetrails/activestorage/testing/fixture-set";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { fixturesAll } from "../test-helper.js";

class RichTextEditorTest extends ApplicationSystemTestCase {
  async testAttachesAndUploadsImageFile(): Promise<void> {
    const page = await this.page();
    const imageFile = new FixtureSet().fileFixture("racecar.jpg");

    await page.goto(this.newMessageUrl());
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Attach Files" }).click(),
    ]);
    await fileChooser.setFiles(imageFile.toString());
    await expect.element(page.locator("trix-editor img")).toBeInTheDocument();
    await expect
      .poll(() => page.locator("trix-editor img").getAttribute("src"))
      .toMatch(
        new RegExp(
          `/trails/active_storage/blobs/redirect/.*/${File.basename(imageFile.toString())}$`,
        ),
      );
    await page.getByRole("button", { name: "Create Message" }).click();

    await expect
      .poll(() => page.locator(".trix-content img").first().getAttribute("src"))
      .toMatch(
        new RegExp(
          `/trails/active_storage/representations/redirect/.*/${File.basename(imageFile.toString())}$`,
        ),
      );
    this.assertions += 2;
  }
}

describe("ActionText::RichTextEditorTest", () => {
  fixturesAll();

  it("attaches and uploads image file", async () => {
    const test = await new RichTextEditorTest("testAttachesAndUploadsImageFile").run();
    expect(test.failures).toEqual([]);
  }, 60_000);
});
