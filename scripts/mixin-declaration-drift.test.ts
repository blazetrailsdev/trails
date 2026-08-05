import { describe, expect, it } from "vitest";
import * as fs from "fs/promises";
import { BetterSQLite3Adapter } from "../packages/activerecord/src/connection-adapters/better-sqlite3-adapter.js";
import { PostgreSQLAdapter } from "../packages/activerecord/src/connection-adapters/postgresql-adapter.js";
import { AbstractMysqlAdapter } from "../packages/activerecord/src/connection-adapters/abstract-mysql-adapter.js";
import {
  findDrift,
  findUninstalled,
  interfaceSignatures,
  mixinSignatures,
  requiredInterfaceMethodNames,
  type SignatureEntry,
} from "./mixin-declaration-drift.js";

const ADAPTERS = "packages/activerecord/src/connection-adapters/";

/**
 * Every `include(<Adapter>, <Mixin>)` pair whose mixed-in surface the adapter
 * restates in a declaration-merged interface.
 *
 * `witness` is the concrete class the declared surface is checked against.
 * `AbstractAdapter` cannot vouch for itself: a handful of its declared methods
 * (`beginTransaction`, `commit`, `rollback`, `executeMutation`,
 * `currentDatabase`) are the base's abstract contract, implemented only by
 * concrete adapters — SQLite stands in for them, as it does in
 * `quoting-contract.test.ts`.
 */
const PAIRS = [
  {
    label: "AbstractAdapter / SchemaStatements",
    mixinFile: `${ADAPTERS}abstract/schema-statements.ts`,
    mixinClass: "SchemaStatements",
    adapterFile: `${ADAPTERS}abstract-adapter.ts`,
    adapterInterface: "AbstractAdapter",
    witness: BetterSQLite3Adapter,
  },
  {
    label: "PostgreSQLAdapter / PostgreSQL::SchemaStatements",
    mixinFile: `${ADAPTERS}postgresql/schema-statements-class.ts`,
    mixinClass: "SchemaStatements",
    adapterFile: `${ADAPTERS}postgresql-adapter.ts`,
    adapterInterface: "PostgreSQLAdapter",
    witness: PostgreSQLAdapter,
  },
  {
    label: "AbstractMysqlAdapter / MySQL::SchemaStatements",
    mixinFile: `${ADAPTERS}mysql/schema-statements.ts`,
    mixinClass: "MysqlSchemaStatements",
    adapterFile: `${ADAPTERS}abstract-mysql-adapter.ts`,
    adapterInterface: "AbstractMysqlAdapter",
    witness: AbstractMysqlAdapter,
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

    it(`${pair.label}: every declared method is installed on the adapter`, async () => {
      // AbstractAdapter defers its own `include()` to the first construction (see
      // ensureAbstractAdapterMixinsApplied), so a prototype read before any
      // adapter exists sees none of the mixed-in methods.
      new BetterSQLite3Adapter(":memory:").disconnectBang();

      const source = await fs.readFile(pair.adapterFile, "utf8");
      const names = requiredInterfaceMethodNames(pair.adapterFile, source, pair.adapterInterface);
      expect(names.length).toBeGreaterThan(0);
      expect(findUninstalled(names, pair.witness.prototype)).toEqual([]);
    });
  }

  it("reports a declared method nothing on the prototype chain provides", () => {
    const base = { addIndex() {} };
    const prototype = Object.create(base) as object;
    expect(findUninstalled(["addIndex", "renamedAway"], prototype)).toEqual(["renamedAway"]);
  });

  it("does not require optional or waived members to be installed", () => {
    const source = [
      "export interface Adapter {",
      "  addIndex(name: string): void;",
      "  explain?(sql: string): void;",
      "  /** drift-ok: subclasses only. */",
      "  castResult(row: unknown): void;",
      "}",
    ].join("\n");
    expect(requiredInterfaceMethodNames("adapter.ts", source, "Adapter")).toEqual(["addIndex"]);
  });

  it("compares a mixin getter against the interface property that restates it", () => {
    const mixinSource = [
      "export class Mixin {",
      "  get schemaCreation(): SchemaCreation {",
      "    return new SchemaCreation(this);",
      "  }",
      "}",
    ].join("\n");
    const interfaceSource = [
      "export interface Adapter {",
      "  readonly schemaCreation: SchemaCreation;",
      "}",
    ].join("\n");
    const mixin = mixinSignatures("mixin.ts", mixinSource, "Mixin");
    const declared = interfaceSignatures("adapter.ts", interfaceSource, "Adapter");
    expect(mixin).toEqual([{ name: "schemaCreation", signature: ": SchemaCreation" }]);
    expect(findDrift(mixin, declared)).toEqual([]);
    expect(requiredInterfaceMethodNames("adapter.ts", interfaceSource, "Adapter")).toEqual([
      "schemaCreation",
    ]);
  });

  it("reports a getter the interface restates with a stale type", () => {
    const mixinSource = "export class Mixin {\n  get schemaCreation(): SchemaCreation {}\n}";
    const interfaceSource = "export interface Adapter {\n  readonly schemaCreation: unknown;\n}";
    expect(
      findDrift(
        mixinSignatures("mixin.ts", mixinSource, "Mixin"),
        interfaceSignatures("adapter.ts", interfaceSource, "Adapter"),
      ),
    ).toEqual([{ name: "schemaCreation", mixin: ": SchemaCreation", declared: ": unknown" }]);
  });

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
