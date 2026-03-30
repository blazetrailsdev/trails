/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  sanitize,
  sanitizeCss,
  stripTags,
  stripLinks,
  getSanitizerVendor,
  setSanitizerVendor,
  getFullSanitizer,
  setFullSanitizer,
  getLinkSanitizer,
  setLinkSanitizer,
  getSafeListSanitizer,
  setSafeListSanitizer,
} from "../helpers/sanitize-helper.js";
import type { Sanitizer, SanitizerVendor, SanitizerClass } from "../helpers/sanitize-helper.js";

function newMockVendor(): SanitizerVendor & { newMockSanitizer: (name: string) => SanitizerClass } {
  function newMockSanitizer(injectedName: string): SanitizerClass {
    class MockSanitizer {
      get injectedName() {
        return injectedName;
      }
      sanitize(html: string, options: Record<string, unknown> = {}): string {
        return `${injectedName}#sanitize / ${html} / ${JSON.stringify(options)}`;
      }
    }
    return MockSanitizer as unknown as SanitizerClass;
  }

  const safeListClass = newMockSanitizer("safe_list_sanitizer");
  (safeListClass as any).allowedTags = ["b", "i", "a"];
  (safeListClass as any).allowedAttributes = ["href", "title"];
  (safeListClass.prototype as any).sanitizeCss = function (style: string) {
    return `safe_list_sanitizer#sanitize_css / ${style}`;
  };

  return {
    fullSanitizer: newMockSanitizer("full_sanitizer"),
    linkSanitizer: newMockSanitizer("link_sanitizer"),
    safeListSanitizer: safeListClass as SanitizerClass & {
      allowedTags: string[];
      allowedAttributes: string[];
    },
    newMockSanitizer,
  };
}

describe("SanitizeHelperTest", () => {
  let savedVendor: SanitizerVendor;
  let mockVendor: ReturnType<typeof newMockVendor>;

  beforeEach(() => {
    savedVendor = getSanitizerVendor();
    mockVendor = newMockVendor();
    setSanitizerVendor(mockVendor);
  });

  afterEach(() => {
    setSanitizerVendor(savedVendor);
  });

  it("sanitizer_vendor module attribute and class method", () => {
    expect(getSanitizerVendor()).toBe(mockVendor);

    const vendor2 = newMockVendor();
    setSanitizerVendor(vendor2);
    expect(getSanitizerVendor()).toBe(vendor2);
  });

  it("full_sanitizer is memoized", () => {
    const result1 = getFullSanitizer();
    const result2 = getFullSanitizer();
    expect(result1).toBe(result2);
  });

  it("link_sanitizer is memoized", () => {
    const result1 = getLinkSanitizer();
    const result2 = getLinkSanitizer();
    expect(result1).toBe(result2);
  });

  it("safe_list_sanitizer is memoized", () => {
    const result1 = getSafeListSanitizer();
    const result2 = getSafeListSanitizer();
    expect(result1).toBe(result2);
  });

  it("full_sanitizer is settable", () => {
    const saved = getFullSanitizer();
    const mock = new (mockVendor.newMockSanitizer("walrus"))();
    setFullSanitizer(mock as Sanitizer);
    expect(getFullSanitizer()).toBe(mock);
    setFullSanitizer(saved);
  });

  it("link_sanitizer is settable", () => {
    const saved = getLinkSanitizer();
    const mock = new (mockVendor.newMockSanitizer("walrus"))();
    setLinkSanitizer(mock as Sanitizer);
    expect(getLinkSanitizer()).toBe(mock);
    setLinkSanitizer(saved);
  });

  it("safe_list_sanitizer is settable", () => {
    const saved = getSafeListSanitizer();
    const mock = new (mockVendor.newMockSanitizer("walrus"))();
    setSafeListSanitizer(mock as Sanitizer);
    expect(getSafeListSanitizer()).toBe(mock);
    setSafeListSanitizer(saved);
  });

  it("full_sanitizer returns an instance of the class returned by vendor full_sanitizer", () => {
    expect((getFullSanitizer() as any).injectedName).toBe("full_sanitizer");
  });

  it("link_sanitizer returns an instance of the class returned by vendor link_sanitizer", () => {
    expect((getLinkSanitizer() as any).injectedName).toBe("link_sanitizer");
  });

  it("safe_list_sanitizer returns an instance of the class returned by vendor safe_list_sanitizer", () => {
    expect((getSafeListSanitizer() as any).injectedName).toBe("safe_list_sanitizer");
  });

  it("sanitize calls sanitize on the safe_list_sanitizer", () => {
    expect(sanitize("asdf").toString()).toBe("safe_list_sanitizer#sanitize / asdf / {}");
    expect(sanitize("asdf", { tags: ["a", "b"] }).toString()).toBe(
      'safe_list_sanitizer#sanitize / asdf / {"tags":["a","b"]}',
    );
    expect(sanitize("asdf").htmlSafe).toBe(true);
  });

  it("sanitize_css calls sanitize_css on the safe_list_sanitizer", () => {
    expect(sanitizeCss("asdf")).toBe("safe_list_sanitizer#sanitize_css / asdf");
  });

  it("strip_tags calls sanitize on the full_sanitizer", () => {
    expect(stripTags("asdf").toString()).toBe("full_sanitizer#sanitize / asdf / {}");
    expect(stripTags("asdf").htmlSafe).toBe(true);
  });

  it("strip_links calls sanitize on the link_sanitizer", () => {
    const result = stripLinks("asdf");
    expect(result).toBe("link_sanitizer#sanitize / asdf / {}");
  });
});
