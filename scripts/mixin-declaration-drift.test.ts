import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import {
  findDrift,
  interfaceSignatures,
  mixinSignatures,
  type SignatureEntry,
} from "./mixin-declaration-drift.js";

const ADAPTERS = "packages/activerecord/src/connection-adapters/";

/**
 * Every `include(<Adapter>, <Mixin>)` pair whose mixed-in surface the adapter
 * restates in a declaration-merged interface.
 */
const PAIRS = [
  {
    label: "AbstractAdapter / SchemaStatements",
    mixinFile: `${ADAPTERS}abstract/schema-statements.ts`,
    mixinClass: "SchemaStatements",
    adapterFile: `${ADAPTERS}abstract-adapter.ts`,
    adapterInterface: "AbstractAdapter",
  },
  {
    label: "PostgreSQLAdapter / PostgreSQL::SchemaStatements",
    mixinFile: `${ADAPTERS}postgresql/schema-statements-class.ts`,
    mixinClass: "PostgreSQLSchemaStatements",
    adapterFile: `${ADAPTERS}postgresql-adapter.ts`,
    adapterInterface: "PostgreSQLAdapter",
  },
] as const;

async function signaturesFor(pair: (typeof PAIRS)[number]) {
  const [mixinSource, adapterSource] = await Promise.all([
    fs.readFile(pair.mixinFile, "utf8"),
    fs.readFile(pair.adapterFile, "utf8"),
  ]);
  return {
    mixin: mixinSignatures(pair.mixinFile, mixinSource, pair.mixinClass),
    declared: interfaceSignatures(pair.adapterFile, adapterSource, pair.adapterInterface),
  };
}

describe("mixin declaration drift", () => {
  for (const pair of PAIRS) {
    it(`${pair.label}: the declared interface matches the mixin's signatures`, async () => {
      const { mixin, declared } = await signaturesFor(pair);
      expect(mixin.length).toBeGreaterThan(0);
      expect(declared.length).toBeGreaterThan(0);
      expect(findDrift(mixin, declared)).toEqual([]);
    });
  }

  it("reports a mixin signature the interface no longer matches", () => {
    const mixin: SignatureEntry[] = [{ name: "addIndex", signature: "(name: string): void" }];
    const stale: SignatureEntry[] = [{ name: "addIndex", signature: "(name: number): void" }];
    expect(findDrift(mixin, stale)).toEqual([
      { name: "addIndex", mixin: "(name: string): void", declared: "(name: number): void" },
    ]);
  });

  it("skips a member whose comment waives the diff", () => {
    const source = [
      "export interface Adapter {",
      "  addIndex(name: string): void;",
      "  /** drift-ok: the subclass widens this. */",
      "  buildIndex(name: string): void;",
      "}",
    ].join("\n");
    expect(interfaceSignatures("adapter.ts", source, "Adapter").map((e) => e.name)).toEqual([
      "addIndex",
    ]);
  });

  it("ignores interface members the mixin does not provide", () => {
    const mixin: SignatureEntry[] = [{ name: "addIndex", signature: "(name: string): void" }];
    const declared: SignatureEntry[] = [
      { name: "addIndex", signature: "(name: string): void" },
      { name: "fromASubclass", signature: "(): void" },
    ];
    expect(findDrift(mixin, declared)).toEqual([]);
  });
});
