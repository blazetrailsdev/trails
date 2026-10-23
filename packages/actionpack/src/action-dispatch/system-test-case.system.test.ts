import { afterAll, describe, it, expect, inject } from "vitest";
import { assertEqual, TopLevel } from "@blazetrails/activesupport";
import { Dir, getFs } from "@blazetrails/ruby-compat";
import { SystemTestCase } from "./system-test-case.js";
import { vite } from "./system-testing/server.js";
import { imagePath } from "./system-testing/test-helpers/screenshot-helper.js";

const trails = TopLevel.Trails;
TopLevel.Trails = {
  ...trails,
  root: () => Dir.pwd(),
  application: {
    call: async () => [
      200,
      { "content-type": "text/html" },
      ['<h1>Posts</h1><label>Title <input name="title" value="Hello"></label>'],
    ],
  },
} as unknown as typeof TopLevel.Trails;
afterAll(() => {
  TopLevel.Trails = trails;
});
await SystemTestCase.startApplication();

class PostsTest extends SystemTestCase {
  async testVisitingThePosts(): Promise<void> {
    const page = await this.page();
    await page.goto(new URL("posts", vite.url).href);
    await expect.element(page.getByRole("heading")).toHaveTextContent("Posts");
    await expect.element(page.getByLabel("Title")).toHaveValue("Hello");
    this.assertions += 2;
  }

  async testHeadingIsComments(): Promise<void> {
    const page = await this.page();
    await page.goto(new URL("posts", vite.url).href);
    this.assertions += 1;
    assertEqual("Comments", await page.getByRole("heading").textContent());
  }
}
PostsTest.drivenBy("playwright", { using: "chromium" });

describe("SystemTestCase driven by playwright", () => {
  it("visits a page and asserts on it", async () => {
    const test = await new PostsTest("testVisitingThePosts").run();
    expect(test.failures).toEqual([]);
  }, 60_000);

  it("takes a screenshot of a failed test into the screenshot directory", async () => {
    const test = await new PostsTest("testHeadingIsComments").run();
    expect(test.isPassed()).toBe(false);
    const path = imagePath.call(test as never);
    expect(path).toContain(`${inject("screenshotDirectory")}/failures_`);
    expect((await getFs().stat!(path)).size).toBeGreaterThan(0);
  }, 60_000);
});
