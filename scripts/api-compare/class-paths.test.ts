import { describe, expect, it } from "vitest";
import { walkedClassPaths } from "./class-paths.js";

describe("walkedClassPaths", () => {
  it("writes each walked export not excluded, with the residue path over the derived one", async () => {
    const entries = await walkedClassPaths("globalid", {
      rows: 0,
      excluded: ["locator.ts::BaseLocator"],
      unwalked: [],
      residue: { "locator.ts::UnscopedLocator": "GlobalID::Locator::Renamed" },
    });
    const byKey = new Map(entries.map((e) => [`${e.file}::${e.tsName}`, e.fqn]));
    expect(byKey.has("locator.ts::BaseLocator")).toBe(false);
    expect(byKey.get("locator.ts::UnscopedLocator")).toBe("GlobalID::Locator::Renamed");
  });
});
