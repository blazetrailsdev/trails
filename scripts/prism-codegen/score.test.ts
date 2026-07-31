import { describe, it, expect } from "vitest";
import { indexPortFile, scoreFile, nameCandidates } from "./score.js";
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

  it("only scores clean defs — tainted ones stay out of the denominator", async () => {
    const score = await scoreRuby(
      `def tainted(a); a <=> 1; end`,
      `export function tainted(a: number) { return a; }`,
    );
    expect(score.entries).toEqual([]);
  });
});
