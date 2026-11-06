import { NoMethodError } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Unicode } from "./unicode.js";

describe("Mail::Multibyte::Unicode.tidy_bytes", () => {
  it("recodes CP1252 bytes and cleans an interrupted sequence back to its lead", () => {
    expect(Unicode.tidyBytes("café €")).toBe("café €");
    expect(Unicode.tidyBytes("a\udc93b")).toBe("a“b");
    expect(Unicode.tidyBytes("\udce9\udc80A")).toBe("é€A");
    expect(Unicode.tidyBytes("\udc93hi\udc94", true)).toBe("“hi”");
  });

  it("raises NoMethodError where the backward clean reaches an already tidied byte", () => {
    expect(() => Unicode.tidyBytes("\udce0\udcf1a")).toThrow(NoMethodError);
  });
});
