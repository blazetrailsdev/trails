import { describe, it, expect } from "vitest";
import { parseFilename } from "./parse-filename.js";

describe("parseFilename", () => {
  it("splits `<name>.<format>.tse` and handles missing format", () => {
    expect(parseFilename("users/show.html.tse")).toEqual({
      name: "users/show",
      format: "html",
      handler: "tse",
    });
    expect(parseFilename("users/show.json.tse").format).toBe("json");
    expect(parseFilename("show.tse")).toEqual({ name: "show", format: null, handler: "tse" });
  });
});
