/**
 * Mirrors Rails' Association#association_scope memoization
 * (activerecord/lib/active_record/associations/association.rb:300-308):
 *
 *     def association_scope
 *       if klass
 *         @association_scope ||= ...AssociationScope.scope(self)...
 *       end
 *     end
 *
 * Reset on init and on `reload()` via `reset_scope`.
 *
 * Trails-internal scope-cache harness — no 1:1 Rails counterpart. Rides the
 * canonical `Author has_many :posts has_many :comments` fixtures instead of
 * synthetic `cache_*` tables.
 */
import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { findTarget } from "./singular-association.js";
import { registerModel, registerSubclass } from "../index.js";
import { findTarget as findHasManyTarget } from "./has-many-association.js";
import { AssociationScope } from "./association-scope.js";
import { StatementCache } from "../statement-cache.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Member } from "../test-helpers/models/member.js";
import { Club } from "../test-helpers/models/club.js";
import { Membership, CurrentMembership } from "../test-helpers/models/membership.js";

describe("Association scope cache", () => {
  const { authors, posts } = fixtures(["authors", "posts", "comments"]);

  beforeAll(async () => {
    registerModel(Author);
    registerModel(Post);
    registerModel(Comment);
    await Author.loadSchema();
    await Post.loadSchema();
    await Comment.loadSchema();
  });

  // Restore spies even if a test throws — leaked spies on
  // AssociationScope.scope can corrupt sibling tests in this file.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AssociationScope.scope is called once across repeated scope builds (memoized)", async () => {
    // Test the scope cache directly: assert that calling
    // scope() twice on the same instance only invokes
    // AssociationScope.scope once, and that resetScope() forces a
    // rebuild. (Going through loadTarget/reload would be ambiguous —
    // a second loadTarget short-circuits on the already-loaded target
    // and never builds a scope, so the cache wouldn't be exercised.)
    const author = await Author.find(authors("david").id);

    const spy = vi.spyOn(AssociationScope, "scope");
    const assoc = (author as any).association("posts");

    assoc.scope();
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    // Second call hits the cache — no new AssociationScope.scope call.
    assoc.scope();
    expect(spy.mock.calls.length).toBe(afterFirst);

    // resetScope() (called by reload()) clears the cache; next call rebuilds.
    assoc.resetScope();
    assoc.scope();
    expect(spy.mock.calls.length).toBe(afterFirst + 1);
  });

  it("disable_joins associations route through the dedicated DJAS loader, not Association.scope()", async () => {
    // Loaders detect `disable_joins: true` early and route to
    // `_loadThroughViaDisableJoinsScope` (which calls DJAS directly,
    // returning a deferred-chain DJAR). They never call
    // `Association.scope()` for disable-joins reflections,
    // so the JOIN-based cache contract doesn't apply — DJAS owns
    // its own per-call construction matching Rails' per-call DJAS
    // (association.rb:107-117). `Author#noJoinsComments` is the
    // canonical `has_many through, disable_joins: true` reflection.
    const author = await Author.find(authors("david").id);

    const spy = vi.spyOn(AssociationScope, "scope");
    const reflection = (Author as any)._reflectOnAssociation("noJoinsComments");
    const records = await findHasManyTarget(author, "noJoinsComments", reflection.options);
    expect(records.length).toBeGreaterThan(0);
    // JOIN-based AssociationScope was never invoked — DJAS handled it.
    expect(spy).not.toHaveBeenCalled();
  });

  it("loader paths hit the cache too (not just explicit record.association(name) calls)", async () => {
    // CollectionProxy / AssociationProxy call loadHasMany / loadHasOne
    // directly without first calling `record.association(name)`. The
    // cache must still apply — otherwise the common proxy path
    // (e.g. `await blog.posts`) would rebuild the scope every time.
    // `_builtAssociationScope` lazily materializes the Association
    // instance to cover this case.
    const author = await Author.find(authors("david").id);

    const spy = vi.spyOn(AssociationScope, "scope");
    const opts = { className: "Post", foreignKey: "author_id" };

    // First loader call populates the Association-instance cache.
    await findHasManyTarget(author, "posts", opts);
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    // Second loader call — different caches would rebuild the scope.
    // With our cache, AssociationScope.scope count is unchanged.
    await findHasManyTarget(author, "posts", opts);
    expect(spy.mock.calls.length).toBe(afterFirst);
  });

  it("singular belongs_to loads compile the statement once and reuse it across owners", async () => {
    // Rails' Association#find_target reuses reflection.association_scope_cache
    // (a StatementCache) across loads instead of recompiling the scope SQL.
    // The first load of any owner compiles (StatementCache.create); later
    // loads — including for a different owner — only re-bind values.
    const opts = { className: "Author", foreignKey: "author_id" };

    // `welcome` belongs to david, `misc_by_bob` belongs to bob — distinct owners.
    const p1 = await Post.find(posts("welcome").id);
    const p2 = await Post.find(posts("misc_by_bob").id);

    const spy = vi.spyOn(StatementCache, "create");

    const r1 = await findTarget(p1, "author", opts, "belongsTo");
    expect((r1 as any)?.id).toBe(authors("david").id);
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    // Second owner's load reuses the cached statement — no recompile.
    const r2 = await findTarget(p2, "author", opts, "belongsTo");
    expect((r2 as any)?.id).toBe(authors("bob").id);
    expect(spy.mock.calls.length).toBe(afterFirst);
  });

  it("different owners get independent caches", async () => {
    const a1 = await Author.find(authors("david").id);
    const a2 = await Author.find(authors("mary").id);
    const assoc1 = (a1 as any).association("posts");
    const assoc2 = (a2 as any).association("posts");
    await assoc1.loadTarget();
    await assoc2.loadTarget();
    // Cache fields are per-instance; loading one doesn't pollute the other.
    expect(assoc1._cachedScope).toBeDefined();
    expect(assoc2._cachedScope).toBeDefined();
    expect(assoc1._cachedScope).not.toBe(assoc2._cachedScope);
  });
});

