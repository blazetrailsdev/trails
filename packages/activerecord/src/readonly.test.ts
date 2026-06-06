/**
 * Mirrors: activerecord/test/cases/readonly_test.rb
 *
 * Faithful port of Rails' ReadOnlyTest. Rides the canonical schema + models
 * (Developer / Person / Post / Project) via the handler suite + transactional
 * fixtures — declares NO bespoke `defineSchema` and uses NO `dropExisting`, so it
 * issues zero per-test DDL (every table it touches is already in the preloaded
 * canonical schema, a signature-cache hit). Removes the divergent
 * `posts`/`users`/`products`/`items`/`devs`/`ro_people` shapes the old version
 * wrote into the shared worker DB — the cross-file collisions that forced
 * `dropExisting` shields in sibling suites.
 *
 * Test names mirror the Ruby method names verbatim (`test:compare` matches on
 * them). Tests blocked by a genuine trails gap (association collection proxy,
 * has_many through) are `it.skip` with a precise reason rather than silently
 * stubbed or adapted.
 */
import { describe, it, expect, beforeAll } from "vitest";

import { useHandlerFixtures } from "./test-helpers/use-handler-fixtures.js";

import { Developer } from "./test-helpers/models/developer.js";
import { Person } from "./test-helpers/models/person.js";
import { Post } from "./test-helpers/models/post.js";
import "./test-helpers/models/reader.js";
import "./associations/collection-proxy.js";
import "./association-relation.js";

describe("ReadOnlyTest", () => {
  const { developers, people, posts } = useHandlerFixtures([
    "developers",
    "people",
    "posts",
    "projects", // loaded for cross-join tests; accessor not used directly
    "readers", // join rows for Post#people through-association tests
  ]);

  // Force schema reflection ONCE per worker: trails reflects columns lazily on
  // first query, and methods like `isReadonly()` / `readonlyBang()` need the
  // attribute accessors already present.
  beforeAll(async () => {
    await Promise.all([Developer, Person, Post].map((m) => m.first().catch(() => null)));
  });

  it("cant save readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    // In-memory writes remain allowed; only persistence is blocked.
    expect(() => {
      (dev as Record<string, unknown>).name = "Luscious forbidden fruit.";
    }).not.toThrow();

    await expect(dev.save()).rejects.toThrow("Developer is marked as readonly");
    await expect(dev.saveBang()).rejects.toThrow("Developer is marked as readonly");
    await expect(dev.destroy()).rejects.toThrow("Developer is marked as readonly");
  });

  it("cant touch readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    await expect(dev.touch()).rejects.toThrow("Developer is marked as readonly");
  });

  it("cant touch readonly column", async () => {
    const person = await Person.find(people("michael").id);
    await expect(person.touch("born_at")).rejects.toThrow("born_at is marked as readonly");
  });

  it("cant update column readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    await expect(dev.updateColumn("name", "New name")).rejects.toThrow(
      "Developer is marked as readonly",
    );
  });

  it("cant update columns readonly record", async () => {
    const dev = await Developer.find(developers("david").id);
    expect(dev.isReadonly()).toBe(false);

    dev.readonlyBang();
    expect(dev.isReadonly()).toBe(true);

    await expect(dev.updateColumns({ name: "New name" })).rejects.toThrow(
      "Developer is marked as readonly",
    );
  });

  it("find with readonly option", async () => {
    for (const d of await Developer.all().toArray()) {
      expect(d.isReadonly()).toBe(false);
    }
    expect(Developer.all().isReadonly).toBe(false);
    for (const d of await Developer.all().readonly(false).toArray()) {
      expect(d.isReadonly()).toBe(false);
    }
    for (const d of await Developer.all().readonly(true).toArray()) {
      expect(d.isReadonly()).toBe(true);
    }
    for (const d of await Developer.all().readonly().toArray()) {
      expect(d.isReadonly()).toBe(true);
    }
    expect(Developer.all().readonly().isReadonly).toBe(true);
  });

  it("find with joins option does not imply readonly", async () => {
    for (const d of await Developer.joins("  ").toArray()) {
      expect(d.isReadonly()).toBe(false);
    }
    for (const d of await Developer.joins("  ").readonly(true).toArray()) {
      expect(d.isReadonly()).toBe(true);
    }
    for (const d of await Developer.joins(", projects").toArray()) {
      expect(d.isReadonly()).toBe(false);
    }
    for (const d of await Developer.joins(", projects").readonly(true).toArray()) {
      expect(d.isReadonly()).toBe(true);
    }
  });

  it.skip("has many find readonly", () => {
    // BLOCKED: associations — requires post.comments collection proxy with
    // `.any()` (shorthand for `.toArray().some()`) and `.readonly(true).all()`
    // (chained relation on the collection proxy). The collection proxy in
    // trails does not yet expose a chainable relation accessor that propagates
    // readonly to lazily-loaded records.
    // SCOPE: association collection proxy readonly propagation; ~10–30 LOC in
    // relation/collection-proxy. Affects this test only.
  });

  it("has many with through is not implicitly marked readonly", async () => {
    const post = await Post.find(posts("welcome").id);
    const loaded: Person[] = await (post as any).people.toArray();
    expect(loaded.some((p) => p.isReadonly())).toBe(false);
  });

  it("has many with through is not implicitly marked readonly while finding by id", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person = await (post as any).people.find(people("michael").id);
    expect(person.isReadonly()).toBe(false);
  });

  it("has many with through is not implicitly marked readonly while finding first", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person | null = await (post as any).people.first();
    expect(person?.isReadonly()).toBe(false);
  });

  it("has many with through is not implicitly marked readonly while finding last", async () => {
    const post = await Post.find(posts("welcome").id);
    const person: Person | null = await (post as any).people.last();
    expect(person?.isReadonly()).toBe(false);
  });

  it("readonly scoping", async () => {
    // Post.where("1=1").scoping do ...
    await Post.where("1=1").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(false);
      expect((await Post.readonly(true).find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });

    // Post.joins("   ").scoping do ...
    await Post.joins("   ").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(false);
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });

    // Post.joins(", developers").scoping do ...
    await Post.joins(", developers").scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(false);
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });

    // Post.readonly(true).scoping do ...
    await Post.readonly(true).scoping(async () => {
      expect((await Post.find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly().find(posts("welcome").id)).isReadonly()).toBe(true);
      expect((await Post.readonly(false).find(posts("welcome").id)).isReadonly()).toBe(false);
    });
  });

  it.skip("association collection method missing scoping not readonly", () => {
    // BLOCKED (two gaps):
    // (1) Collection proxy method_missing — developer.projects.allAsMethod().first()
    //     and (Post.find(1) as "project").comments.allAsMethod().first() require the
    //     proxy to surface Project.allAsMethod / Comment.allAsMethod through delegation.
    //     `Project.allAsMethod` exists (project.ts:65); `Comment.allAsMethod` is absent
    //     (comment.ts has `allAsScope` scope but the static `allAsMethod` from
    //     comment.rb:58 is not ported). Delegation path not yet wired in trails.
    // (2) Comment.allAsMethod missing — comment.rb:58 `def self.all_as_method; all; end`
    //     has no TS equivalent; comment.ts only has the `allAsScope` named scope.
    // SCOPE: port Comment.allAsMethod (~3 LOC) + collection proxy delegation (~30 LOC).
  });
});
