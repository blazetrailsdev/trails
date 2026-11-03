import { describe, expect, it } from "vitest";
import { constantResidue, isReceipted, splitKey, walkedClassPaths } from "./class-paths.js";

const empty = { rows: 0, excluded: [], unwalked: [], residue: {} };
const keyed = (entries: { file: string; tsName: string; fqn: string }[]) =>
  new Map(entries.map((e) => [`${e.file}::${e.tsName}`, e.fqn]));

describe("walkedClassPaths", () => {
  it("writes each walked export not excluded, with the residue path over the derived one", async () => {
    const byKey = keyed(
      await walkedClassPaths("globalid", {
        ...empty,
        excluded: ["locator.ts::BaseLocator"],
        residue: { "locator.ts::UnscopedLocator": "GlobalID::Locator::Renamed" },
      }),
    );
    expect(byKey.has("locator.ts::BaseLocator")).toBe(false);
    expect(byKey.get("locator.ts::UnscopedLocator")).toBe("GlobalID::Locator::Renamed");
  });

  it("writes an unwalked member at its derived path", async () => {
    const byKey = keyed(
      await walkedClassPaths("globalid", { ...empty, unwalked: ["locator.ts::Locator.Inner"] }),
    );
    expect(byKey.get("locator.ts::Locator.Inner")).toBe("GlobalID::Locator::Inner");
  });

  it("raises on an unwalked member with no derived path", async () => {
    await expect(
      walkedClassPaths("mail", { ...empty, unwalked: ["encodings/7bit.ts::SevenBit"] }),
    ).rejects.toThrow("has no derived path");
  });

  it("drops a row in a file outside every entry graph", async () => {
    const byKey = keyed(
      await walkedClassPaths("globalid", { ...empty, residue: { "nowhere.ts::Nope": "Nope" } }),
    );
    expect(byKey.has("nowhere.ts::Nope")).toBe(false);
  });

  it("round-trips the record constantResidue writes", async () => {
    const entries = await walkedClassPaths("globalid", empty);
    const kept = entries.filter((e) => e.tsName !== "BaseLocator");
    const record = await constantResidue("globalid", kept);
    expect(record.excluded).toContain("locator.ts::BaseLocator");
    expect(keyed(await walkedClassPaths("globalid", record))).toEqual(keyed(kept));
  });
});

describe("splitKey", () => {
  it("splits at the last separator", () => {
    expect(splitKey("a/b.ts::Owner.Inner")).toEqual(["a/b.ts", "Owner.Inner"]);
    expect(() => splitKey("nokey")).toThrow("is not a file::name key");
  });
});

describe("isReceipted", () => {
  it("reads @noRailsEquivalent off the class's own JSDoc only", async () => {
    expect(await isReceipted("globalid", "locator.ts::BaseLocator")).toBe(false);
  });
});
