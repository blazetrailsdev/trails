import { describe, expect, it } from "vitest";
import {
  constantResidue,
  isReceipted,
  splitKey,
  unreceiptedExclusions,
  walkedClassPaths,
} from "./class-paths.js";

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

  it("leaves a walked export no table can seat out of excluded", async () => {
    const record = await constantResidue("activerecord", []);
    expect(record.excluded).not.toContain("test-helpers/models/topic.ts::Topic");
    expect(record.excluded).toContain("future-result.ts::Canceled");
  });
});

describe("walkedClassPaths placement", () => {
  it("writes a self-namespace module as a namespace row with no table", async () => {
    const key = "core-ext/date-and-time/calculations.ts::Calculations";
    const row = (
      await walkedClassPaths("activesupport", {
        ...empty,
        residue: { [key]: "DateAndTime::Calculations" },
      })
    ).find((e) => `${e.file}::${e.tsName}` === key);
    expect(row).toEqual({
      file: "core-ext/date-and-time/calculations.ts",
      tsName: "Calculations",
      fqn: "DateAndTime::Calculations",
      namespace: true,
    });
  });

  it("drops a row in a tsconfig-excluded directory", async () => {
    const byKey = keyed(
      await walkedClassPaths("actionview", { ...empty, residue: { "test-helpers/x.ts::X": "X" } }),
    );
    expect(byKey.has("test-helpers/x.ts::X")).toBe(false);
  });
});

describe("splitKey", () => {
  it("splits at the last separator", () => {
    expect(splitKey("a/b.ts::Owner.Inner")).toEqual(["a/b.ts", "Owner.Inner"]);
    expect(() => splitKey("nokey")).toThrow("is not a file::name key");
  });
});

describe("isReceipted", () => {
  const receipted = (tag: string) => `/**\n * Docs.\n * ${tag}\n */\nexport class Foo {}\n`;

  it("accepts the two receipt shapes on the class's own JSDoc", () => {
    expect(isReceipted(receipted("@noRailsEquivalent PERMANENT"), "Foo")).toBe(true);
    expect(isReceipted(receipted("@noRailsEquivalent CONVERGEABLE some-story"), "Foo")).toBe(true);
    expect(
      isReceipted(`/** @noRailsEquivalent PERMANENT */\nexport default class Foo {}`, "Foo"),
    ).toBe(true);
  });

  it("refuses a bare tag, prose, a detached JSDoc, or another class's receipt", () => {
    expect(isReceipted(receipted("@noRailsEquivalent"), "Foo")).toBe(false);
    expect(isReceipted(receipted("has no @noRailsEquivalent receipt"), "Foo")).toBe(false);
    expect(
      isReceipted(`/** @noRailsEquivalent PERMANENT */\n// note\nexport class Foo {}`, "Foo"),
    ).toBe(false);
    expect(
      isReceipted(
        `/** @noRailsEquivalent PERMANENT */\nexport class Bar {}\nexport class Foo {}`,
        "Foo",
      ),
    ).toBe(false);
  });
});

describe("unreceiptedExclusions", () => {
  const record = { ...empty, excluded: ["locator.ts::BaseLocator", "locator.ts::Locator"] };

  it("reds a key new to excluded with no receipt", async () => {
    const base = { globalid: { ...empty, excluded: ["locator.ts::Locator"] } };
    expect(await unreceiptedExclusions("globalid", record, base)).toEqual([
      "locator.ts::BaseLocator",
    ]);
  });

  it("starts a package new to the record from an empty list", async () => {
    const base = { other: { ...empty, excluded: [] } };
    expect(await unreceiptedExclusions("globalid", record, base)).toEqual(record.excluded);
  });

  it("keeps a base key moved by a token rename", async () => {
    const key = "generators/trails/app/app-generator.ts::AppGenerator";
    const base = {
      trailties: { ...empty, excluded: ["generators/rails/app/app-generator.ts::AppGenerator"] },
    };
    expect(await unreceiptedExclusions("trailties", { ...empty, excluded: [key] }, base)).toEqual(
      [],
    );
  });

  it("credits a package's MRI core class without a receipt", async () => {
    expect(
      await unreceiptedExclusions("date", { ...empty, excluded: ["time.ts::Time"] }, {}),
    ).toEqual([]);
  });

  it("exempts no key when the base record has none", async () => {
    expect(await unreceiptedExclusions("globalid", record, {})).toEqual([
      "locator.ts::BaseLocator",
      "locator.ts::Locator",
    ]);
  });
});
