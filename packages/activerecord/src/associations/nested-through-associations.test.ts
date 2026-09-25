import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { CategoryPost, Post } from "../test-helpers/models/post.js";
import { Tag, OrderedTag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Member } from "../test-helpers/models/member.js";
import { MemberDetail } from "../test-helpers/models/member-detail.js";
import { MemberType } from "../test-helpers/models/member-type.js";
import { Membership } from "../test-helpers/models/membership.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Category } from "../test-helpers/models/category.js";
import { Club } from "../test-helpers/models/club.js";
import { Organization } from "../test-helpers/models/organization.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Comment, SpecialComment, SubSpecialComment } from "../test-helpers/models/comment.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Subscriber } from "../test-helpers/models/subscriber.js";
import { Subscription } from "../test-helpers/models/subscription.js";
import { Book } from "../test-helpers/models/book.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Hotel } from "../test-helpers/models/hotel.js";
import { Department } from "../test-helpers/models/department.js";
import { Chef } from "../test-helpers/models/chef.js";
import { CakeDesigner } from "../test-helpers/models/cake-designer.js";
import { DrinkDesigner } from "../test-helpers/models/drink-designer.js";
import { Person } from "../test-helpers/models/person.js";
import { Reference } from "../test-helpers/models/reference.js";
import { Job } from "../test-helpers/models/job.js";
import { Reader } from "../test-helpers/models/reader.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import { assert, assertNot, assertEmpty, assertNotEmpty } from "@blazetrails/activesupport";

async function withAutomaticScopeInversing(
  reflections: any[],
  fn: () => Promise<void> | void,
): Promise<void> {
  const old = reflections.map((r) => r.klass.automaticScopeInversing);

  for (const r of reflections) {
    r.klass.automaticScopeInversing = true;
    delete r._inverseNameCache;
    delete r._inverseOfCache;
  }
  try {
    await fn();
  } finally {
    for (const [i, r] of reflections.entries()) {
      r.klass.automaticScopeInversing = old[i];
      delete r._inverseNameCache;
      delete r._inverseOfCache;
    }
  }
}

async function assertIncludesAndJoinsEqual(
  query: any,
  expected: any[],
  association: string,
): Promise<void> {
  query = query.order(":id");

  let actual!: any[];
  await assertQueriesCount(1, false, async () => {
    actual = uniqRecords(await query.joins(association).toArray());
  });
  expect(actual.map(recordKey)).toEqual(expected.map(recordKey));

  await assertQueriesCount(1, false, async () => {
    actual = uniqRecords(await query.includes(association).toArray());
  });
  expect(actual.map(recordKey)).toEqual(expected.map(recordKey));
}

function recordKey(record: any): string {
  return `${record.constructor.name}#${record.id}`;
}

function uniqRecords(records: any[]): any[] {
  const seen = new Set<string>();
  const result: any[] = [];
  for (const record of records) {
    const key = recordKey(record);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(record);
    }
  }
  return result;
}

registerModel(Author);
registerModel(Post);
registerModel(CategoryPost);
registerModel(Tag);
registerModel(OrderedTag);
registerModel(Tagging);
registerModel(Member);
registerModel(MemberDetail);
registerModel(MemberType);
registerModel(Membership);
registerModel(Categorization);
registerModel(Category);
registerModel(Club);
registerModel(Organization);
registerModel(Essay);
registerModel(Comment);
registerModel(SpecialComment);
registerModel(SubSpecialComment);
registerModel(Rating);
registerModel(Subscriber);
registerModel(Subscription);
registerModel(Book);
registerModel(Sponsor);
registerModel(Hotel);
registerModel(Department);
registerModel(Chef);
registerModel(CakeDesigner);
registerModel(DrinkDesigner);
registerModel(Person);
registerModel(Reference);
registerModel(Job);
registerModel(Reader);

