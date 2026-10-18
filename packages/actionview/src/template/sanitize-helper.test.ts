/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { HTML4, HTML5, Html } from "@blazetrails/html-sanitizer";
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

function sanitizeHelperVendorTests(
  vendor: SanitizerVendor & { whiteListSanitizer?: unknown },
): void {
  let savedVendor: SanitizerVendor;
  let subjectClass: SanitizeHelperClass;
  let subject: Record<string, (...args: any[]) => any>;

  beforeEach(() => {
    savedVendor = SanitizeHelper.sanitizerVendor;
    SanitizeHelper.sanitizerVendor = vendor;

    class Subject {}
    include(Subject, SanitizeHelper);
    subjectClass = Subject as unknown as SanitizeHelperClass;
    subject = new Subject() as unknown as Record<string, (...args: any[]) => any>;
  });

  afterEach(() => {
    SanitizeHelper.sanitizerVendor = savedVendor;
  });

  it("full sanitizer returns a sanitizer", () => {
    const sanitizer = subjectClass.fullSanitizer;

    expect(sanitizer.constructor).toBe(vendor.fullSanitizer);
    expect(typeof sanitizer.sanitize).toBe("function");
  });

  it("link sanitizer returns a sanitizer", () => {
    const sanitizer = subjectClass.linkSanitizer;

    expect(sanitizer.constructor).toBe(vendor.linkSanitizer);
    expect(typeof sanitizer.sanitize).toBe("function");
  });

  it("safe list sanitizer returns a sanitizer", () => {
    const sanitizer = subjectClass.safeListSanitizer;

    expect(sanitizer.constructor).toBe(vendor.safeListSanitizer);
    expect(typeof sanitizer.sanitize).toBe("function");
  });

  it("full sanitizer is settable", () => {
    (subjectClass as any).fullSanitizer = "mock";
    const result = subjectClass.fullSanitizer;

    expect(result).toBe("mock");
  });

  it("link sanitizer is settable", () => {
    (subjectClass as any).linkSanitizer = "mock";
    const result = subjectClass.linkSanitizer;

    expect(result).toBe("mock");
  });

  it("safe list sanitizer is settable", () => {
    (subjectClass as any).safeListSanitizer = "mock";
    const result = subjectClass.safeListSanitizer;

    expect(result).toBe("mock");
  });

  it("deprecated methods are supported", () => {
    expect(vendor.whiteListSanitizer).toBeDefined();
  });

  it("sanitized allowed tags returns a string collection", () => {
    const result = (subjectClass as any).sanitizedAllowedTags() as Iterable<string>;

    expect(typeof result[Symbol.iterator]).toBe("function");
    expect(typeof Array.from(result)[0]).toBe("string");
  });

  it("sanitized allowed attributes returns a string collection", () => {
    const result = (subjectClass as any).sanitizedAllowedAttributes() as Iterable<string>;

    expect(typeof result[Symbol.iterator]).toBe("function");
    expect(typeof Array.from(result)[0]).toBe("string");
  });

  // BLOCKED: sanitize-helper-sanitized-allowed-writers
  it.skip("sanitized allowed tags is settable", () => {});

  // BLOCKED: sanitize-helper-sanitized-allowed-writers
  it.skip("sanitized allowed attributes is settable", () => {});

  it("sanitize", () => {
    const input = `<div><script>alert(1);</script><a href="http://www.example.com/">Example</a> of a fragment</div>`;
    const result = subject.sanitize(input);

    expect(String(result)).not.toContain("script");
  });

  it("sanitize with tags option", () => {
    const input = `<b>bold</b> <i>italic</i> <div>hello</div>`;

    expect(String(subject.sanitize(input, { tags: ["b", "i"] }))).toBe(
      "<b>bold</b> <i>italic</i> hello",
    );
    expect(String(subject.sanitize(input, { tags: ["div"] }))).toBe("bold italic <div>hello</div>");
  });

  it("sanitize with attributes option", () => {
    const input = `<div a="1" b="2" c="3">hello</div>`;

    expect(String(subject.sanitize(input, { attributes: ["a", "b"] }))).toBe(
      `<div a="1" b="2">hello</div>`,
    );
    expect(String(subject.sanitize(input, { attributes: ["b", "c"] }))).toBe(
      `<div b="2" c="3">hello</div>`,
    );
  });

  // BLOCKED: html-sanitizer-port-scrubbers
  it.skip("sanitize with loofah scrubber option", () => {});

  // BLOCKED: html-sanitizer-port-scrubbers
  it.skip("sanitize with custom scrubber option", () => {});

  // BLOCKED: html-sanitizer-safe-list-sanitize-css
  it.skip("sanitize css", () => {});

  it("strip tags", () => {
    const input = `<div><a href="http://www.example.com/">Example</a> of a fragment</div>`;
    const result = subject.stripTags(input);

    expect(String(result)).toBe("Example of a fragment");
  });

  it("strip links", () => {
    const input = `<div><a href="http://www.example.com/">Example</a> of a fragment</div>`;
    const result = subject.stripLinks(input);

    expect(String(result)).toBe("<div>Example of a fragment</div>");
  });

  // BLOCKED: html-sanitizer-port-scrubbers
  it.skip("we get the expected HTML parser", () => {});
}

describe("SanitizeHelperVendorHtmlTest", () => {
  sanitizeHelperVendorTests(Html.Sanitizer);
});

describe("SanitizeHelperVendorHTML4Test", () => {
  sanitizeHelperVendorTests(HTML4.Sanitizer);
});

describe.skipIf(!Html.Sanitizer.isHtml5Support())("SanitizeHelperVendorHTML5Test", () => {
  sanitizeHelperVendorTests(HTML5.Sanitizer);
});
