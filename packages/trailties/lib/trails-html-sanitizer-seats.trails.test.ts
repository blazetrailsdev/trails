import { HTML, HTML4, HTML5 } from "@blazetrails/html-sanitizer";
import { TopLevel, rbModName } from "@blazetrails/ruby-compat";
import { describe, expect, it } from "vitest";
import { Trails } from "./trails.js";

describe("Trails reopened by rails-html-sanitizer", () => {
  it("keeps the HTML namespaces seated before Trails was defined", () => {
    expect(TopLevel.Trails).toBe(Trails);
    const seats = Trails as unknown as Record<string, unknown>;
    expect(seats.HTML).toBe(HTML);
    expect(seats.Html).toBe(HTML);
    expect(seats.HTML4).toBe(HTML4);
    expect(seats.HTML5).toBe(HTML5);
    expect(rbModName(HTML.Sanitizer)).toBe("Trails::HTML::Sanitizer");
  });
});
