import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { TopLevel } from "@blazetrails/activesupport";
import { tmpdir } from "os";
import { join } from "path";
import { readFile } from "fs/promises";
import {
  savePage,
  htmlDumpDefaultPath,
  InvalidResponse,
  type PageDumpHelperHost,
} from "./page-dump-helper.js";

describe("ActionDispatch::TestHelpers::PageDumpHelper", () => {
  const previousTrails = TopLevel.Trails;
  beforeEach(() => {
    TopLevel.Trails = { root: () => tmpdir() } as never;
  });
  afterEach(() => {
    TopLevel.Trails = previousTrails;
  });

  it("save_page writes response body to the given path", async () => {
    const path = join(tmpdir(), `page-dump-test-${Date.now()}.html`);
    const host: PageDumpHelperHost = {
      methodName: "my_test",
      response: { isRedirection: false, body: "<html>hello</html>" },
    };
    const returned = await savePage.call(host, path);
    expect(returned).toBe(path);
    const content = await readFile(path, "utf8");
    expect(content).toBe("<html>hello</html>");
  });

  it("save_page raises InvalidResponse when response is a redirection", async () => {
    const host: PageDumpHelperHost = {
      methodName: "my_test",
      response: { isRedirection: true, body: "" },
    };
    await expect(savePage.call(host)).rejects.toThrow(InvalidResponse);
  });

  it("html_dump_default_path generates a path under tmp/html_dump", () => {
    const host: PageDumpHelperHost = {
      methodName: "my_test",
      response: { isRedirection: false, body: "" },
    };
    const path = htmlDumpDefaultPath.call(host);
    expect(path).toMatch(/tmp\/html_dump\/my_test_\d+\.html$/);
  });

  it("html_dump_default_path uses test name in filename", () => {
    const host: PageDumpHelperHost = {
      methodName: "some_integration_test",
      response: { isRedirection: false, body: "" },
    };
    expect(htmlDumpDefaultPath.call(host)).toMatch(/some_integration_test_\d+\.html$/);
  });
});
