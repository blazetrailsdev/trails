import { describe, it, expect } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { getFs } from "@blazetrails/ruby-compat";
import { requirePlaywright } from "./system-testing/driver.js";
import { SystemTestCase } from "./system-test-case.js";
import { Server, vite } from "./system-testing/server.js";

const trails = TopLevel.Trails;
TopLevel.Trails = {
  ...trails,
  application: {
    call: async (env: Record<string, unknown>) =>
      String(env["PATH_INFO"]).endsWith("posts")
        ? [
            200,
            { "content-type": "text/html" },
            ['<h1>Posts</h1><label>Title <input name="title" value="Hello"></label>'],
          ]
        : [200, {}, ["from application"]],
  },
} as unknown as typeof TopLevel.Trails;
Server.silencePuma = true;
try {
  await SystemTestCase.startApplication();
} finally {
  Server.silencePuma = false;
  TopLevel.Trails = trails;
}

describe("SystemTestCase.startApplication", () => {
  it("mounts the application under / and serves it from the Vite dev server", async () => {
    const response = await fetch(new URL("posts", vite.url));
    expect(await response.text()).toContain("Posts");
  });
});

const { chromium } = (await requirePlaywright()) as { chromium: { executablePath(): string } };
const browserInstalled = await getFs().stat!(chromium.executablePath()).then(
  () => true,
  () => false,
);

describe("SystemTestCase", () => {
  it.skipIf(!browserInstalled)("drives a page through the playwright driver", async () => {
    class PostsTest extends SystemTestCase {
      testDrivesAPage(): void {}
    }
    PostsTest.drivenBy("playwright", { using: "chromium" });
    const test = new PostsTest("testDrivesAPage");
    const page = await test.page();
    const browser = page.context().browser();
    try {
      await page.goto(new URL("posts", vite.url).href);

      await expect.element(page.getByRole("heading")).toBeVisible();
      await expect.element(page.getByText("Posts")).toBeInTheDocument();
      await expect.element(page.getByRole("heading")).toHaveTextContent("Posts");
      await expect.element(page.getByLabel("Title")).toHaveValue("Hello");
      test.assertions += 4;
    } finally {
      await test.afterTeardown();
      await browser?.close();
    }
  });
});
