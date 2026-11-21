import { beforeEach, describe, expect, test } from "vitest";
import { Info, PropertyList } from "../lib/info.js";

describe("InfoTest", () => {
  beforeEach(() => {
    Info.properties = new PropertyList();
  });

  test("toS renders an aligned table under the about header", () => {
    Info.property("X", "1");
    const out = Info.toS();
    expect(out.split("\n")[0]).toBe("About your application's environment");
    expect(out).toContain("X");
  });

  test("toHtml escapes property names and values", () => {
    Info.property("<danger>", "<bad>");
    const html = Info.toHtml();
    expect(html).toContain("&lt;danger&gt;");
    expect(html).toContain("&lt;bad&gt;");
  });
});
