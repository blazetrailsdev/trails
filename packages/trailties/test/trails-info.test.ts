import { beforeEach, describe, expect, test } from "vitest";
import { Info, PropertyList } from "../lib/info.js";
import { VERSION } from "../lib/gem-version.js";

describe("InfoTest", () => {
  beforeEach(() => {
    Info.properties = new PropertyList();
    Info.property("Trails version", VERSION.STRING);
  });

  test("property with block swallows exceptions and ignores property", () => {
    expect(() => {
      Info.property("Bogus", () => {
        throw new Error("boom");
      });
    }).not.toThrow();
    expect(Info.properties.names()).not.toContain("Bogus");
  });

  test("property with string", () => {
    Info.property("Hello", "World");
    expect(Info.properties.valueFor("Hello")).toBe("World");
  });

  test("property with block", () => {
    Info.property("Goodbye", () => "World");
    expect(Info.properties.valueFor("Goodbye")).toBe("World");
  });

  test("trails version", () => {
    expect(Info.properties.valueFor("Trails version")).toBe(VERSION.STRING);
  });

  test("html includes middleware", () => {
    Info.property("Middleware", ["Rack::Lock", "Rack::Static"]);
    const html = Info.toHtml();
    expect(html).toContain('<tr><td class="name">Middleware</td>');
    for (const value of Info.properties.valueFor("Middleware") as string[]) {
      expect(html).toContain(`<li>${value}</li>`);
    }
  });
});
