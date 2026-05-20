import { describe, it, expect } from "vitest";
import { TestCase, TestSession } from "./test-case.js";
import { Base } from "./base.js";

describe("TestSession Rails-mirroring API", () => {
  it("isExists / isEnabled are always true (Rails: exists?/enabled?)", () => {
    const s = new TestSession();
    expect(s.isExists()).toBe(true);
    expect(s.isEnabled()).toBe(true);
  });

  it("keys / values reflect stored data", () => {
    const s = new TestSession({ a: 1, b: 2 });
    expect(s.keys()).toEqual(["a", "b"]);
    expect(s.values()).toEqual([1, 2]);
  });

  it("destroy clears stored data", () => {
    const s = new TestSession({ a: 1 });
    s.destroy();
    expect(s.keys()).toEqual([]);
  });

  it("dig stringifies the first key (mirrors Rails)", () => {
    const s = new TestSession({ user: { name: "Ada" } });
    expect(s.dig("user", "name")).toBe("Ada");
    expect(s.dig("missing")).toBeUndefined();
  });

  it("fetch returns the value, the fallback, or throws", () => {
    const s = new TestSession({ a: 1 });
    expect(s.fetch("a")).toBe(1);
    expect(s.fetch("b", 99)).toBe(99);
    expect(s.fetch("c", () => "lazy")).toBe("lazy");
    expect(s.fetch("d", (k: string) => `missing:${k}`)).toBe("missing:d");
    expect(() => s.fetch("missing")).toThrow();
  });

  it("idWas / loadBang return the constructor-frozen id", () => {
    const s = new TestSession({}, "abc123");
    expect(s.idWas()).toBe("abc123");
    expect(s.loadBang()).toBe("abc123");
  });
});

describe("TestCase class helpers", () => {
  class PostsController extends Base {}

  it("tests(class) sets controllerClass", () => {
    class Sub extends TestCase {}
    Sub.tests(PostsController);
    expect(Sub.controllerClass).toBe(PostsController);
  });

  it("tests(string) resolves <Name>Controller via globalThis", () => {
    (globalThis as Record<string, unknown>).WidgetController = PostsController;
    try {
      class Sub extends TestCase {}
      Sub.tests("widget");
      expect(Sub.controllerClass).toBe(PostsController);
    } finally {
      delete (globalThis as Record<string, unknown>).WidgetController;
    }
  });

  it("tests(string) raises NameError-style when no matching constant exists", () => {
    class Sub extends TestCase {}
    expect(() => Sub.tests("nonexistent_blarg")).toThrow(
      /uninitialized constant NonexistentBlargController/,
    );
  });

  it("controllerClass is per-class — subclasses don't inherit the base's setting", () => {
    class Base1 extends TestCase {}
    class Sub1 extends Base1 {}
    Base1.tests(PostsController);
    expect(Base1.controllerClass).toBe(PostsController);
    // Sub1 never set its own controllerClass; it should infer (returns
    // null here since no matching constant), not pick up Base1's value.
    expect(Sub1.controllerClass).toBeNull();
  });

  it("controllerClassName returns the configured class name", () => {
    class Sub extends TestCase {}
    Sub.tests(PostsController);
    const tc = new Sub(PostsController);
    expect(tc.controllerClassName()).toBe("PostsController");
  });

  it("determineDefaultControllerClass strips trailing Test and looks up", () => {
    (globalThis as Record<string, unknown>).BooksController = PostsController;
    try {
      expect(TestCase.determineDefaultControllerClass("BooksControllerTest")).toBe(PostsController);
      expect(TestCase.determineDefaultControllerClass("MissingTest")).toBeNull();
    } finally {
      delete (globalThis as Record<string, unknown>).BooksController;
    }
  });
});
