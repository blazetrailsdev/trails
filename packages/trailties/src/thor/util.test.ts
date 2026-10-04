import { describe, expect, it } from "vitest";
import { namespaceFromThorClass, snakeCase } from "./util.js";

describe("Thor::Util", () => {
  describe("#namespace_from_thor_class", () => {
    it("replaces constant nesting with command namespacing", () => {
      expect(namespaceFromThorClass("Foo::Bar::Baz")).toEqual("foo:bar:baz");
    });

    it("snake-cases component strings", () => {
      expect(namespaceFromThorClass("FooBar::BarBaz::BazBoom")).toEqual("foo_bar:bar_baz:baz_boom");
    });

    it("removes Thor::Sandbox namespace", () => {
      expect(namespaceFromThorClass("Thor::Sandbox::Package")).toEqual("package");
    });
  });

  describe("#snake_case", () => {
    it("preserves no-cap strings", () => {
      expect(snakeCase("foo")).toEqual("foo");
      expect(snakeCase("foo_bar")).toEqual("foo_bar");
    });

    it("downcases all-caps strings", () => {
      expect(snakeCase("FOO")).toEqual("foo");
      expect(snakeCase("FOO_BAR")).toEqual("foo_bar");
    });

    it("downcases initial-cap strings", () => {
      expect(snakeCase("Foo")).toEqual("foo");
    });

    it("replaces camel-casing with underscores", () => {
      expect(snakeCase("FooBarBaz")).toEqual("foo_bar_baz");
      expect(snakeCase("Foo_BarBaz")).toEqual("foo_bar_baz");
    });

    it("places underscores between multiple capitals", () => {
      expect(snakeCase("ABClass")).toEqual("a_b_class");
    });
  });
});
