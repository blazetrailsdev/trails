import { describe, it, expect } from "vitest";

import { HTML } from "./html.js";

describe("HTMLTest", () => {
  it("formats returns symbol for recognized MIME type", () => {
    expect(new HTML("", "html").format()).toBe("html");
  });

  it("formats returns string for unknown MIME type", () => {
    expect(new HTML("", "foo").format()).toBe("foo");
  });
});
