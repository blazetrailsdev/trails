import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
// @internal
// @internal
import { applyAssociationScope } from "../associations.js";

describe("applyAssociationScope", () => {
  const owner = Object.create(Base.prototype) as Base;

  it("returns rel unchanged when scope is null/undefined", () => {
    const rel = { tag: "rel" };
    expect(applyAssociationScope(rel, null, owner)).toBe(rel);
    expect(applyAssociationScope(rel, undefined, owner)).toBe(rel);
  });

  it("invokes the scope and returns its result", () => {
    const rel = { tag: "rel" };
    const next = { tag: "next" };
    const out = applyAssociationScope(rel, () => next, owner);
    expect(out).toBe(next);
  });

  it("falls back to rel when the scope returns falsy (Rails `|| relation`)", () => {
    const rel = { tag: "rel" };
    expect(applyAssociationScope(rel, () => null, owner)).toBe(rel);
    expect(applyAssociationScope(rel, () => undefined, owner)).toBe(rel);
    expect(applyAssociationScope(rel, () => false, owner)).toBe(rel);
  });

  it("passes the owner as the second positional arg", () => {
    let captured: Base | undefined;
    const rel = { tag: "rel" };
    applyAssociationScope(
      rel,
      (r, o) => {
        captured = o;
        return r;
      },
      owner,
    );
    expect(captured).toBe(owner);
  });

  it("skips application when scope === reflectionScope (avoids double-merge)", () => {
    const rel = { tag: "rel" };
    let calls = 0;
    const refScope = (r: typeof rel) => {
      calls++;
      return r;
    };
    const out = applyAssociationScope(rel, refScope, owner, refScope);
    expect(calls).toBe(0);
    expect(out).toBe(rel);
  });

  it("runs application when scope !== reflectionScope (synthesized wrapper)", () => {
    const rel = { tag: "rel" };
    const refScope = (r: typeof rel) => r;
    const wrapper = (r: typeof rel) => ({ ...r, wrapped: true }) as typeof rel;
    const out = applyAssociationScope(rel, wrapper, owner, refScope);
    expect(out).toEqual({ tag: "rel", wrapped: true });
  });

  it("binds `this` to rel for arity-0 function-keyword scopes (Rails `instance_exec`)", () => {
    const rel = { tag: "rel", marked: false };
    const out = applyAssociationScope(
      rel,
      function (this: typeof rel) {
        return { ...this, marked: true };
      },
      owner,
    );
    expect(out).toEqual({ tag: "rel", marked: true });
  });

  it("works with arity-0/1 scopes that ignore the owner arg", () => {
    const rel = { tag: "rel", n: 0 };
    const out = applyAssociationScope(rel, (r) => ({ ...r, n: r.n + 1 }), owner);
    expect(out).toEqual({ tag: "rel", n: 1 });
  });
});
