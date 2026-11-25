import { describe, expect, it } from "vitest";
import "../test-helper.ts";
import { ApplicationController } from "../../app/controllers/application-controller.ts";
import type { Leaf } from "../../app/models/leaf.ts";

describe("SearchesHelperTest", () => {
  const helpers = () =>
    ApplicationController.helpers() as unknown as Record<string, (...args: unknown[]) => unknown>;
  const sanitizeSearchResult = (html: string) => String(helpers().sanitizeSearchResult(html));

  it("sanitize_search_result preserves mark tags", () => {
    expect(sanitizeSearchResult("<mark>findme</mark> text")).toBe("<mark>findme</mark> text");
  });

  it("sanitize_search_result strips non-mark tags", () => {
    expect(sanitizeSearchResult("<b>findme</b> <b>bold</b>")).toBe("findme bold");
  });

  it("sanitize_search_result encodes entities", () => {
    expect(sanitizeSearchResult("Tom & Jerry")).toBe("Tom &amp; Jerry");
  });

  it("sanitize_search_result strips attributes from mark tags", () => {
    expect(sanitizeSearchResult('<mark class="hidden">findme</mark> text')).toBe(
      "<mark>findme</mark> text",
    );
  });

  it("highlight_searched_content handles matched terms containing regex metacharacters", async () => {
    const leaf = {
      matchesForHighlight: async (_query: unknown) => ["alpha(beta"],
    } as unknown as Leaf;

    const result = await helpers().highlightSearchedContent(
      leaf,
      "alpha(beta in the body",
      "alpha beta",
    );

    expect(String(result)).toContain("<mark>alpha(beta</mark>");
  });
});
