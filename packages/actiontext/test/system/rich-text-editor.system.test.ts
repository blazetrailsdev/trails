import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { File } from "@blazetrails/ruby-compat";
import { FixtureSet } from "@blazetrails/activestorage/testing/fixture-set";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { fixturesAll } from "../test-helper.js";

describe("ActionText::RichTextEditorTest", () => {
  fixturesAll();

  let t: ApplicationSystemTestCase;

  beforeEach(() => {
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!);
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("attaches and uploads image file", async () => {
    const page = await t.page();
    const imageFile = new FixtureSet().fileFixture("racecar.jpg");
    const basename = File.basename(imageFile.toString());

    await page.goto(t.newMessageUrl());
    const [fileChooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Attach Files" }).click(),
    ]);
    await fileChooser.setFiles(imageFile.toString());
    await expect
      .element(page.locator("trix-editor img"))
      .toHaveAttribute("src", new RegExp(`/trails/active_storage/blobs/redirect/.*/${basename}$`));
    await page.getByRole("button", { name: "Create Message" }).click();

    await expect
      .element(page.locator(".trix-content img"))
      .toHaveAttribute(
        "src",
        new RegExp(`/trails/active_storage/representations/redirect/.*/${basename}$`),
      );
  }, 60_000);
});
