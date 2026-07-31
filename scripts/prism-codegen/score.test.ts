import { describe, it, expect } from "vitest";
import { indexPortFile, indexPortTree, scoreFile, nameCandidates } from "./score.js";
import { generateFromSource } from "./index.js";
import { TOPLEVEL } from "./codegen.js";

async function scoreRuby(ruby: string, port: string) {
  const { code, perDef } = await generateFromSource(ruby);
  const clean = new Set(
    [...perDef].filter(([n, d]) => n !== TOPLEVEL && d.passthrough === 0).map(([n]) => n),
  );
  return scoreFile(code, port, clean);
}

describe("prism-codegen scorer", () => {
  it("resolves the port's mixin indirection maps to implementation bodies", () => {
    const idx = indexPortFile(`
      export async function performFindBy(this: R, c: unknown): Promise<any> {
        return this.where(c).limit(1).toArray();
      }
      function inQueryConnection(fn: unknown) { return fn; }
      export const FinderMethods = {
        findBy: performFindBy,
        count: inQueryConnection(performCount),
      };
      export async function performCount(this: R): Promise<any> { return 0; }
    `);
    expect(idx.byName.has("findBy")).toBe(true);
    expect(idx.byName.has("count")).toBe(true);
    expect(idx.byName.get("findBy")).toBe(idx.byName.get("performFindBy"));
  });

  it("matches when generated and ported bodies share call/control skeletons", async () => {
    const score = await scoreRuby(
      `def take_one(list)
         if list.empty?
           raise ArgumentError.new("empty")
         end
         list.first
       end`,
      `export function takeOne(list: unknown[]): unknown {
         if (list.empty()) {
           throw new ArgumentError("empty");
         }
         return list.first;
       }`,
    );
    expect(score.entries).toEqual([
      expect.objectContaining({ name: "takeOne", status: "matched" }),
    ]);
    expect(score.conformancePct).toBe(100);
  });

  it("flags divergence when the port realizes helpers inline", async () => {
    const score = await scoreRuby(
      `def take_it(list)
         find_take(list)
       end`,
      `export function takeIt(list: unknown[]): unknown {
         const rel = clone(list);
         return rel.toArray();
       }`,
    );
    expect(score.entries).toEqual([
      expect.objectContaining({ name: "takeIt", status: "divergent" }),
    ]);
    expect(score.conformancePct).toBe(0);
  });

  it("classifies a clean def with no port symbol as missing", async () => {
    const score = await scoreRuby(
      `def orphan; 1; end`,
      `export function unrelated() { return 2; }`,
    );
    expect(score.entries).toEqual([expect.objectContaining({ name: "orphan", status: "missing" })]);
  });

  it("accepts both predicate name candidates (isExists/exists)", () => {
    expect(nameCandidates("isExists")).toEqual(["isExists", "exists"]);
    expect(nameCandidates("find")).toEqual(["find"]);
  });

  it("normalizes perform-prefixed callees and .call(this) receivers in skeletons", async () => {
    const score = await scoreRuby(
      `def sole(list)
         found = first(list)
         found
       end`,
      `export function sole(list: unknown[]): unknown {
         const found = performFirst.call(this, list);
         return found;
       }`,
    );
    expect(score.entries).toEqual([expect.objectContaining({ name: "sole", status: "matched" })]);
  });

  it("classifies reordered-but-equivalent bodies separately from divergence", async () => {
    const score = await scoreRuby(
      `def cache_me
         if cache_version
           combine(cache_key, cache_version)
         end
       end`,
      `export function cacheMe(this: R): string {
         const key = this.combine(this.cacheKey, this.cacheVersion);
         if (this.cacheVersion) {
           return key;
         }
       }`,
    );
    expect(score.entries).toEqual([
      expect.objectContaining({ name: "cacheMe", status: "reordered" }),
    ]);
    expect(score.conformancePct).toBe(100);
  });

  it("canonicalizes stdlib idiom tokens on both sides (each/forEach, size/length)", async () => {
    const score = await scoreRuby(
      `def tally(rows)
         rows.each { |r| record(r) }
         rows.size
       end`,
      `export function tally(this: R, rows: unknown[]): number {
         rows.forEach((r) => this.record(r));
         return rows.length;
       }`,
    );
    expect(score.entries).toEqual([expect.objectContaining({ name: "tally", status: "matched" })]);
  });

  it("rejects a predicate fallback candidate that collides with a different-arity method", async () => {
    // Rails readonly? (0 args) must NOT match the port of Rails readonly(value).
    const score = await scoreRuby(
      `def readonly?; readonly_value; end`,
      `export function readonly(this: R, value = true): R {
         const rel = this.clone();
         rel.readonlyBang(value);
         return rel;
       }`,
    );
    expect(score.entries).toEqual([
      expect.objectContaining({ name: "isReadonly", status: "missing" }),
    ]);
  });

  it("resolves a def ported into a different file via the global index", async () => {
    const { code, perDef } = await generateFromSource(
      `def create_record(attrs); persist(attrs); end`,
    );
    const clean = new Set(
      [...perDef].filter(([n, d]) => n !== TOPLEVEL && d.passthrough === 0).map(([n]) => n),
    );
    const globalIndex = indexPortTree([
      {
        path: "callbacks.ts",
        source: `export function createRecord(this: R, attrs: unknown): unknown {
          return this.persist(attrs);
        }`,
      },
    ]);
    const score = scoreFile(code, `export function unrelated() {}`, clean, globalIndex);
    expect(score.entries).toEqual([
      expect.objectContaining({
        name: "createRecord",
        status: "matched",
        portFile: "callbacks.ts",
      }),
    ]);
  });

  it("only scores clean defs — tainted ones stay out of the denominator", async () => {
    const score = await scoreRuby(
      `def tainted(a); a <=> 1; end`,
      `export function tainted(a: number) { return a; }`,
    );
    expect(score.entries).toEqual([]);
  });
});
