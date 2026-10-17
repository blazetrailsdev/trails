/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { SanitizeHelper } from "../helpers/sanitize-helper.js";
import type {
  SanitizeHelperClass,
  SanitizerVendor,
  SanitizerClass,
} from "../helpers/sanitize-helper.js";

class SanitizeHelperTestCase {}
include(SanitizeHelperTestCase, SanitizeHelper);
const klass = SanitizeHelperTestCase as unknown as SanitizeHelperClass;
const self = new SanitizeHelperTestCase() as unknown as Record<string, (...args: any[]) => any>;

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
  safeListClass.prototype.sanitizeCss = function (style: string) {
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
    savedVendor = SanitizeHelper.sanitizerVendor;
    mockVendor = newMockVendor();
    SanitizeHelper.sanitizerVendor = mockVendor;
  });

  afterEach(() => {
    SanitizeHelper.sanitizerVendor = savedVendor;
  });

  it("sanitizer_vendor module attribute and class method", () => {
    expect(SanitizeHelper.sanitizerVendor).toBe(mockVendor);
    expect(klass.sanitizerVendor).toBe(mockVendor);

    const vendor2 = newMockVendor();
    SanitizeHelper.sanitizerVendor = vendor2;
    expect(SanitizeHelper.sanitizerVendor).toBe(vendor2);
    expect(klass.sanitizerVendor).toBe(vendor2);
  });

  it("full_sanitizer is memoized", () => {
    const result1 = klass.fullSanitizer;
    const result2 = klass.fullSanitizer;
    expect(result1).toBe(result2);
  });

  it("link_sanitizer is memoized", () => {
    const result1 = klass.linkSanitizer;
    const result2 = klass.linkSanitizer;
    expect(result1).toBe(result2);
  });

  it("safe_list_sanitizer is memoized", () => {
    const result1 = klass.safeListSanitizer;
    const result2 = klass.safeListSanitizer;
    expect(result1).toBe(result2);
  });

  it("full_sanitizer is settable", () => {
    const saved = klass.fullSanitizer;
    const mock = new (mockVendor.newMockSanitizer("walrus"))();
    klass.fullSanitizer = mock;
    expect(klass.fullSanitizer).toBe(mock);
    klass.fullSanitizer = saved;
  });

  it("link_sanitizer is settable", () => {
    const saved = klass.linkSanitizer;
    const mock = new (mockVendor.newMockSanitizer("walrus"))();
    klass.linkSanitizer = mock;
    expect(klass.linkSanitizer).toBe(mock);
    klass.linkSanitizer = saved;
  });

  it("safe_list_sanitizer is settable", () => {
    const saved = klass.safeListSanitizer;
    const mock = new (mockVendor.newMockSanitizer("walrus"))();
    klass.safeListSanitizer = mock;
    expect(klass.safeListSanitizer).toBe(mock);
    klass.safeListSanitizer = saved;
  });

  it("full_sanitizer returns an instance of the class returned by vendor full_sanitizer", () => {
    expect((klass.fullSanitizer as any).injectedName).toBe("full_sanitizer");
  });

  it("link_sanitizer returns an instance of the class returned by vendor link_sanitizer", () => {
    expect((klass.linkSanitizer as any).injectedName).toBe("link_sanitizer");
  });

  it("safe_list_sanitizer returns an instance of the class returned by vendor safe_list_sanitizer", () => {
    expect((klass.safeListSanitizer as any).injectedName).toBe("safe_list_sanitizer");
  });

  it("sanitize calls sanitize on the safe_list_sanitizer", () => {
    expect(self.sanitize("asdf")!.toString()).toBe("safe_list_sanitizer#sanitize / asdf / {}");
    expect(self.sanitize("asdf", { tags: ["a", "b"] })!.toString()).toBe(
      'safe_list_sanitizer#sanitize / asdf / {"tags":["a","b"]}',
    );
    expect(self.sanitize("asdf")!.htmlSafe).toBe(true);
  });

  it("sanitize_css calls sanitize_css on the safe_list_sanitizer", () => {
    expect(self.sanitizeCss("asdf")).toBe("safe_list_sanitizer#sanitize_css / asdf");
  });

  it("strip_tags calls sanitize on the full_sanitizer", () => {
    expect(self.stripTags("asdf")!.toString()).toBe("full_sanitizer#sanitize / asdf / {}");
    expect(self.stripTags("asdf")!.htmlSafe).toBe(true);
  });

  it("strip_links calls sanitize on the link_sanitizer", () => {
    const result = self.stripLinks("asdf");
    expect(result).toBe("link_sanitizer#sanitize / asdf / {}");
  });
});
