import { describe, it, expect } from "vitest";
import { generateFromSource } from "./index.js";
import { callableNames, extractPortSymbols, mergePortSymbols } from "./port-symbols.js";

describe("port symbols", () => {
  it("splits a port file into callables and readables", () => {
    const syms = extractPortSymbols(`
      export function buildRelation(this: Host): Relation {}
      export const loadAll = async () => {};
      export class Base {
        static get arelTable(): Table {}
        static tableName = "widgets";
        static aliasAttribute = aliasAttribute;
        save(): void {}
        get name(): string {}
      }
    `);
    expect([...syms.methods].sort()).toEqual(["buildRelation", "loadAll", "save"]);
    expect([...syms.getters].sort()).toEqual(["aliasAttribute", "arelTable", "name", "tableName"]);
  });

  it("declines a name the port spells as a getter anywhere in the tree", () => {
    const names = callableNames(
      mergePortSymbols([
        { path: "core.ts", source: `export function arelTable(this: Host): Table {}` },
        { path: "base.ts", source: `export class Base { static get arelTable(): Table {} }` },
        { path: "relation.ts", source: `export function buildRelation(this: Host) {}` },
      ]),
    );
    expect(names.has("buildRelation")).toBe(true);
    expect(names.has("arelTable")).toBe(false);
  });

  it("emits a call for a paren-less self-call the port declares as a method", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          @relation = build_relation
        end
      end`,
      new Set(),
      "./runtime.js",
      new Map(),
      null,
      new Set(["buildRelation"]),
    );
    expect(code).toContain("this.relation = this.buildRelation();");
  });

  it("keeps a property access for a paren-less self-call the port reads as a getter", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          @relation = arel_table
        end
      end`,
      new Set(),
      "./runtime.js",
      new Map(),
      null,
      new Set(["buildRelation"]),
    );
    expect(code).toContain("this.relation = this.arelTable;");
  });

  it("awards async provenance to a paren-less self-call once it emits a call", async () => {
    const { code } = await generateFromSource(
      `module M
        def load_all
          @relation = build_relation
          @relation.load
        end
      end`,
      new Set(["load", "loadAll", "buildRelation"]),
      "./runtime.js",
      new Map(),
      null,
      new Set(["buildRelation"]),
    );
    expect(code).toContain("this.relation = await this.buildRelation();");
    expect(code).toContain("await this.relation.load()");
  });
});
