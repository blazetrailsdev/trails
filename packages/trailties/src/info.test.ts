import { beforeEach, describe, expect, test } from "vitest";
import { Info, PropertyList } from "./info.js";
import { VERSION } from "./version.js";

// Mirrors railties/test/rails_info_test.rb. Test names are kept verbatim.

describe("InfoTest", () => {
  beforeEach(() => {
    // Reset to a known baseline before each test — the module is a singleton.
    Info.properties = new PropertyList();
    Info.property("Trails version", VERSION);
  });

  test("test_property_with_block_swallows_exceptions_and_ignores_property", () => {
    expect(() => {
      Info.property("Bogus", () => {
        throw new Error("boom");
      });
    }).not.toThrow();
    expect(Info.properties.names()).not.toContain("Bogus");
  });

  test("test_property_with_string", () => {
    Info.property("Hello", "World");
    expect(Info.properties.valueFor("Hello")).toBe("World");
  });

  test("test_property_with_block", () => {
    Info.property("Goodbye", () => "World");
    expect(Info.properties.valueFor("Goodbye")).toBe("World");
  });

  test("test_rails_version", () => {
    expect(Info.properties.valueFor("Trails version")).toBe(VERSION);
  });

  test("test_html_includes_middleware", () => {
    Info.property("Middleware", ["Rack::Lock", "Rack::Static"]);
    const html = Info.toHtml();
    expect(html).toContain('<tr><td class="name">Middleware</td>');
    for (const value of Info.properties.valueFor("Middleware") as string[]) {
      expect(html).toContain(`<li>${value}</li>`);
    }
  });

  test("toS renders an aligned table under the about header", () => {
    Info.property("X", "1");
    const out = Info.toS();
    expect(out.split("\n")[0]).toBe("About your application's environment");
    expect(out).toContain("X");
  });

  test("toHtml escapes property names and values", () => {
    Info.property("<danger>", "<bad>");
    const html = Info.toHtml();
    expect(html).toContain("&lt;danger&gt;");
    expect(html).toContain("&lt;bad&gt;");
  });
});
