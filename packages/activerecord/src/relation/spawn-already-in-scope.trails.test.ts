// Rails' `SpawnMethods#spawn` is
// `already_in_scope?(model.scope_registry) ? model.all : clone`
// (spawn_methods.rb:9-11), and `already_in_scope?` is
// `@delegate_to_model && registry.current_scope(model, true)`
// (relation.rb:1337-1339). `@delegate_to_model` is set only for the duration of
// `_exec_scope`, i.e. while a named-scope body runs.
//
// No Rails test names this branch directly, so these are trails tests pinning
// the port: that the flag is scoped to the scope body, that clones do not
// inherit it (Rails' `initialize_copy` ends in `reset`), and that chaining
// inside a scope body still accumulates conditions.
import { describe, test, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { Post } from "../test-helpers/models/post.js";

registerModel([Post]);

/** The relation internals these tests reach into. */
interface ScopeInternals {
  _isAlreadyInScope(registry: { currentScope(): unknown }): boolean;
  _clone(): ScopeInternals;
  spawn(): ScopeInternals;
  where(conditions: Record<string, unknown>): ScopeInternals;
  toSql(): Promise<string>;
}

type ScopeBody = (rel: ScopeInternals) => unknown;

const model = Post as unknown as {
  scope(name: string, body: ScopeBody): void;
  where(conditions: Record<string, unknown>): ScopeInternals;
};

/** Define a named scope and immediately invoke it. */
function defineAndCallScope(name: string, body: ScopeBody): unknown {
  model.scope(name, body);
  return (Post as unknown as Record<string, () => unknown>)[name]();
}

/** A stand-in registry whose current scope is always `rel`. */
const registryFor = (rel: ScopeInternals) => ({ currentScope: () => rel });

describe("SpawnAlreadyInScopeTest", () => {
  fixtures(["posts"]);

  test("spawn outside a scope body clones", async () => {
    const rel = model.where({ type: "Post" });
    const spawned = rel.spawn();
    expect(spawned).not.toBe(rel);
    expect(await spawned.toSql()).toEqual(await rel.toSql());
  });

  test("scope body relation is already in scope only while the body runs", () => {
    let insideFlag: boolean | undefined;
    let bodyRelation: ScopeInternals | undefined;

    const scoped = defineAndCallScope("titledSomething", (rel) => {
      bodyRelation = rel;
      insideFlag = rel._isAlreadyInScope(registryFor(rel));
      return rel.where({ title: "Welcome to the weblog" });
    });

    expect(insideFlag).toBe(true);
    // The flag is cleared once `_execScope` returns.
    expect(bodyRelation!._isAlreadyInScope(registryFor(bodyRelation!))).toBe(false);
    expect(scoped).toBeDefined();
  });

  test("chaining inside a scope body accumulates conditions", async () => {
    const scoped = defineAndCallScope("chainedInBody", (rel) =>
      rel.where({ type: "Post" }).where({ title: "Welcome to the weblog" }),
    ) as ScopeInternals;

    // If `_delegateToModel` leaked onto clones, the second `where` would spawn
    // `model.all` and drop the first condition.
    const sql = await scoped.toSql();
    expect(sql).toMatch(/type/);
    expect(sql).toMatch(/title/);
  });

  test("clones do not inherit the delegate-to-model flag", () => {
    let clonedFlag: boolean | undefined;

    defineAndCallScope("clonedInBody", (rel) => {
      const cloned = rel._clone();
      clonedFlag = cloned._isAlreadyInScope(registryFor(cloned));
      return rel;
    });

    expect(clonedFlag).toBe(false);
  });
});
