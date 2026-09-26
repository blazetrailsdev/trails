import { describe, expect, it } from "vitest";
import { MissingTemplate, TemplateError } from "./error.js";
import type { Template } from "../template.js";

describe("MissingTemplate", () => {
  it("inspects details with Ruby Symbol keys", () => {
    const e = new MissingTemplate([], "foo", ["parent"], false, { locale: [], handlers: [] });
    expect(e.message).toBe(
      "Missing template parent/foo with {:locale=>[], :handlers=>[]}.\n\nSearched in:\n",
    );
  });
});

describe("Template::Error#backtrace_locations", () => {
  it("answers the cause's backtrace locations", () => {
    const original = new Error("boom");
    original.stack = "Error: boom\n    at render (a.js:5:7)";
    const e = new TemplateError({ original, template: {} as Template });
    expect(e.backtraceLocations()!.map((loc) => loc.toS())).toEqual(["at render (a.js:5:7)"]);
  });
});
