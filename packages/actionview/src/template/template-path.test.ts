import { describe, expect, test } from "vitest";

import { TemplatePath } from "../template-path.js";

describe("TemplatePathTest", () => {
  test("build returns path object", () => {
    const path = TemplatePath.build("bar", "foo", true);
    expect(path.virtual).toBe("foo/_bar");
    expect(path.prefix).toBe("foo");
    expect(path.name).toBe("bar");
    expect(path.partial).toBe(true);
  });

  test("virtual", () => {
    expect(TemplatePath.virtual("bar", "foo", false)).toBe("foo/bar");
    expect(TemplatePath.virtual("bar", "foo", true)).toBe("foo/_bar");
    expect(TemplatePath.virtual("bar", "", false)).toBe("bar");
    expect(TemplatePath.virtual("bar", "", true)).toBe("_bar");
    expect(TemplatePath.virtual("baz", "foo/bar", false)).toBe("foo/bar/baz");
  });

  test("parse root template", () => {
    const path = TemplatePath.parse("foo");
    expect(path.prefix).toBe("");
    expect(path.name).toBe("foo");
    expect(path.partial).toBe(false);
  });

  test("parse root template with slash", () => {
    const path = TemplatePath.parse("/foo");
    expect(path.prefix).toBe("");
    expect(path.name).toBe("foo");
    expect(path.partial).toBe(false);
  });

  test("parse root partial", () => {
    const path = TemplatePath.parse("_foo");
    expect(path.prefix).toBe("");
    expect(path.name).toBe("foo");
    expect(path.partial).toBe(true);
  });

  test("parse root partial with slash", () => {
    const path = TemplatePath.parse("/_foo");
    expect(path.prefix).toBe("");
    expect(path.name).toBe("foo");
    expect(path.partial).toBe(true);
  });

  test("parse template", () => {
    const path = TemplatePath.parse("foo/bar");
    expect(path.prefix).toBe("foo");
    expect(path.name).toBe("bar");
    expect(path.partial).toBe(false);
  });

  test("parse partial", () => {
    const path = TemplatePath.parse("foo/_bar");
    expect(path.prefix).toBe("foo");
    expect(path.name).toBe("bar");
    expect(path.partial).toBe(true);
  });

  test("parse deep partial", () => {
    const path = TemplatePath.parse("foo/bar/_baz");
    expect(path.prefix).toBe("foo/bar");
    expect(path.name).toBe("baz");
    expect(path.partial).toBe(true);
  });

  test("parse deep partial with slash", () => {
    const path = TemplatePath.parse("/foo/bar/_baz");
    expect(path.prefix).toBe("foo/bar");
    expect(path.name).toBe("baz");
    expect(path.partial).toBe(true);
  });
});
