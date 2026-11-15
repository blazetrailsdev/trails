import { describe, expect, it } from "vitest";
import { ApplicationSystemTestCase } from "../application-system-test-case.js";
import { fixturesAll } from "../test-helper.js";

class SystemTestHelperTest extends ApplicationSystemTestCase {
  async setup(): Promise<void> {
    await (await this.page()).goto(this.newMessageUrl());
  }

  async contentField() {
    return (await this.page()).locator('input[type="hidden"][name="message[content]"]');
  }

  async testFillingInARichTextAreaById(): Promise<void> {
    const page = await this.page();
    await expect.element(page.locator('trix-editor[id="message_content"]')).toBeInTheDocument();
    await this.fillInRichTextarea("message_content", { with: "Hello world!" });
    await expect.poll(async () => (await this.contentField()).inputValue()).toMatch(/Hello world!/);
    this.assertions += 2;
  }

  async testFillingInARichTextAreaByPlaceholder(): Promise<void> {
    const page = await this.page();
    await expect
      .element(page.locator('trix-editor[placeholder="Your message here"]'))
      .toBeInTheDocument();
    await this.fillInRichTextarea("Your message here", { with: "Hello world!" });
    await expect.poll(async () => (await this.contentField()).inputValue()).toMatch(/Hello world!/);
    this.assertions += 2;
  }

  async testFillingInARichTextAreaByAriaLabel(): Promise<void> {
    const page = await this.page();
    await expect
      .element(page.locator('trix-editor[aria-label="Message content aria-label"]'))
      .toBeInTheDocument();
    await this.fillInRichTextarea("Message content aria-label", { with: "Hello world!" });
    await expect.poll(async () => (await this.contentField()).inputValue()).toMatch(/Hello world!/);
    this.assertions += 2;
  }

  async testFillingInARichTextAreaByLabel(): Promise<void> {
    const page = await this.page();
    await expect
      .element(page.locator('label[for="message_content"]', { hasText: "Message content label" }))
      .toBeInTheDocument();
    await this.fillInRichTextarea("Message content label", { with: "Hello world!" });
    await expect.poll(async () => (await this.contentField()).inputValue()).toMatch(/Hello world!/);
    this.assertions += 2;
  }

  async testFillingInARichTextAreaByInputName(): Promise<void> {
    const page = await this.page();
    await expect.element(page.locator("trix-editor[input]")).toBeInTheDocument();
    await this.fillInRichTextarea("message[content]", { with: "Hello world!" });
    await expect.poll(async () => (await this.contentField()).inputValue()).toMatch(/Hello world!/);
    this.assertions += 2;
  }

  async testFillingInTheOnlyRichTextArea(): Promise<void> {
    await this.fillInRichTextarea({ with: "Hello world!" });
    await expect.poll(async () => (await this.contentField()).inputValue()).toMatch(/Hello world!/);
    this.assertions += 1;
  }
}

async function run(name: string): Promise<void> {
  const test = await new SystemTestHelperTest(name).run();
  expect(test.failures).toEqual([]);
}

describe("ActionText::SystemTestHelperTest", () => {
  fixturesAll();

  it("filling in a rich-text area by ID", () => run("testFillingInARichTextAreaById"), 60_000);
  it(
    "filling in a rich-text area by placeholder",
    () => run("testFillingInARichTextAreaByPlaceholder"),
    60_000,
  );
  it(
    "filling in a rich-text area by aria-label",
    () => run("testFillingInARichTextAreaByAriaLabel"),
    60_000,
  );
  it(
    "filling in a rich-text area by label",
    () => run("testFillingInARichTextAreaByLabel"),
    60_000,
  );
  it(
    "filling in a rich-text area by input name",
    () => run("testFillingInARichTextAreaByInputName"),
    60_000,
  );
  it("filling in the only rich-text area", () => run("testFillingInTheOnlyRichTextArea"), 60_000);
});
