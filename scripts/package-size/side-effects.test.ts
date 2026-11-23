import { describe, expect, it } from "vitest";
import {
  AUDITED_PACKAGES,
  auditPackage,
  hasModuleSideEffects,
  readSideEffects,
} from "./side-effects.js";

describe("hasModuleSideEffects", () => {
  it("treats declarations, bound imports and re-exports as pure", () => {
    expect(
      hasModuleSideEffects(`
        import { a } from "./a.js";
        export { b } from "./b.js";
        export interface I { x: number }
        export const K = Symbol.for("k"), M = new Map();
        export function f() { return a; }
        export class C extends a { static x = 1; y = f(); }
      `),
    ).toBe(false);
  });

  it("flags a call, an assignment, a bare import, a static block and an impure static", () => {
    expect(hasModuleSideEffects(`import "./x.js";`)).toBe(true);
    expect(hasModuleSideEffects(`register("sqlite3", "./a.js");`)).toBe(true);
    expect(hasModuleSideEffects(`ActiveRecord.Base = Base;`)).toBe(true);
    expect(hasModuleSideEffects(`class C { static { seat(this); } }`)).toBe(true);
    expect(hasModuleSideEffects(`class C { static x = build(); }`)).toBe(true);
    expect(hasModuleSideEffects(`export const s = Struct.new("a");`)).toBe(true);
  });
});

describe("package.json sideEffects", () => {
  for (const pkg of AUDITED_PACKAGES) {
    it(`${pkg} declares exactly the audited side-effecting modules`, async () => {
      const listed = await auditPackage(pkg);
      expect(await readSideEffects(pkg)).toEqual(listed.length === 0 ? false : listed);
    });
  }
});
