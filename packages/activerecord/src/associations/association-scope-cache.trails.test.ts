import { describe, it, expect, beforeAll, afterEach, vi } from "vitest";
import { Base, registerModel, registerSubclass } from "../index.js";
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

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AssociationScope.scope is called once across repeated scope builds (memoized)", async () => {
    const author = await Author.find(authors("david").id);

    const spy = vi.spyOn(AssociationScope, "scope");
    const assoc = (author as any).association("posts");

    assoc.scope();
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    assoc.scope();
    expect(spy.mock.calls.length).toBe(afterFirst);

    assoc.resetScope();
    assoc.scope();
    expect(spy.mock.calls.length).toBe(afterFirst + 1);
  });

  it("disable_joins associations route through the dedicated DJAS loader, not Association.scope()", async () => {
    const author = await Author.find(authors("david").id);

    const spy = vi.spyOn(AssociationScope, "scope");
    const reflection = (Author as any)._reflectOnAssociation("noJoinsComments");
    const records = (await author.association("noJoinsComments").loadTarget()) as Base[];
    expect(records.length).toBeGreaterThan(0);
    expect(spy).not.toHaveBeenCalled();
  });

  it("loader paths hit the cache too (not just explicit record.association(name) calls)", async () => {
    const author = await Author.find(authors("david").id);

    const spy = vi.spyOn(AssociationScope, "scope");

    await author.association("posts").loadTarget();
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBeGreaterThan(0);

    await author.association("posts").loadTarget();
    expect(spy.mock.calls.length).toBe(afterFirst);
  });

  it("singular belongs_to loads compile the statement once and reuse it across owners", async () => {
    const p1 = await Post.find(posts("welcome").id);
    const p2 = await Post.find(posts("misc_by_bob").id);

    const spy = vi.spyOn(StatementCache, "create");

    const r1 = await (p1 as any).author;
    expect(r1?.id).toBe(authors("david").id);
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    const r2 = await (p2 as any).author;
    expect(r2?.id).toBe(authors("bob").id);
    expect(spy.mock.calls.length).toBe(afterFirst);
  });

  it("different owners get independent caches", async () => {
    const a1 = await Author.find(authors("david").id);
    const a2 = await Author.find(authors("mary").id);
    const assoc1 = (a1 as any).association("posts");
    const assoc2 = (a2 as any).association("posts");
    await assoc1.loadTarget();
    await assoc2.loadTarget();
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
    const groucho = await Member.find(members("groucho").id);
    const blarpy = await Member.find(members("blarpy_winkup").id);

    const spy = vi.spyOn(StatementCache, "create");

    const c1 = await (groucho as any).club;
    expect(c1?.id).toBe(clubs("boring_club").id);
    const afterFirst = spy.mock.calls.length;
    expect(afterFirst).toBe(1);

    const c2 = await (blarpy as any).club;
    expect(c2?.id).toBe(clubs("outrageous_club").id);
    expect(spy.mock.calls.length).toBe(afterFirst);
  });
});
