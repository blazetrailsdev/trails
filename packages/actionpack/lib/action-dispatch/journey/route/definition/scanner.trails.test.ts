import { describe, it, expect } from "vitest";
import { Scanner } from "../../scanner.js";

describe("ActionDispatch::Journey::Scanner", () => {
  it("lastString and lastLiteral expose the last scanned text", () => {
    const s = new Scanner();
    s.scanSetup("/page\\:foo");
    s.nextToken();
    s.nextToken();
    expect(s.lastString()).toBe("page\\:foo");
    expect(s.lastLiteral()).toBe("page:foo");
  });

  it("nextToken returns null at end", () => {
    const s = new Scanner();
    s.scanSetup("/");
    expect(s.nextToken()).toBe("SLASH");
    expect(s.nextToken()).toBeNull();
  });
});
