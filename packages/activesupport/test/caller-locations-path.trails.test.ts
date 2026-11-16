import { describe, expect, it } from "vitest";
import { callerLocations } from "../lib/deprecation.js";

describe("callerLocations Location#path", () => {
  it("is a filesystem path for an ESM frame, not a file:// URL", () => {
    const here = () => callerLocations(0, 1)[0];
    const location = here();
    expect(location.path.startsWith("file://")).toBe(false);
    expect(location.path).toMatch(/caller-locations-path\.trails\.test\.ts$/);
    expect(location.absolutePath).toBe(location.path);
  });
});
