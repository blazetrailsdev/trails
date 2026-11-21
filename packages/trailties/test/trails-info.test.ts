import { beforeEach, describe, expect, test } from "vitest";
import { Info, PropertyList } from "../lib/info.js";
import { VERSION } from "../lib/gem-version.js";

const properties = () => Info.properties;

const isPropertyDefined = (propertyName: string): boolean =>
  properties().names().includes(propertyName);

const assertProperty = (propertyName: string, value: unknown): void => {
  if (!isPropertyDefined(propertyName)) throw new Error(`Property "${propertyName}" not defined`);
  expect(properties().valueFor(propertyName)).toEqual(value);
};

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
    expect(isPropertyDefined("Bogus")).toBeFalsy();
  });

  test("property with string", () => {
    Info.property("Hello", "World");
    assertProperty("Hello", "World");
  });

  test("property with block", () => {
    Info.property("Goodbye", () => "World");
    assertProperty("Goodbye", "World");
  });

  test("trails version", () => {
    assertProperty("Trails version", VERSION.STRING);
  });

  test("html includes middleware", () => {
    Info.property("Middleware", ["Rack::Lock", "Rack::Static"]);
    const html = Info.toHtml();
    expect(html).toContain('<tr><td class="name">Middleware</td>');
    for (const value of properties().valueFor("Middleware") as string[]) {
      expect(html).toContain(`<li>${value}</li>`);
    }
  });
});
