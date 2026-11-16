import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { fixturesAll } from "../test-helper.js";

describe("ActionText::SystemTestHelperTest", () => {
  fixturesAll();

  let t: ApplicationSystemTestCase;
  const contentField = async () =>
    (await t.page()).locator('input[type="hidden"][name="message[content]"]');

  beforeEach(async () => {
    t = new ApplicationSystemTestCase(expect.getState().currentTestName!);
    await (await t.page()).goto(t.newMessageUrl());
  });

  afterEach(async () => {
    await t._context?.close();
  });

  it("filling in a rich-text area by ID", async () => {
    await expect
      .element((await t.page()).locator('trix-editor[id="message_content"]'))
      .toBeInTheDocument();
    await t.fillInRichTextarea("message_content", { with: "Hello world!" });
    await expect.element(await contentField()).toHaveValue(/Hello world!/);
  }, 60_000);

  it("filling in a rich-text area by placeholder", async () => {
    await expect
      .element((await t.page()).locator('trix-editor[placeholder="Your message here"]'))
      .toBeInTheDocument();
    await t.fillInRichTextarea("Your message here", { with: "Hello world!" });
    await expect.element(await contentField()).toHaveValue(/Hello world!/);
  }, 60_000);

  it("filling in a rich-text area by aria-label", async () => {
    await expect
      .element((await t.page()).locator('trix-editor[aria-label="Message content aria-label"]'))
      .toBeInTheDocument();
    await t.fillInRichTextarea("Message content aria-label", { with: "Hello world!" });
    await expect.element(await contentField()).toHaveValue(/Hello world!/);
  }, 60_000);

  it("filling in a rich-text area by label", async () => {
    await expect
      .element(
        (await t.page()).locator('label[for="message_content"]', {
          hasText: "Message content label",
        }),
      )
      .toBeInTheDocument();
    await t.fillInRichTextarea("Message content label", { with: "Hello world!" });
    await expect.element(await contentField()).toHaveValue(/Hello world!/);
  }, 60_000);

  it("filling in a rich-text area by input name", async () => {
    await expect.element((await t.page()).locator("trix-editor[input]")).toBeInTheDocument();
    await t.fillInRichTextarea("message[content]", { with: "Hello world!" });
    await expect.element(await contentField()).toHaveValue(/Hello world!/);
  }, 60_000);

  it("filling in the only rich-text area", async () => {
    await t.fillInRichTextarea({ with: "Hello world!" });
    await expect.element(await contentField()).toHaveValue(/Hello world!/);
  }, 60_000);
});
