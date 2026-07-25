// Rails' `SpawnMethods#spawn` is
// `already_in_scope?(model.scope_registry) ? model.all : clone`
// (spawn_methods.rb:9-11), and `already_in_scope?` is
// `@delegate_to_model && registry.current_scope(model, true)`
// (relation.rb:1337-1339). `@delegate_to_model` is set only for the duration of
// `_exec_scope` (relation.rb:552-558), i.e. while a named-scope body runs.
//
// No Rails test names this branch, and it is not reachable through ordinary
// named-scope use: `_exec_scope` nils the current scope for the duration of the
// body, so `@delegate_to_model` and a non-nil current scope do not normally
// coincide. These trails tests therefore establish the precondition explicitly
// (via the real scope registry) and drive `spawn()` itself, so the `model.all`
// arm is actually executed rather than merely present.
import { describe, test, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Post } from "../test-helpers/models/post.js";

registerModel([Post]);

/** The relation internals these tests reach into. */
interface ScopeInternals {
  isAlreadyInScope(registry: ScopeRegistryLike): boolean;
  _clone(): ScopeInternals;
  spawn(): ScopeInternals;
  where(conditions: Record<string, unknown>): ScopeInternals;
  toSql(): Promise<string>;
}

interface ScopeRegistryLike {
  currentScope(model: unknown, skipInherited?: boolean): unknown;
  setCurrentScope(model: unknown, scope: unknown): void;
}

type ScopeBody = (rel: ScopeInternals) => unknown;

const model = Post as unknown as {
  scope(name: string, body: ScopeBody): void;
  where(conditions: Record<string, unknown>): ScopeInternals;
  scopeRegistry(): ScopeRegistryLike;
};

/** Define a named scope and immediately invoke it. */
function defineAndCallScope(name: string, body: ScopeBody): unknown {
  model.scope(name, body);
  return (Post as unknown as Record<string, () => unknown>)[name]();
}

/** Run `fn` with `scope` installed as the model's current scope. */
function withCurrentScope<R>(scope: unknown, fn: (registry: ScopeRegistryLike) => R): R {
  const registry = model.scopeRegistry();
  const previous = registry.currentScope(Post, true);
  registry.setCurrentScope(Post, scope);
  try {
    return fn(registry);
  } finally {
    registry.setCurrentScope(Post, previous ?? null);
  }
}

describe("SpawnAlreadyInScopeTest", () => {
  fixtures(["posts"]);

  test("spawn outside a scope body clones the receiver", async () => {
    const rel = model.where({ type: "Post" });
    const spawned = rel.spawn();

    expect(spawned).not.toBe(rel);
    expect(await spawned.toSql()).toEqual(await rel.toSql());
  });

  test("spawn inside a scope body re-derives model.all instead of cloning", async () => {
    // The discriminating case: the current scope is a *different* relation from
    // the receiver. `clone` would keep the receiver's `title` condition;
    // `model.all` re-derives from the current scope and carries `type` instead.
    const currentScope = model.where({ type: "SpecialPost" });
    let spawned: ScopeInternals | undefined;

    defineAndCallScope("spawnsInsideBody", (rel) => {
      withCurrentScope(currentScope, () => {
        // Drive spawn on `rel` itself, which `_execScope` marked
        // delegate-to-model — a clone would not carry the flag.
        spawned = rel.spawn();
      });
      return rel;
    });

    // `spawn` re-derived `model.all` (the current scope) rather than cloning
    // the receiver, so it carries the current scope's condition.
    expect(await spawned!.toSql()).toMatch(/SpecialPost/);
  });

  test("already in scope requires both the flag and a current scope", () => {
    const outside = model.where({ type: "Post" });
    // Flag unset (not in a scope body) — a current scope alone is not enough.
    withCurrentScope(outside, (registry) => {
      expect(outside.isAlreadyInScope(registry)).toBe(false);
    });

    let flagWithoutScope: boolean | undefined;
    let flagWithScope: boolean | undefined;
    let flagAfterBody: boolean | undefined;
    let bodyRelation: ScopeInternals | undefined;

    defineAndCallScope("checksBothConditions", (rel) => {
      bodyRelation = rel;
      const registry = model.scopeRegistry();
      // `_exec_scope` nils the current scope, so the flag alone is not enough.
      flagWithoutScope = rel.isAlreadyInScope(registry);
      withCurrentScope(rel, (reg) => {
        flagWithScope = rel.isAlreadyInScope(reg);
      });
      return rel;
    });

    withCurrentScope(bodyRelation, (registry) => {
      flagAfterBody = bodyRelation!.isAlreadyInScope(registry);
    });

    expect(flagWithoutScope).toBe(false);
    expect(flagWithScope).toBe(true);
    // The flag is cleared once `_execScope` returns.
    expect(flagAfterBody).toBe(false);
  });

  test("clones do not inherit the delegate-to-model flag", () => {
    let clonedFlag: boolean | undefined;

    defineAndCallScope("clonedInBody", (rel) => {
      const cloned = rel._clone();
      withCurrentScope(cloned, (registry) => {
        clonedFlag = cloned.isAlreadyInScope(registry);
      });
      return rel;
    });

    // Rails' `initialize_copy` ends in `reset`, which clears the flag. If it
    // leaked, a derived relation would report "already in scope" whenever a
    // current scope is installed, and spawn would discard its own values.
    expect(clonedFlag).toBe(false);
  });

  // A plain composition sanity check on the `_execScope` rewiring — it does not
  // discriminate the clone-flag leak, since `_exec_scope` nils the current scope
  // for the duration of the body (the test above covers the leak).
  test("chaining inside a scope body accumulates conditions", async () => {
    const scoped = defineAndCallScope("chainedInBody", (rel) =>
      rel.where({ type: "Post" }).where({ title: "Welcome to the weblog" }),
    ) as ScopeInternals;

    const sql = await scoped.toSql();
    expect(sql).toMatch(/type/);
    expect(sql).toMatch(/title/);
  });
});
