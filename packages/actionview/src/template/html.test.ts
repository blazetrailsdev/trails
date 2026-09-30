import { describe, it, expect } from "vitest";
import { MimeType } from "@blazetrails/actionpack";

import { HTML } from "./html.js";
import { assertNil } from "@blazetrails/activesupport";

describe("HTMLTest", () => {
  it("formats returns symbol for recognized MIME type", () => {
    expect(new HTML("", ":html").format).toBe(":html");
  });

  it("formats returns string for recognized MIME type when MIME does not have symbol", () => {
    const foo = MimeType.lookup("text/foo");
    assertNil(foo.toSym());
    expect(String(new HTML("", foo).format)).toBe("text/foo");
  });

  it("formats returns string for unknown MIME type", () => {
    expect(new HTML("", "foo").format).toBe("foo");
  });
});
