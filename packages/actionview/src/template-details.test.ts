import { describe, expect, test } from "vitest";

import { Requested, TemplateDetails } from "./template-details.js";

function req(overrides: Partial<ConstructorParameters<typeof Requested>[0]> = {}): Requested {
  return new Requested({
    locale: ["en", null],
    handlers: ["tse", "raw", null],
    formats: ["html", null],
    variants: [],
    ...overrides,
  });
}

describe("TemplateDetails#matches", () => {
  test("matches when all four facets resolve", () => {
    const r = req();
    const d = new TemplateDetails("en", "tse", "html", null);
    expect(d.matches(r)).toBe(true);
  });

  test("matches null format against requested null sentinel", () => {
    const r = req();
    const d = new TemplateDetails("en", "tse", null, null);
    expect(d.matches(r)).toBe(true);
  });

  test("fails when format absent from requested", () => {
    const r = req();
    const d = new TemplateDetails("en", "tse", "xml", null);
    expect(d.matches(r)).toBe(false);
  });

  test("fails when handler absent from requested", () => {
    const r = req();
    const d = new TemplateDetails("en", "builder", "html", null);
    expect(d.matches(r)).toBe(false);
  });
});

describe("TemplateDetails variants", () => {
  test("matches explicit variant", () => {
    const r = req({ variants: ["phone", null] });
    expect(new TemplateDetails("en", "tse", "html", "phone").matches(r)).toBe(true);
    expect(new TemplateDetails("en", "tse", "html", "tablet").matches(r)).toBe(false);
  });

  test('variants "any" matches anything', () => {
    const r = req({ variants: "any" });
    expect(new TemplateDetails("en", "tse", "html", "phone").matches(r)).toBe(true);
    expect(new TemplateDetails("en", "tse", "html", null).matches(r)).toBe(true);
  });
});

describe("TemplateDetails#sortKeyFor", () => {
  test("earlier-listed entries sort lower (preferred first)", () => {
    const r = req({ formats: ["html", "xml", null], handlers: ["tse", "raw", null] });
    const html = new TemplateDetails("en", "tse", "html", null).sortKeyFor(r);
    const xml = new TemplateDetails("en", "tse", "xml", null).sortKeyFor(r);
    expect(html[0]).toBeLessThan(xml[0]);
  });

  test("handler ordering preserved", () => {
    const r = req();
    const tse = new TemplateDetails("en", "tse", "html", null).sortKeyFor(r);
    const raw = new TemplateDetails("en", "raw", "html", null).sortKeyFor(r);
    expect(tse[3]).toBeLessThan(raw[3]);
  });
});

describe("Requested idx maps", () => {
  test("null gets a slot at end of original array", () => {
    const r = req();
    expect(r.formatsIdx.get("html")).toBe(0);
    expect(r.formatsIdx.get(null)).toBe(1);
  });
});
