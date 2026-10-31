import { describe, expect, it } from "vitest";
import { GemInflector } from "./gem-inflector.js";

describe("GemInflector", () => {
  const inflector = new GemInflector("/gem/lib/my_gem.rb");

  it("inflects the root version file as VERSION", () => {
    expect(inflector.camelize("version", "/gem/lib/my_gem/version.rb")).toBe("VERSION");
  });

  it("inflects a nested version file normally", () => {
    expect(inflector.camelize("version", "/gem/lib/my_gem/ns/version.rb")).toBe("Version");
  });

  it("inflects other files normally", () => {
    expect(inflector.camelize("foo", "/gem/lib/my_gem/foo.rb")).toBe("Foo");
  });
});