describe("NestedThroughAssociationsTest", () => {
  const {
    authors,
    tags,
    taggings,
    subscribers,
    memberTypes,
    members,
    memberDetails,
    sponsors,
    categorizations,
    categories,
    clubs,
    organizations,
    comments,
    ratings,
    posts,
    people,
    references,
    jobs,
  } = fixtures([
    "authors",
    "authorAddresses",
    "books",
    "posts",
    "subscriptions",
    "subscribers",
    "tags",
    "taggings",
    "people",
    "readers",
    "references",
    "jobs",
    "ratings",
    "comments",
    "members",
    "memberDetails",
    "memberTypes",
    "sponsors",
    "clubs",
    "organizations",
    "categories",
    "categoriesPosts",
    "categorizations",
    "memberships",
    "essays",
  ]);

  it("has many through has many with has many through source reflection", async () => {
    const general = tags("general");
    const david = authors("david");
    const davidTags = await david.tags;
    expect(davidTags.map((t) => t.id)).toEqual([general.id, general.id]);
  });

  it("has many through has many with has many through source reflection preload", async () => {
    let author!: Author;
    await assertQueriesCount(5, false, async () => {
      [author] = await Author.includes(":tags").order("authors.id").limit(1);
    });
    const general = tags("general");

    await assertNoQueries(false, async () => {
      const authorTags = await author.tags;
      expect(authorTags.map((t) => t.id)).toEqual([general.id, general.id]);
    });

    const tagReflection = (Tagging as any).reflectOnAssociation("tag");
    const taggingsReflection = (Tag as any).reflectOnAssociation("taggings");

    assert(tagReflection.scope);
    assertNot(taggingsReflection.scope);

    await withAutomaticScopeInversing([tagReflection, taggingsReflection], async () => {
      await assertQueriesCount(4, false, async () => {
        await Author.includes(":tags").order("authors.id").limit(1);
      });
    });
  });

  it("has many through has many with has many through source reflection preload via joins", async () => {
    const david = authors("david");
    await assertIncludesAndJoinsEqual(
      Author.where({ "tags.id": tags("general").id }),
      [david],
      ":tags",
    );

    const empty = await Author.joins(":tags").where({ "taggings.taggable_type": "FakeModel" });
    assertEmpty(empty);
  });

  it("has many through has many through with has many source reflection", async () => {
    const luke = subscribers("first");
    const davidSub = subscribers("second");
    const david = authors("david");
    const result = await david.subscribers.order("subscribers.nick");
    expect(result.map((s: any) => s.nick)).toEqual(
      [luke, davidSub, davidSub].map((s: any) => s.nick),
    );
  });

  it("has many through has many through with has many source reflection preload", async () => {
    const luke = subscribers("first");
    const davidSub = subscribers("second");
    let author!: Author;
    await assertQueriesCount(4, false, async () => {
      [author] = await Author.includes(":subscribers").order("authors.id").limit(1);
    });
    await assertNoQueries(false, async () => {
      const preloaded = (await author.subscribers)
        .slice()
        .sort((a: any, b: any) => a.nick.localeCompare(b.nick));
      const expected = [luke, davidSub, davidSub]
        .slice()
        .sort((a: any, b: any) => a.nick.localeCompare(b.nick));
      expect(preloaded.map(recordKey)).toEqual(expected.map(recordKey));
    });
  });

  it("has many through has many through with has many source reflection preload via joins", async () => {
    const david = authors("david");
    await assertIncludesAndJoinsEqual(
      Author.where({ "subscribers.nick": "alterself" }),
      [david],
      ":subscribers",
    );
  });

  it("has many through has one with has one through source reflection", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    const result = await groucho.nestedMemberTypes;
    expect(result.map((t) => t.id)).toEqual([founding.id]);
  });

  it("has many through has one with has one through source reflection preload", async () => {
    let member!: Member;
    await assertQueriesCount(4, false, async () => {
      [member] = await Member.includes(":nestedMemberTypes").order("members.id").limit(1);
    });
    const founding = memberTypes("founding");
    await assertNoQueries(false, async () => {
      const preloaded = await member.nestedMemberTypes;
      expect(preloaded.map(recordKey)).toEqual([founding].map(recordKey));
    });
  });

  it("has many through has one with has one through source reflection preload via joins", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    await assertIncludesAndJoinsEqual(
      Member.where({ "member_types.id": founding.id }),
      [groucho],
      ":nestedMemberTypes",
    );
  });

  it("has many through has one through with has one source reflection", async () => {
    const mustache = sponsors("moustache_club_sponsor_for_groucho");
    const groucho = members("groucho");
    const result = await groucho.nestedSponsors;
    expect(result.map((s) => s.id)).toEqual([mustache.id]);
  });

  it("has many through has one through with has one source reflection preload", async () => {
    let member!: Member;
    await assertQueriesCount(4, false, async () => {
      [member] = await Member.includes(":nestedSponsors").order("members.id").limit(1);
    });
    const mustache = sponsors("moustache_club_sponsor_for_groucho");
    await assertNoQueries(false, async () => {
      const preloaded = await member.nestedSponsors;
      expect(preloaded.map(recordKey)).toEqual([mustache].map(recordKey));
    });
  });

  it("has many through has one through with has one source reflection preload via joins", async () => {
    const mustache = sponsors("moustache_club_sponsor_for_groucho");
    const groucho = members("groucho");
    await assertIncludesAndJoinsEqual(
      Member.where({ "sponsors.id": mustache.id }),
      [groucho],
      ":nestedSponsors",
    );
  });

  it("has many through has one with has many through source reflection", async () => {
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");
    const groucho = members("groucho");
    const result = await groucho.organizationMemberDetails;
    const sortedIds = result.map((d) => d.id).sort((a: any, b: any) => Number(a) - Number(b));
    expect(sortedIds).toEqual(
      [grouchoDetails.id, otherDetails.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("has many through has one with has many through source reflection preload", async () => {
    let member!: Member;
    await assertQueriesCount(4, false, async () => {
      [member] = await Member.includes(":organizationMemberDetails").order("members.id").limit(1);
    });
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");

    await assertNoQueries(false, async () => {
      const preloaded = (await member.organizationMemberDetails)
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id));
      expect(preloaded.map(recordKey)).toEqual([grouchoDetails, otherDetails].map(recordKey));
    });
  });

  it("has many through has one with has many through source reflection preload via joins", async () => {
    const grouchoDetails = memberDetails("groucho");
    const groucho = members("groucho");
    const someOtherGuy = members("some_other_guy");
    await assertIncludesAndJoinsEqual(
      Member.where({ "member_details.id": grouchoDetails.id }).order("member_details.id"),
      [groucho, someOtherGuy],
      ":organizationMemberDetails",
    );

    const empty = await Member.joins(":organizationMemberDetails").where({
      "member_details.id": 9,
    });
    assertEmpty(empty);
  });

  it("has many through has one through with has many source reflection", async () => {
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");
    const groucho = members("groucho");
    const result = await groucho.organizationMemberDetails_2;
    const sortedIds = result.map((d) => d.id).sort((a: any, b: any) => Number(a) - Number(b));
    expect(sortedIds).toEqual(
      [grouchoDetails.id, otherDetails.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("has many through has one through with has many source reflection preload", async () => {
    let member!: Member;
    await assertQueriesCount(4, false, async () => {
      [member] = await Member.includes(":organizationMemberDetails_2").order("members.id").limit(1);
    });
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");

    await assertNoQueries(false, async () => {
      const preloaded = (await member.organizationMemberDetails_2)
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id));
      expect(preloaded.map(recordKey)).toEqual([grouchoDetails, otherDetails].map(recordKey));
    });
  });

  it("has many through has one through with has many source reflection preload via joins", async () => {
    const grouchoDetails = memberDetails("groucho");
    const groucho = members("groucho");
    const someOtherGuy = members("some_other_guy");
    await assertIncludesAndJoinsEqual(
      Member.where({ "member_details.id": grouchoDetails.id }).order("member_details.id"),
      [groucho, someOtherGuy],
      ":organizationMemberDetails_2",
    );

    const empty = await Member.joins(":organizationMemberDetails_2").where({
      "member_details.id": 9,
    });
    assertEmpty(empty);
  });

  it("has many through has many with has and belongs to many source reflection", async () => {
    const general = categories("general");
    const cooking = categories("cooking");
    const bob = authors("bob");
    const result = await bob.postCategories;
    const sortedIds = result.map((c) => c.id).sort((a: any, b: any) => Number(a) - Number(b));
    expect(sortedIds).toEqual(
      [general.id, cooking.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("has many through has many with has and belongs to many source reflection preload", async () => {
    let author!: Author;
    await assertQueriesCount(4, false, async () => {
      [, , author] = await Author.includes(":postCategories").order("authors.id");
    });
    const general = categories("general");
    const cooking = categories("cooking");

    await assertNoQueries(false, async () => {
      const preloaded = (await author.postCategories)
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id));
      expect(preloaded.map(recordKey)).toEqual([general, cooking].map(recordKey));
    });
  });

  it("has many through has many with has and belongs to many source reflection preload via joins", async () => {
    await Author.joins(":postCategories").limit(1);

    const cooking = categories("cooking");
    const bob = authors("bob");
    await assertIncludesAndJoinsEqual(
      Author.where({ "categories.id": cooking.id }),
      [bob],
      ":postCategories",
    );
  });

  it("has many through has and belongs to many with has many source reflection", async () => {
    const greetings = comments("greetings");
    const moreGreetings = comments("more_greetings");
    const result = await categories("technology").postComments.order("comments.id");
    expect(result.map((c: any) => c.id)).toEqual([greetings.id, moreGreetings.id]);
  });

  it("has many through has and belongs to many with has many source reflection preload", async () => {
    await Category.includes(":postComments").order("categories.id");

    let category!: Category;
    await assertQueriesCount(4, false, async () => {
      [, category] = await Category.includes(":postComments").order("categories.id");
    });
    const greetings = comments("greetings");
    const moreGreetings = comments("more_greetings");

    await assertNoQueries(false, async () => {
      const preloaded = (await category.postComments)
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id));
      expect(preloaded.map(recordKey)).toEqual([greetings, moreGreetings].map(recordKey));
    });
  });

  it("has many through has and belongs to many with has many source reflection preload via joins", async () => {
    await Category.joins(":postComments").limit(1);

    const moreGreetings = comments("more_greetings");
    const general = categories("general");
    const technology = categories("technology");
    await assertIncludesAndJoinsEqual(
      Category.where({ "comments.id": moreGreetings.id }).order("categories.id"),
      [general, technology],
      ":postComments",
    );
  });

  it("has many through has many with has many through habtm source reflection", async () => {
    const greetings = comments("greetings");
    const moreGreetings = comments("more_greetings");
    const result = await authors("bob").categoryPostComments.order("comments.id");
    expect(result.map((c: any) => c.id)).toEqual([greetings.id, moreGreetings.id]);
  });

  it("has many through has many with has many through habtm source reflection preload", async () => {
    let author!: Author;
    await assertQueriesCount(6, false, async () => {
      [, , author] = await Author.includes(":categoryPostComments").order("authors.id");
    });
    const greetings = comments("greetings");
    const moreGreetings = comments("more_greetings");

    await assertNoQueries(false, async () => {
      const preloaded = (await author.categoryPostComments)
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id));
      expect(preloaded.map(recordKey)).toEqual([greetings, moreGreetings].map(recordKey));
    });
  });

  it("has many through has many with has many through habtm source reflection preload via joins", async () => {
    await Author.joins(":categoryPostComments").limit(1);

    const david = authors("david");
    const mary = authors("mary");
    await assertIncludesAndJoinsEqual(
      Author.where({ "comments.id": comments("does_it_hurt").id }).order("authors.id"),
      [david, mary],
      ":categoryPostComments",
    );
  });

  it("has many through has many through with belongs to source reflection", async () => {
    const general = tags("general");
    const david = authors("david");
    const result = await david.taggingTags;
    expect(result.map((t: any) => t.id)).toEqual([general.id, general.id]);
  });

  it("has many through has many through with belongs to source reflection preload", async () => {
    let author!: Author;
    await assertQueriesCount(5, false, async () => {
      [author] = await Author.includes(":taggingTags").order("authors.id").limit(1);
    });
    const general = tags("general");

    await assertNoQueries(false, async () => {
      const preloaded = await author.taggingTags;
      expect(preloaded.map(recordKey)).toEqual([general, general].map(recordKey));
    });

    const tagReflection = (Tagging as any).reflectOnAssociation("tag");
    const taggingsReflection = (Tag as any).reflectOnAssociation("taggings");

    assert(tagReflection.scope);
    assertNot(taggingsReflection.scope);

    await withAutomaticScopeInversing([tagReflection, taggingsReflection], async () => {
      await assertQueriesCount(4, false, async () => {
        await Author.includes(":taggingTags").order("authors.id").limit(1);
      });
    });
  });

  it("has many through has many through with belongs to source reflection preload via joins", async () => {
    const general = tags("general");
    const david = authors("david");
    await assertIncludesAndJoinsEqual(
      Author.where({ "tags.id": general.id }),
      [david],
      ":taggingTags",
    );
  });

  it("has many through belongs to with has many through source reflection", async () => {
    const welcomeGeneral = taggings("welcome_general");
    const thinkingGeneral = taggings("thinking_general");
    const davidWelcomeGeneral = categorizations("david_welcome_general");
    const result = await davidWelcomeGeneral.postTaggings;
    const sortedIds = result.map((t) => t.id).sort((a: any, b: any) => Number(a) - Number(b));
    expect(sortedIds).toEqual(
      [welcomeGeneral.id, thinkingGeneral.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );
  });

  it("has many through belongs to with has many through source reflection preload", async () => {
    let categorization!: Categorization;
    await assertQueriesCount(4, false, async () => {
      [categorization] = await Categorization.includes(":postTaggings")
        .order("categorizations.id")
        .limit(1);
    });
    const welcomeGeneral = taggings("welcome_general");
    const thinkingGeneral = taggings("thinking_general");

    await assertNoQueries(false, async () => {
      const preloaded = (await categorization.postTaggings)
        .slice()
        .sort((a: any, b: any) => Number(a.id) - Number(b.id));
      expect(preloaded.map(recordKey)).toEqual([welcomeGeneral, thinkingGeneral].map(recordKey));
    });
  });

  it("has many through belongs to with has many through source reflection preload via joins", async () => {
    const welcomeGeneral = taggings("welcome_general");
    const davidWelcomeGeneral = categorizations("david_welcome_general");
    await assertIncludesAndJoinsEqual(
      Categorization.where({ "taggings.id": welcomeGeneral.id }).order("taggings.id"),
      [davidWelcomeGeneral],
      ":postTaggings",
    );
  });

  it("has one through has one with has one through source reflection", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    const result = await groucho.nestedMemberType;
    expect(result?.id).toBe(founding.id);
  });

  it("has one through has one with has one through source reflection preload", async () => {
    let member!: Member;
    await assertQueriesCount(4, false, async () => {
      [member] = await Member.includes(":nestedMemberType").order("members.id").limit(1);
    });
    const founding = memberTypes("founding");

    await assertNoQueries(false, async () => {
      const preloaded = await member.nestedMemberType;
      expect(recordKey(preloaded)).toEqual(recordKey(founding));
    });
  });

  it("has one through has one with has one through source reflection preload via joins", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    await assertIncludesAndJoinsEqual(
      Member.where({ "member_types.id": founding.id }),
      [groucho],
      ":nestedMemberType",
    );
  });

  it("has one through has one through with belongs to source reflection", async () => {
    const general = categories("general");
    const groucho = members("groucho");
    const result = await groucho.clubCategory;
    expect(result?.id).toBe(general.id);
  });

  it("joins and includes from through models not included in association", async () => {
    const general = categories("general");
    const groucho = members("groucho");
    for (const q of ["includes", "preload", "joins", "eagerLoad"] as const) {
      const prevDefaultScopes = ((Club as any).defaultScopes ?? []).slice();
      (Club as any).defaultScopes = [];
      (Club as any).defaultScope((rel: any) => rel[q]("category"));
      try {
        const result = await groucho.clubCategory;
        expect(result?.id).toBe(general.id);
      } finally {
        (Club as any).defaultScopes = prevDefaultScopes;
      }
    }
  });

  it("has one through has one through with belongs to source reflection preload", async () => {
    let member!: Member;
    await assertQueriesCount(4, false, async () => {
      [member] = await Member.includes(":clubCategory").order("members.id").limit(1);
    });
    const general = categories("general");

    await assertNoQueries(false, async () => {
      const preloaded = await member.clubCategory;
      expect(recordKey(preloaded)).toEqual(recordKey(general));
    });
  });

  it("has one through has one through with belongs to source reflection preload via joins", async () => {
    const technology = categories("technology");
    const blarpyWinkup = members("blarpy_winkup");
    await assertIncludesAndJoinsEqual(
      Member.where({ "categories.id": technology.id }),
      [blarpyWinkup],
      ":clubCategory",
    );
  });

  it("distinct has many through a has many through association on source reflection", async () => {
    const david = authors("david");
    const general = tags("general");
    const result = await david.distinctTags;
    expect(result.map((t) => t.id)).toEqual([general.id]);
  });

  it("distinct has many through a has many through association on through reflection", async () => {
    const david = authors("david");
    const luke = subscribers("first");
    const davidSub = subscribers("second");
    const result = await david.distinctSubscribers;
    const nicksSorted = result.map((s: any) => s.nick).sort();
    expect(nicksSorted).toEqual([luke, davidSub].map((s: any) => s.nick).sort());
  });

  it("nested has many through with a table referenced multiple times", async () => {
    const bob = authors("bob");
    const miscByBob = posts("misc_by_bob");
    const miscByMary = posts("misc_by_mary");
    const otherByBob = posts("other_by_bob");
    const otherByMary = posts("other_by_mary");

    const similarPosts = await bob.similarPosts;
    const sortedIds = similarPosts.map((p) => p.id).sort((a: any, b: any) => Number(a) - Number(b));
    expect(sortedIds).toEqual(
      [miscByBob.id, miscByMary.id, otherByBob.id, otherByMary.id].sort(
        (a: any, b: any) => Number(a) - Number(b),
      ),
    );

    const mary = authors("mary");
    const authorsResult = await Author.joins(":similarPosts")
      .where({ "posts.id": miscByBob.id })
      .distinct();
    const authorIds = authorsResult
      .map((a) => a.id)
      .sort((a: any, b: any) => Number(a) - Number(b));
    expect(authorIds).toEqual([mary.id, bob.id].sort((a: any, b: any) => Number(a) - Number(b)));

    const empty1 = await Author.joins(":similarPosts").where({
      "taggings.taggable_type": "FakeModel",
    });
    assertEmpty(empty1);
    const empty2 = await Author.joins(":similarPosts").where({
      "taggings_authors_join.taggable_type": "FakeModel",
    });
    assertEmpty(empty2);
  });

  it("nested has many through with scope on polymorphic reflection", async () => {
    const miscByBob = posts("misc_by_bob");
    const bob = authors("bob");
    const mary = authors("mary");
    const result = await Author.joins(":orderedPosts")
      .where({ "posts.id": miscByBob.id })
      .distinct();
    const ids = result.map((a) => a.id).sort((a: any, b: any) => Number(a) - Number(b));
    expect(ids).toEqual([mary.id, bob.id].sort((a: any, b: any) => Number(a) - Number(b)));
  });

  it("has many through with foreign key option on through reflection", async () => {
    const david = people("david");
    const welcome = posts("welcome");
    const authorless = posts("authorless");
    const davidUnicyclist = references("david_unicyclist");
    const davidAuthor = authors("david");

    const agentsPosts = await david.agentsPosts.order("posts.id");
    expect(agentsPosts.map((p) => p.id)).toEqual([welcome.id, authorless.id]);

    const agentsPostsAuthors = await davidUnicyclist.agentsPostsAuthors;
    expect(agentsPostsAuthors.map((a) => a.id)).toEqual([davidAuthor.id]);

    const refsResult = await Reference.joins(":agentsPostsAuthors").where({
      "authors.id": davidAuthor.id,
    });
    expect(refsResult.map((r) => r.id)).toEqual([davidUnicyclist.id]);
  });

  it("has many through with foreign key option on source reflection", async () => {
    const unicyclist = jobs("unicyclist");
    const michael = people("michael");
    const susan = people("susan");

    const agents = await unicyclist.agents.order("people.id");
    expect(agents.map((p) => p.id)).toEqual([michael.id, susan.id]);

    const jobsResult = await Job.joins(":agents");
    expect(jobsResult.map((j) => j.id)).toEqual([unicyclist.id, unicyclist.id]);
  });

  it("has many through with sti on through reflection", async () => {
    const stiComments = posts("sti_comments");
    const specialRating = ratings("special_comment_rating");
    const subSpecialRating = ratings("sub_special_comment_rating");

    const ratingsResult = await stiComments.specialCommentsRatings;
    const sortedIds = ratingsResult
      .map((r) => r.id)
      .sort((a: any, b: any) => Number(a) - Number(b));
    expect(sortedIds).toEqual(
      [specialRating.id, subSpecialRating.id].sort((a: any, b: any) => Number(a) - Number(b)),
    );

    const scope = Post.joins(":specialCommentsRatings").where({ id: stiComments.id });
    assertEmpty(await scope.where({ "comments.type": "Comment" }));
    assertNotEmpty(await scope.where({ "comments.type": "SpecialComment" }));
    assertNotEmpty(await scope.where({ "comments.type": "SubSpecialComment" }));
  });

  it("has many through with sti on nested through reflection", async () => {
    const stiComments = posts("sti_comments");
    const specialRatingTagging = taggings("special_comment_rating");

    const taggingsResult = await stiComments.specialCommentsRatingsTaggings;
    expect(taggingsResult.map((t) => t.id)).toEqual([specialRatingTagging.id]);

    const scope = Post.joins(":specialCommentsRatingsTaggings").where({ id: stiComments.id });
    assertEmpty(await scope.where({ "comments.type": "Comment" }));
    assertNotEmpty(await scope.where({ "comments.type": "SpecialComment" }));
  });

  it("nested has many through writers should raise error", async () => {
    const david = authors("david");
    const subscriber = subscribers("first");
    const readonly = /goes through more than one other association/;
    const association = david.association("subscribers") as any;
    await expect(association.writer([subscriber])).rejects.toThrow(readonly);
    await expect(association.idsWriter([subscriber.id])).rejects.toThrow(readonly);
    await expect((david.subscribers as any).push(subscriber)).rejects.toThrow(readonly);
    await expect((david.subscribers as any).delete(subscriber)).rejects.toThrow(readonly);
    await expect((david.subscribers as any).clear()).rejects.toThrow(readonly);
    expect(() => (david.subscribers as any).build()).toThrow(readonly);
    await expect((david.subscribers as any).create()).rejects.toThrow(readonly);
  });

  it("nested has one through writers should raise error", async () => {
    const groucho = members("groucho");
    const founding = memberTypes("founding");
    const proxy = groucho.association("nestedMemberType") as any;
    expect(() => proxy.writer(founding)).toThrow(/goes through more than one other association/);
  });

  it("nested has many through with conditions on through associations", async () => {
    const bob = authors("bob");
    const blue = tags("blue");
    const result = await bob.miscPostFirstBlueTags;
    expect(result.map((t) => t.id)).toEqual([blue.id]);
  });

  it("nested has many through with conditions on through associations preload", async () => {
    assertEmpty(await Author.where({ "tags.id": 100 }).joins(":miscPostFirstBlueTags"));

    let author!: Author;
    await assertQueriesCount(2, false, async () => {
      [, , author] = await Author.includes(":miscPostFirstBlueTags").order("authors.id");
    });
    const blue = tags("blue");

    await assertNoQueries(false, async () => {
      const preloaded = await author.miscPostFirstBlueTags;
      expect(preloaded.map(recordKey)).toEqual([blue].map(recordKey));
    });
  });

  it("nested has many through with conditions on through associations preload via joins", async () => {
    const bob = authors("bob");
    await assertIncludesAndJoinsEqual(
      Author.where("tags.id = tags.id").references(":tags"),
      [bob],
      ":miscPostFirstBlueTags",
    );
  });

  it("nested has many through with conditions on source associations", async () => {
    const bob = authors("bob");
    const blue = tags("blue");
    const result = await bob.miscPostFirstBlueTags_2;
    expect(result.map((t) => t.id)).toEqual([blue.id]);
  });

  it("nested has many through with conditions on source associations preload", async () => {
    const blue = tags("blue");
    let author!: Author;
    await assertQueriesCount(2, false, async () => {
      [, , author] = await Author.includes(":miscPostFirstBlueTags_2").order("authors.id");
    });
    await assertNoQueries(false, async () => {
      const preloaded = await author.miscPostFirstBlueTags_2;
      expect(preloaded.map((t) => t.id)).toEqual([blue.id]);
    });
  });

  it("through association preload doesnt reset source association if already preloaded", async () => {
    const blue = tags("blue");
    const [, , author] = await Author.preload({
      ":posts": ":firstBlueTags_2",
      ":miscPostFirstBlueTags_2": {},
    }).order("authors.id");
    await assertNoQueries(false, async () => {
      const firstPost = (await author.posts)[0];
      const preloaded = await firstPost.firstBlueTags_2;
      expect(preloaded.map((t) => t.id)).toEqual([blue.id]);
    });
  });

  it("nested has many through with conditions on source associations preload via joins", async () => {
    const bob = authors("bob");
    await assertIncludesAndJoinsEqual(
      Author.where("tags.id = tags.id").references(":tags"),
      [bob],
      ":miscPostFirstBlueTags_2",
    );
  });

  it("nested has many through with foreign key option on the source reflection through reflection", async () => {
    const nsa = organizations("nsa");
    const general = categories("general");

    const essayCategories = await nsa.authorEssayCategories;
    expect(essayCategories.map((c) => c.id)).toEqual([general.id]);

    const orgsResult = await Organization.joins(":authorEssayCategories").where({
      "categories.id": general.id,
    });
    expect(orgsResult.map((o) => o.id)).toEqual([nsa.id]);

    const ownedEssayCategory = await nsa.authorOwnedEssayCategory;
    expect(ownedEssayCategory?.id).toBe(general.id);

    const orgsResult2 = await Organization.joins(":authorOwnedEssayCategory").where({
      "categories.id": general.id,
    });
    expect(orgsResult2.map((o) => o.id)).toEqual([nsa.id]);
  });

  it("nested has many through should not be autosaved", async () => {
    const david = authors("david");
    const c = new Categorization();
    await (c as any).association("author").writer(david);
    assertNotEmpty(await (c as any).postTaggings.toArray());
    await c.save();
    assertNotEmpty(await (c as any).postTaggings.toArray());
  });

  it("polymorphic has many through when through association has not loaded", async () => {
    const cakeDesigner = await CakeDesigner.create({ chef: new Chef() });
    const drinkDesigner = await DrinkDesigner.create({ chef: new Chef() });
    const dept = await Department.create({
      chefs: [(cakeDesigner as any).chef, (drinkDesigner as any).chef],
    });
    await Hotel.create({ departments: [dept] });
    const hotel = (await Hotel.includes(":cakeDesigners", ":drinkDesigners").take())!;

    expect((await hotel.cakeDesigners).map(recordKey)).toEqual([cakeDesigner].map(recordKey));
    expect((await hotel.drinkDesigners).map(recordKey)).toEqual([drinkDesigner].map(recordKey));
  });

  it("polymorphic has many through when through association has already loaded", async () => {
    const cakeDesigner = await CakeDesigner.create({ chef: new Chef() });
    const drinkDesigner = await DrinkDesigner.create({ chef: new Chef() });
    const dept = await Department.create({
      chefs: [(cakeDesigner as any).chef, (drinkDesigner as any).chef],
    });
    await Hotel.create({ departments: [dept] });
    const hotel = (await Hotel.includes(":chefs", ":cakeDesigners", ":drinkDesigners").take())!;

    expect((await hotel.cakeDesigners).map(recordKey)).toEqual([cakeDesigner].map(recordKey));
    expect((await hotel.drinkDesigners).map(recordKey)).toEqual([drinkDesigner].map(recordKey));
  });

  it("polymorphic has many through joined different table twice", async () => {
    const cakeDesigner = await CakeDesigner.create({ chef: new Chef() });
    const drinkDesigner = await DrinkDesigner.create({ chef: new Chef() });
    const dept = await Department.create({
      chefs: [(cakeDesigner as any).chef, (drinkDesigner as any).chef],
    });
    const hotel = await Hotel.create({ departments: [dept] });

    const result = await Hotel.joins(":cakeDesigners", ":drinkDesigners").take();
    expect(result?.id).toBe(hotel.id);
  });

  it("has many through polymorphic with scope", async () => {
    await Post.deleteAll();

    const post = await Post.create({ title: "Catchy Title", body: "Interesting body." });
    const category = await Category.create({ name: "Anything" });
    await CategoryPost.create({ post, category });
    const bob = authors("bob");
    await Essay.create({ writer: bob, category });

    const count = await Post.joins(":authorsOfEssaysNamedBob").count();
    expect(count).toBe(1);
  });

  it("has many through reset source reflection after loading is complete", async () => {
    const preloaded = (
      (await Category.preload(":orderedPostComments").find(1, 2)) as Category[]
    ).at(-1)!;
    const original = await Category.find(2);
    expect(await original.orderedPostComments.ids()).toEqual(
      await preloaded.orderedPostComments.ids(),
    );
  });
});
