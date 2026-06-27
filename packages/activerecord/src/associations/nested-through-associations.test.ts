/**
 * Mirrors Rails activerecord/test/cases/associations/nested_through_associations_test.rb
 */
import { describe, it, expect } from "vitest";
import { registerModel } from "../index.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { Author } from "../test-helpers/models/author.js";
import { Post } from "../test-helpers/models/post.js";
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

registerModel(Author);
registerModel(Post);
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
  } = useHandlerFixtures(
    [
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
    ],
    { schema: canonicalSchema },
  );

  // has_many through
  // Source: has_many through
  // Through: has_many
  it("has many through has many with has many through source reflection", async () => {
    const general = tags("general");
    const david = authors("david");
    const davidTags = await david.tags.toArray();
    expect(davidTags.map((t) => t.id)).toEqual([general.id, general.id]);
  });

  it("has many through has many with has many through source reflection preload", async () => {
    const general = tags("general");
    const [author] = await Author.includes("tags").order("authors.id").limit(1).toArray();
    const preloaded = author.association("tags").target ?? [];
    expect((preloaded as any[]).map((t) => t.id)).toEqual([general.id, general.id]);
  });

  it("has many through has many with has many through source reflection preload via joins", async () => {
    const general = tags("general");
    const david = authors("david");
    const result = await Author.where({ "tags.id": general.id })
      .joins("tags")
      .order("authors.id")
      .toArray();
    expect(result.map((a) => a.id)).toContain(david.id);

    const empty = await Author.joins("tags")
      .where({ "taggings.taggable_type": "FakeModel" })
      .toArray();
    expect(empty).toHaveLength(0);
  });

  // has_many through
  // Source: has_many
  // Through: has_many through
  // trails deduplicates nested-through results by PK; Rails returns all rows including duplicates.
  // The direct-load path returns [alterself, webster132] (2 unique) instead of [alterself, webster132, webster132].
  it.todo("has many through has many through with has many source reflection");

  it("has many through has many through with has many source reflection preload", async () => {
    const luke = subscribers("first");
    const davidSub = subscribers("second");
    const [author] = await Author.includes("subscribers").order("authors.id").limit(1).toArray();
    const preloaded = ((author.association("subscribers").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.nick.localeCompare(b.nick));
    const expected = [luke, davidSub, davidSub]
      .slice()
      .sort((a: any, b: any) => a.nick.localeCompare(b.nick));
    expect(preloaded.map((s) => s.nick)).toEqual(expected.map((s: any) => s.nick));
  });

  it("has many through has many through with has many source reflection preload via joins", async () => {
    const david = authors("david");
    const result = await Author.where({ "subscribers.nick": "alterself" })
      .joins("subscribers")
      .toArray();
    expect(result.map((a) => a.id)).toContain(david.id);
  });

  // has_many through
  // Source: has_one through
  // Through: has_one
  it("has many through has one with has one through source reflection", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    const result = await groucho.nestedMemberTypes.toArray();
    expect(result.map((t) => t.id)).toEqual([founding.id]);
  });

  it("has many through has one with has one through source reflection preload", async () => {
    const founding = memberTypes("founding");
    const [member] = await Member.includes("nestedMemberTypes")
      .order("members.id")
      .limit(1)
      .toArray();
    const preloaded = (member.association("nestedMemberTypes").target ?? []) as any[];
    expect(preloaded.map((t) => t.id)).toEqual([founding.id]);
  });

  it("has many through has one with has one through source reflection preload via joins", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    const result = await Member.where({ "member_types.id": founding.id })
      .joins("nestedMemberTypes")
      .toArray();
    expect(result.map((m) => m.id)).toContain(groucho.id);
  });

  // has_many through
  // Source: has_one
  // Through: has_one through
  // Direct load of nestedSponsors generates "no such column: sponsors.sponsor_club_id";
  // the polymorphic FK resolution for Club.sponsors (as: "sponsorable") is wrong in the nested-through
  // direct-query builder. Preload and joins paths work correctly.
  it.todo("has many through has one through with has one source reflection");

  it("has many through has one through with has one source reflection preload", async () => {
    const mustache = sponsors("moustache_club_sponsor_for_groucho");
    const [member] = await Member.includes("nestedSponsors").order("members.id").limit(1).toArray();
    const preloaded = (member.association("nestedSponsors").target ?? []) as any[];
    expect(preloaded.map((s) => s.id)).toEqual([mustache.id]);
  });

  it("has many through has one through with has one source reflection preload via joins", async () => {
    const mustache = sponsors("moustache_club_sponsor_for_groucho");
    const groucho = members("groucho");
    const result = await Member.where({ "sponsors.id": mustache.id })
      .joins("nestedSponsors")
      .toArray();
    expect(result.map((m) => m.id)).toContain(groucho.id);
  });

  // has_many through
  // Source: has_many through
  // Through: has_one
  it("has many through has one with has many through source reflection", async () => {
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");
    const groucho = members("groucho");
    const result = await groucho.organizationMemberDetails.toArray();
    const sortedIds = result.map((d) => d.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual([grouchoDetails.id, otherDetails.id].sort((a: any, b: any) => a - b));
  });

  it("has many through has one with has many through source reflection preload", async () => {
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");
    const [member] = await Member.includes("organizationMemberDetails")
      .order("members.id")
      .limit(1)
      .toArray();
    const preloaded = ((member.association("organizationMemberDetails").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.id - b.id);
    expect(preloaded.map((d) => d.id)).toEqual(
      [grouchoDetails.id, otherDetails.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through has one with has many through source reflection preload via joins", async () => {
    const grouchoDetails = memberDetails("groucho");
    const groucho = members("groucho");
    const someOtherGuy = members("some_other_guy");
    const result = await Member.where({ "member_details.id": grouchoDetails.id })
      .joins("organizationMemberDetails")
      .order("member_details.id")
      .toArray();
    expect(result.map((m) => m.id)).toContain(groucho.id);
    expect(result.map((m) => m.id)).toContain(someOtherGuy.id);

    const empty = await Member.joins("organizationMemberDetails")
      .where({ "member_details.id": 9 })
      .toArray();
    expect(empty).toHaveLength(0);
  });

  // has_many through
  // Source: has_many
  // Through: has_one through
  it("has many through has one through with has many source reflection", async () => {
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");
    const groucho = members("groucho");
    const result = await groucho.organizationMemberDetails_2.toArray();
    const sortedIds = result.map((d) => d.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual([grouchoDetails.id, otherDetails.id].sort((a: any, b: any) => a - b));
  });

  it("has many through has one through with has many source reflection preload", async () => {
    const grouchoDetails = memberDetails("groucho");
    const otherDetails = memberDetails("some_other_guy");
    const [member] = await Member.includes("organizationMemberDetails_2")
      .order("members.id")
      .limit(1)
      .toArray();
    const preloaded = ((member.association("organizationMemberDetails_2").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.id - b.id);
    expect(preloaded.map((d) => d.id)).toEqual(
      [grouchoDetails.id, otherDetails.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through has one through with has many source reflection preload via joins", async () => {
    const grouchoDetails = memberDetails("groucho");
    const groucho = members("groucho");
    const someOtherGuy = members("some_other_guy");
    const result = await Member.where({ "member_details.id": grouchoDetails.id })
      .joins("organizationMemberDetails_2")
      .order("member_details.id")
      .toArray();
    expect(result.map((m) => m.id)).toContain(groucho.id);
    expect(result.map((m) => m.id)).toContain(someOtherGuy.id);

    const empty = await Member.joins("organizationMemberDetails_2")
      .where({ "member_details.id": 9 })
      .toArray();
    expect(empty).toHaveLength(0);
  });

  // has_many through
  // Source: has_and_belongs_to_many
  // Through: has_many
  it("has many through has many with has and belongs to many source reflection", async () => {
    const general = categories("general");
    const cooking = categories("cooking");
    const bob = authors("bob");
    const result = await bob.postCategories.toArray();
    const sortedIds = result.map((c) => c.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual([general.id, cooking.id].sort((a: any, b: any) => a - b));
  });

  it("has many through has many with has and belongs to many source reflection preload", async () => {
    const general = categories("general");
    const cooking = categories("cooking");
    const [, , author] = await Author.includes("postCategories").order("authors.id").toArray();
    const preloaded = ((author.association("postCategories").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.id - b.id);
    expect(preloaded.map((c) => c.id)).toEqual(
      [general.id, cooking.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through has many with has and belongs to many source reflection preload via joins", async () => {
    const cooking = categories("cooking");
    const bob = authors("bob");
    const result = await Author.where({ "categories.id": cooking.id })
      .joins("postCategories")
      .toArray();
    expect(result.map((a) => a.id)).toContain(bob.id);
  });

  // has_many through
  // Source: has_many
  // Through: has_and_belongs_to_many
  // Direct load of hasMany through a hasAndBelongsToMany returns empty; only preload/joins paths work.
  it.todo("has many through has and belongs to many with has many source reflection");

  it("has many through has and belongs to many with has many source reflection preload", async () => {
    const greetings = comments("greetings");
    const moreGreetings = comments("more_greetings");
    const [, category] = await Category.includes("postComments").order("categories.id").toArray();
    const preloaded = ((category.association("postComments").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.id - b.id);
    expect(preloaded.map((c) => c.id)).toEqual(
      [greetings.id, moreGreetings.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through has and belongs to many with has many source reflection preload via joins", async () => {
    const moreGreetings = comments("more_greetings");
    const general = categories("general");
    const technology = categories("technology");
    const result = await Category.where({ "comments.id": moreGreetings.id })
      .joins("postComments")
      .order("categories.id")
      .toArray();
    const ids = result.map((c) => c.id);
    expect(ids).toContain(general.id);
    expect(ids).toContain(technology.id);
  });

  // has_many through
  // Source: has_many through a habtm
  // Through: has_many through
  // Direct load of categoryPostComments (through categories→habtm posts→comments) returns empty.
  // The nested-through-habtm direct query path doesn't build the correct join for this chain.
  it.todo("has many through has many with has many through habtm source reflection");

  it("has many through has many with has many through habtm source reflection preload", async () => {
    const greetings = comments("greetings");
    const moreGreetings = comments("more_greetings");
    const [, , author] = await Author.includes("categoryPostComments")
      .order("authors.id")
      .toArray();
    const preloaded = ((author.association("categoryPostComments").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.id - b.id);
    expect(preloaded.map((c) => c.id)).toEqual(
      [greetings.id, moreGreetings.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through has many with has many through habtm source reflection preload via joins", async () => {
    const david = authors("david");
    const mary = authors("mary");
    const result = await Author.where({ "comments.id": comments("does_it_hurt").id })
      .joins("categoryPostComments")
      .order("authors.id")
      .toArray();
    const ids = result.map((a) => a.id);
    expect(ids).toContain(david.id);
    expect(ids).toContain(mary.id);
  });

  // has_many through
  // Source: belongs_to
  // Through: has_many through
  // Rails returns [general, general] (duplicate because two posts have the same tag); trails deduplicates by PK.
  it.todo("has many through has many through with belongs to source reflection");

  it("has many through has many through with belongs to source reflection preload", async () => {
    const general = tags("general");
    const [author] = await Author.includes("taggingTags").order("authors.id").limit(1).toArray();
    const preloaded = (author.association("taggingTags").target ?? []) as any[];
    expect(preloaded.map((t) => t.id)).toEqual([general.id, general.id]);
  });

  it("has many through has many through with belongs to source reflection preload via joins", async () => {
    const general = tags("general");
    const david = authors("david");
    const result = await Author.where({ "tags.id": general.id }).joins("taggingTags").toArray();
    expect(result.map((a) => a.id)).toContain(david.id);
  });

  // has_many through
  // Source: has_many through
  // Through: belongs_to
  it("has many through belongs to with has many through source reflection", async () => {
    const welcomeGeneral = taggings("welcome_general");
    const thinkingGeneral = taggings("thinking_general");
    const davidWelcomeGeneral = categorizations("david_welcome_general");
    const result = await davidWelcomeGeneral.postTaggings.toArray();
    const sortedIds = result.map((t) => t.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual(
      [welcomeGeneral.id, thinkingGeneral.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through belongs to with has many through source reflection preload", async () => {
    const welcomeGeneral = taggings("welcome_general");
    const thinkingGeneral = taggings("thinking_general");
    const [categorization] = await Categorization.includes("postTaggings")
      .order("categorizations.id")
      .limit(1)
      .toArray();
    const preloaded = ((categorization.association("postTaggings").target ?? []) as any[])
      .slice()
      .sort((a: any, b: any) => a.id - b.id);
    expect(preloaded.map((t) => t.id)).toEqual(
      [welcomeGeneral.id, thinkingGeneral.id].sort((a: any, b: any) => a - b),
    );
  });

  it("has many through belongs to with has many through source reflection preload via joins", async () => {
    const welcomeGeneral = taggings("welcome_general");
    const davidWelcomeGeneral = categorizations("david_welcome_general");
    const result = await Categorization.where({ "taggings.id": welcomeGeneral.id })
      .joins("postTaggings")
      .order("taggings.id")
      .toArray();
    expect(result.map((c) => c.id)).toContain(davidWelcomeGeneral.id);
  });

  // has_one through
  // Source: has_one through
  // Through: has_one
  it("has one through has one with has one through source reflection", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    const result = await groucho.loadHasOne("nestedMemberType");
    expect(result?.id).toBe(founding.id);
  });

  it("has one through has one with has one through source reflection preload", async () => {
    const founding = memberTypes("founding");
    const [member] = await Member.includes("nestedMemberType")
      .order("members.id")
      .limit(1)
      .toArray();
    const preloaded = member.association("nestedMemberType").target as any;
    expect(preloaded?.id).toBe(founding.id);
  });

  it("has one through has one with has one through source reflection preload via joins", async () => {
    const founding = memberTypes("founding");
    const groucho = members("groucho");
    const result = await Member.where({ "member_types.id": founding.id })
      .joins("nestedMemberType")
      .toArray();
    expect(result.map((m) => m.id)).toContain(groucho.id);
  });

  // has_one through
  // Source: belongs_to
  // Through: has_one through
  it("has one through has one through with belongs to source reflection", async () => {
    const general = categories("general");
    const groucho = members("groucho");
    const result = await groucho.loadHasOne("clubCategory");
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
        const result = await groucho.loadHasOne("clubCategory");
        expect(result?.id).toBe(general.id);
      } finally {
        (Club as any).defaultScopes = prevDefaultScopes;
      }
    }
  });

  it("has one through has one through with belongs to source reflection preload", async () => {
    const general = categories("general");
    const [member] = await Member.includes("clubCategory").order("members.id").limit(1).toArray();
    const preloaded = member.association("clubCategory").target as any;
    expect(preloaded?.id).toBe(general.id);
  });

  it("has one through has one through with belongs to source reflection preload via joins", async () => {
    const technology = categories("technology");
    const blarpyWinkup = members("blarpy_winkup");
    const result = await Member.where({ "categories.id": technology.id })
      .joins("clubCategory")
      .toArray();
    expect(result.map((m) => m.id)).toContain(blarpyWinkup.id);
  });

  it("distinct has many through a has many through association on source reflection", async () => {
    const david = authors("david");
    const general = tags("general");
    const result = await david.distinctTags.toArray();
    expect(result.map((t) => t.id)).toEqual([general.id]);
  });

  it("distinct has many through a has many through association on through reflection", async () => {
    const david = authors("david");
    const luke = subscribers("first");
    const davidSub = subscribers("second");
    const result = await david.distinctSubscribers.toArray();
    const nicksSorted = result.map((s: any) => s.nick).sort();
    expect(nicksSorted).toEqual([luke, davidSub].map((s: any) => s.nick).sort());
  });

  it("nested has many through with a table referenced multiple times", async () => {
    const bob = authors("bob");
    const miscByBob = posts("misc_by_bob");
    const miscByMary = posts("misc_by_mary");
    const otherByBob = posts("other_by_bob");
    const otherByMary = posts("other_by_mary");

    const similarPosts = await bob.similarPosts.toArray();
    const sortedIds = similarPosts.map((p) => p.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual(
      [miscByBob.id, miscByMary.id, otherByBob.id, otherByMary.id].sort((a: any, b: any) => a - b),
    );

    const mary = authors("mary");
    const authorsResult = await Author.joins("similarPosts")
      .where({ "posts.id": miscByBob.id })
      .distinct()
      .toArray();
    const authorIds = authorsResult.map((a) => a.id).sort((a: any, b: any) => a - b);
    expect(authorIds).toEqual([mary.id, bob.id].sort((a: any, b: any) => a - b));

    const empty1 = await Author.joins("similarPosts")
      .where({ "taggings.taggable_type": "FakeModel" })
      .toArray();
    expect(empty1).toHaveLength(0);
    const empty2 = await Author.joins("similarPosts")
      .where({ "taggings_authors_join.taggable_type": "FakeModel" })
      .toArray();
    expect(empty2).toHaveLength(0);
  });

  it("nested has many through with scope on polymorphic reflection", async () => {
    const miscByBob = posts("misc_by_bob");
    const bob = authors("bob");
    const mary = authors("mary");
    const result = await Author.joins("orderedPosts")
      .where({ "posts.id": miscByBob.id })
      .distinct()
      .toArray();
    const ids = result.map((a) => a.id).sort((a: any, b: any) => a - b);
    expect(ids).toEqual([mary.id, bob.id].sort((a: any, b: any) => a - b));
  });

  it("has many through with foreign key option on through reflection", async () => {
    const david = people("david");
    const welcome = posts("welcome");
    const authorless = posts("authorless");
    const davidUnicyclist = references("david_unicyclist");
    const davidAuthor = authors("david");

    const agentsPosts = await david.agentsPosts.toArray();
    const sortedIds = agentsPosts.map((p) => p.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual([welcome.id, authorless.id].sort((a: any, b: any) => a - b));

    const agentsPostsAuthors = await davidUnicyclist.agentsPostsAuthors.toArray();
    expect(agentsPostsAuthors.map((a) => a.id)).toEqual([davidAuthor.id]);

    const refsResult = await Reference.joins("agentsPostsAuthors")
      .where({ "authors.id": davidAuthor.id })
      .toArray();
    expect(refsResult.map((r) => r.id)).toContain(davidUnicyclist.id);
  });

  it("has many through with foreign key option on source reflection", async () => {
    const unicyclist = jobs("unicyclist");
    const michael = people("michael");
    const susan = people("susan");

    const agents = await unicyclist.agents.toArray();
    const sortedIds = agents.map((p) => p.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual([michael.id, susan.id].sort((a: any, b: any) => a - b));

    const jobsResult = await Job.joins("agents").toArray();
    expect(jobsResult.filter((j) => j.id === unicyclist.id)).toHaveLength(2);
  });

  it("has many through with sti on through reflection", async () => {
    const stiComments = posts("sti_comments");
    const specialRating = ratings("special_comment_rating");
    const subSpecialRating = ratings("sub_special_comment_rating");

    const ratingsResult = await stiComments.specialCommentsRatings.toArray();
    const sortedIds = ratingsResult.map((r) => r.id).sort((a: any, b: any) => a - b);
    expect(sortedIds).toEqual(
      [specialRating.id, subSpecialRating.id].sort((a: any, b: any) => a - b),
    );

    const scope = Post.joins("specialCommentsRatings").where({ id: stiComments.id });
    const emptyComment = await scope.where({ "comments.type": "Comment" }).toArray();
    expect(emptyComment).toHaveLength(0);
    const specialComment = await scope.where({ "comments.type": "SpecialComment" }).toArray();
    expect(specialComment.length).toBeGreaterThan(0);
    const subSpecialComment = await scope.where({ "comments.type": "SubSpecialComment" }).toArray();
    expect(subSpecialComment.length).toBeGreaterThan(0);
  });

  // 3-level nested through (specialComments→specialCommentsRatings→taggings) direct-load returns empty.
  it.todo("has many through with sti on nested through reflection");

  it("nested has many through writers should raise error", async () => {
    const david = authors("david");
    const subscriber = subscribers("first");
    await expect((david.subscribers as any).push(subscriber)).rejects.toThrow(
      /nested through association/i,
    );
  });

  it("nested has one through writers should raise error", async () => {
    const groucho = members("groucho");
    const founding = memberTypes("founding");
    const proxy = groucho.association("nestedMemberType") as any;
    await expect(proxy.writer(founding)).rejects.toThrow(/nested through association/i);
  });

  it("nested has many through with conditions on through associations", async () => {
    const bob = authors("bob");
    const blue = tags("blue");
    const result = await bob.miscPostFirstBlueTags.toArray();
    expect(result.map((t) => t.id)).toEqual([blue.id]);
  });

  it("nested has many through with conditions on through associations preload", async () => {
    const blue = tags("blue");
    const empty = await Author.where({ "tags.id": 100 }).joins("miscPostFirstBlueTags").toArray();
    expect(empty).toHaveLength(0);

    const [, , author] = await Author.includes("miscPostFirstBlueTags")
      .order("authors.id")
      .toArray();
    const preloaded = (author.association("miscPostFirstBlueTags").target ?? []) as any[];
    expect(preloaded.map((t) => t.id)).toEqual([blue.id]);
  });

  it("nested has many through with conditions on through associations preload via joins", async () => {
    const bob = authors("bob");
    const result = await Author.where("tags.id = tags.id")
      .references("tags")
      .joins("miscPostFirstBlueTags")
      .toArray();
    expect(result.map((a) => a.id)).toContain(bob.id);
  });

  // Direct load generates "no such column: posts.title" — the scope's table reference is unresolvable
  // when the posts table is in a subquery context. The joins path works.
  it.todo("nested has many through with conditions on source associations");

  // Preload path generates "no such column: taggings.comment" when loading firstBlueTags_2
  // (scope: { taggings: { comment: "first" } }) as a nested preload source.
  it.todo("nested has many through with conditions on source associations preload");

  // Preloading firstBlueTags_2 (scope: { taggings: { comment: "first" } }) as a nested source
  // generates "no such column: taggings.comment" in the nested-preload path.
  it.todo("through association preload doesnt reset source association if already preloaded");

  it("nested has many through with conditions on source associations preload via joins", async () => {
    const bob = authors("bob");
    const result = await Author.where("tags.id = tags.id")
      .references("tags")
      .joins("miscPostFirstBlueTags_2")
      .toArray();
    expect(result.map((a) => a.id)).toContain(bob.id);
  });

  it("nested has many through with foreign key option on the source reflection through reflection", async () => {
    const nsa = organizations("nsa");
    const general = categories("general");

    const essayCategories = await nsa.authorEssayCategories.toArray();
    expect(essayCategories.map((c) => c.id)).toEqual([general.id]);

    const orgsResult = await Organization.joins("authorEssayCategories")
      .where({ "categories.id": general.id })
      .toArray();
    expect(orgsResult.map((o) => o.id)).toContain(nsa.id);

    const ownedEssayCategory = await nsa.loadHasOne("authorOwnedEssayCategory");
    expect(ownedEssayCategory?.id).toBe(general.id);

    const orgsResult2 = await Organization.joins("authorOwnedEssayCategory")
      .where({ "categories.id": general.id })
      .toArray();
    expect(orgsResult2.map((o) => o.id)).toContain(nsa.id);
  });

  it("nested has many through should not be autosaved", async () => {
    const david = authors("david");
    const c = new Categorization();
    (c as any).association("author").writer(david);
    expect(await (c as any).postTaggings.toArray()).not.toHaveLength(0);
    await c.save();
    expect(await (c as any).postTaggings.toArray()).not.toHaveLength(0);
  });

  it("polymorphic has many through when through association has not loaded", async () => {
    const cakeDesigner = await CakeDesigner.create({ chef: new Chef() });
    const drinkDesigner = await DrinkDesigner.create({ chef: new Chef() });
    const dept = await Department.create({
      chefs: [(cakeDesigner as any).chef, (drinkDesigner as any).chef],
    });
    await Hotel.create({ departments: [dept] });
    const [hotel] = await Hotel.includes("cakeDesigners", "drinkDesigners").limit(1).toArray();

    const cakes = (hotel.association("cakeDesigners").target ?? []) as any[];
    const drinks = (hotel.association("drinkDesigners").target ?? []) as any[];
    expect(cakes.map((r) => r.id)).toEqual([cakeDesigner.id]);
    expect(drinks.map((r) => r.id)).toEqual([drinkDesigner.id]);
  });

  it("polymorphic has many through when through association has already loaded", async () => {
    const cakeDesigner = await CakeDesigner.create({ chef: new Chef() });
    const drinkDesigner = await DrinkDesigner.create({ chef: new Chef() });
    const dept = await Department.create({
      chefs: [(cakeDesigner as any).chef, (drinkDesigner as any).chef],
    });
    await Hotel.create({ departments: [dept] });
    const [hotel] = await Hotel.includes("chefs", "cakeDesigners", "drinkDesigners")
      .limit(1)
      .toArray();

    const cakes = (hotel.association("cakeDesigners").target ?? []) as any[];
    const drinks = (hotel.association("drinkDesigners").target ?? []) as any[];
    expect(cakes.map((r) => r.id)).toEqual([cakeDesigner.id]);
    expect(drinks.map((r) => r.id)).toEqual([drinkDesigner.id]);
  });

  it("polymorphic has many through joined different table twice", async () => {
    const cakeDesigner = await CakeDesigner.create({ chef: new Chef() });
    const drinkDesigner = await DrinkDesigner.create({ chef: new Chef() });
    const dept = await Department.create({
      chefs: [(cakeDesigner as any).chef, (drinkDesigner as any).chef],
    });
    const hotel = await Hotel.create({ departments: [dept] });

    const result = await Hotel.joins("cakeDesigners", "drinkDesigners").take();
    expect(result?.id).toBe(hotel.id);
  });

  it("has many through polymorphic with scope", async () => {
    await Post.deleteAll();

    const post = await Post.create({ title: "Catchy Title", body: "Interesting body." });
    const category = await Category.create({ name: "Anything" });
    await (Post as any)
      .leaseConnection()
      .executeMutation(
        `INSERT INTO "categories_posts" ("category_id", "post_id") VALUES (${category.id}, ${post.id})`,
      );
    const bob = authors("bob");
    await Essay.create({ writer: bob, category });

    const count = await Post.joins("authorsOfEssaysNamedBob").count();
    expect(count).toBe(1);
  });

  // Direct load of orderedPostComments (hasMany through habtm posts→comments) returns empty
  // while preload returns [2, 1]; habtm-through direct-load gap makes the two paths diverge.
  it.todo("has many through reset source reflection after loading is complete");
});
