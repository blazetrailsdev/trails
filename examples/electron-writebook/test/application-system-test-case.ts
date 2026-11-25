import { SystemTestCase } from "@blazetrails/actionpack/system-testing";
import { expect } from "vitest";
import "./test-helper.ts";

await SystemTestCase.startApplication(
  await import("vitest"),
  await import("vite"),
  await import("playwright"),
);

/** Writebook's `ApplicationSystemTestCase`, with `SystemTestHelper` included. */
export class ApplicationSystemTestCase extends SystemTestCase {
  url(name: string, ...args: unknown[]): string {
    return this.methodMissing(name, ...args) as string;
  }

  /** Writebook's `SystemTestHelper#sign_in`. */
  async signIn(emailAddress: string, password = "secret123456"): Promise<void> {
    const page = await this.page();
    await page.goto(this.url("newSessionUrl"));

    await page.locator("[name='email_address']").fill(emailAddress);
    await page.locator("[name='password']").fill(password);

    await page.locator("#log_in").click();
    await expect.element(page.locator("h2", { hasText: "Handbook" })).toBeInTheDocument();
  }

  /** Writebook's `SystemTestHelper#fill_house_editor`. */
  async fillHouseEditor(name: string, content: string): Promise<void> {
    const page = await this.page();
    await page.evaluate(`
      const editor = document.querySelector("[name='${name}']")
      editor.value = ${JSON.stringify(content)}
    `);
  }
}
ApplicationSystemTestCase.drivenBy("playwright", { using: "chromium", screenSize: [1400, 1400] });