describe("Association scope cache — through singular loads", () => {
  const { members, clubs } = fixtures(["memberTypes", "members", "clubs", "memberships"]);

  beforeAll(async () => {
    registerModel(Member);
    registerModel(Club);
    Membership.inheritanceColumn = "type";
    registerModel(Membership);
    registerModel(CurrentMembership);
    registerSubclass(CurrentMembership);
    await Member.loadSchema();
    await Club.loadSchema();
    await Membership.loadSchema();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has_one :through singular loads compile once, reuse across owners, and filter the join model's STI type", async () => {
    // `Member has_one :club, through: :current_membership` — the join model
    // `CurrentMembership` is an STI subclass over an *enum* `type` column.
    // groucho holds BOTH a CurrentMembership → boring_club AND a plain
    // Membership → moustache_club, so a correct load must carry the join
    // model's `memberships.type = <CurrentMembership>` condition (folded in via
    // `ThroughAssociation#target_scope`) — otherwise it returns the wrong club.
    const groucho = await Member.find(members("groucho").id);
    const blarpy = await Member.find(members("blarpy_winkup").id);

    const spy = vi.spyOn(StatementCache, "create");

    const c1 = await findTarget(groucho, "club", { through: "currentMembership" }, "hasOne");
    expect((c1 as any)?.id).toBe(clubs("boring_club").id);
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    // Second owner's load reuses the compiled statement — no recompile — and
    // still resolves through its OWN current membership.
    const c2 = await findTarget(blarpy, "club", { through: "currentMembership" }, "hasOne");
    expect((c2 as any)?.id).toBe(clubs("outrageous_club").id);
    expect(spy.mock.calls.length).toBe(afterFirst);
  });
});
