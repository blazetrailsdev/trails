/**
 * Unit tests for the cross-cutting `applyAssociationScope` helper.
 *
 * Mirrors Rails' `AssociationScope#eval_scope`
 * (`activerecord/lib/active_record/associations/association_scope.rb:169-172`):
 *
 *   relation.instance_exec(owner, &scope) || relation
 *
 * The TS helper consolidates the equivalent post-merge step shared by
 * `loadBelongsTo`, `loadHasOne` (×2 — reflection path + inline fallback),
 * `loadHasMany` (×2), `loadHasManyThrough` (×2), `loadHabtm`,
 * `buildHasManyRelation`, and the DJAS-routed `_loadThroughViaDisableJoinsScope`.
 */
import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
// `applyAssociationScope` is `@internal`. It's imported from
// `associations.ts` directly (not re-exported through the package
// entry) so it stays out of generated TypeDoc / index types — the
// repo-wide pattern for Rails-private helpers (see CLAUDE.md's
// `@internal` policy + the `blazetrails/rails-private-jsdoc` lint
// rule). The `exports` map's `./*` subpath still allows reach via
// `@blazetrails/activerecord/associations.js`; encapsulation here is
// the same convention every other `_`-prefixed helper relies on.
import { applyAssociationScope } from "../associations.js";

describe("applyAssociationScope", () => {
  // Use a bare Base instance as the `owner` placeholder; the helper only
  // forwards it positionally to the scope lambda.
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
    // Truthiness-based — mirrors Ruby's `|| relation`. The scope type
    // `R | false | null | undefined` covers all three legitimate falsy
    // returns: `null`/`undefined` (Ruby `nil`) and `false` (idiomatic
    // JS `cond && rel.where(...)` short-circuit).
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
    // Mirrors the head-scope dispatch in `association-scope.ts:583-589`:
    // `fn.length === 0 ? fn.call(scope) : fn.call(scope, scope, owner)`.
    const rel = { tag: "rel", marked: false };
    const out = applyAssociationScope(
      rel,
      function (this: typeof rel) {
        // `this` is the relation; mutate-and-return mirrors Ruby's
        // `instance_exec` self-binding for 0-arg scopes.
        return { ...this, marked: true };
      },
      owner,
    );
    expect(out).toEqual({ tag: "rel", marked: true });
  });

  it("works with arity-0/1 scopes that ignore the owner arg", () => {
    const rel = { tag: "rel", n: 0 };
    // Arity-1 (typical in this codebase): `(rel) => rel.where(...)` shape.
    const out = applyAssociationScope(rel, (r) => ({ ...r, n: r.n + 1 }), owner);
    expect(out).toEqual({ tag: "rel", n: 1 });
  });
});
