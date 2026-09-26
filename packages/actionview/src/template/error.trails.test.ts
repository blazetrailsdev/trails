import { describe, expect, it } from "vitest";
import { MissingTemplate, TemplateError } from "./error.js";
import type { Template } from "../template.js";
import { LookupContext } from "../lookup-context.js";

describe("MissingTemplate", () => {
  it("inspects details with Ruby Symbol keys", () => {
    const e = new MissingTemplate([], "foo", ["parent"], false, { locale: [], handlers: [] });
    expect(e.message).toBe(
      "Missing template parent/foo with {:locale=>[], :handlers=>[]}.\n\nSearched in:\n",
    );
  });

  it("inspects the lookup context's detail values as Ruby Symbols", () => {
    const ctx = new LookupContext(null, { formats: [":json"], handlers: [":tse"] }, []);
    expect(() => ctx.find("missing", ["posts"])).toThrow(
      "Missing template posts/missing with {:locale=>[:en], :formats=>[:json], :variants=>[], :handlers=>[:tse]}.",
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
