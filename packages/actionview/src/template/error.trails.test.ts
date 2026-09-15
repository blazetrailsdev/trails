import { describe, expect, it } from "vitest";
import { MissingTemplate } from "./error.js";

describe("MissingTemplate", () => {
  it("inspects details with Ruby Symbol keys", () => {
    const e = new MissingTemplate([], "foo", ["parent"], false, { locale: [], handlers: [] });
    expect(e.message).toContain("Missing template parent/foo with {:locale=>[], :handlers=>[]}.");
  });
});
