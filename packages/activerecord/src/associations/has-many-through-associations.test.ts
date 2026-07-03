/**
 * Mirrors Rails activerecord/test/cases/associations/has_many_through_associations_test.rb
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base, registerModel, RecordInvalid } from "../index.js";
import { fixtures, setupFixtures } from "../test-helpers/fixtures.js";
import { association } from "../associations.js";
import { quoteTableName } from "../test-helpers/quote-regex.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";

import {
  Author,
  AuthorFavorite,
  AuthorAddress,
  AuthorFavoriteWithScope,
} from "../test-helpers/models/author.js";
import { Post, FirstPost, TaggedPost, CategoryPost } from "../test-helpers/models/post.js";
import { Comment, VerySpecialComment } from "../test-helpers/models/comment.js";
import { Tag, OrderedTag } from "../test-helpers/models/tag.js";
import { Tagging, IndestructibleTagging } from "../test-helpers/models/tagging.js";
import {
  Person,
  PersonWithDependentDestroyJobs,
  PersonWithDependentDeleteAllJobs,
  PersonWithDependentNullifyJobs,
} from "../test-helpers/models/person.js";
import { Reader, LazyReader, SecureReader } from "../test-helpers/models/reader.js";
import { Book, PublishedBook } from "../test-helpers/models/book.js";
import { Subscriber } from "../test-helpers/models/subscriber.js";
import { Subscription } from "../test-helpers/models/subscription.js";
import { Category, SpecialCategory } from "../test-helpers/models/category.js";
import { Categorization, SpecialCategorization } from "../test-helpers/models/categorization.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import {
  Developer,
  SpecialDeveloper,
  DeveloperWithIncorrectlyOrderedHasManyThrough,
  AuditLog,
  AuditLogRequired,
} from "../test-helpers/models/developer.js";
import { Human } from "../test-helpers/models/human.js";
import { Contract, SpecialContract } from "../test-helpers/models/contract.js";
import { Member } from "../test-helpers/models/member.js";
import {
  Membership,
  CurrentMembership,
  SuperMembership,
  TenantMembership,
} from "../test-helpers/models/membership.js";
import { Club, SuperClub } from "../test-helpers/models/club.js";
import { Organization } from "../test-helpers/models/organization.js";
import { Owner } from "../test-helpers/models/owner.js";
import { Pet } from "../test-helpers/models/pet.js";
import { Toy } from "../test-helpers/models/toy.js";
import { PetTreasure } from "../test-helpers/models/pet-treasure.js";
import { Treasure } from "../test-helpers/models/treasure.js";
import { Job } from "../test-helpers/models/job.js";
import { Reference } from "../test-helpers/models/reference.js";
import { Essay } from "../test-helpers/models/essay.js";
import { Zine } from "../test-helpers/models/zine.js";
import { Interest } from "../test-helpers/models/interest.js";
import { Seminar } from "../test-helpers/models/seminar.js";
import { Session } from "../test-helpers/models/session.js";
import { Section } from "../test-helpers/models/section.js";
import { User } from "../test-helpers/models/user.js";
import { Family } from "../test-helpers/models/family.js";
import { FamilyTree } from "../test-helpers/models/family-tree.js";
import { ShardedBlogPost, ShardedTag, ShardedBlogPostTag } from "../test-helpers/models/sharded.js";
import {
  CpkTag,
  CpkOrder,
  CpkOrderTag,
  CpkBook,
  CpkBookWithOrderAgreements,
  CpkOrderAgreement,
  CpkChapter,
} from "../test-helpers/models/cpk.js";
import { PersonalLegacyThing } from "../test-helpers/models/personal-legacy-thing.js";

describe("HasManyThroughAssociationsTest", () => {
  setupFixtures();
  const {
    posts,
    readers,
    people,
    comments,
    authors,
    categories,
    taggings,
    tags,
    owners,
    pets,
    toys,
    jobs,
    references,
    companies,
    books,
    subscribers,
    subscriptions,
    developers,
    categorizations,
    essays,
    categoriesPosts,
    clubs,
    memberships,
    members,
    authorAddresses,
    authorFavorites,
    shardedBlogPosts,
    shardedTags,
    shardedBlogPostsTags,
    cpkTags,
    cpkOrders,
    cpkOrderTags,
    organizations,
  } = fixtures(
    [
      "posts",
      "readers",
      "people",
      "comments",
      "authors",
      "categories",
      "taggings",
      "tags",
      "owners",
      "pets",
      "toys",
      "jobs",
      "references",
      "companies",
      "books",
      "subscribers",
      "subscriptions",
      "developers",
      "categorizations",
      "essays",
      "categoriesPosts",
      "clubs",
      "memberships",
      "members",
      "authorAddresses",
      "authorFavorites",
      "shardedBlogPosts",
      "shardedTags",
      "shardedBlogPostsTags",
      "cpkTags",
      "cpkOrders",
      "cpkOrderTags",
      "organizations",
    ],
    {
      schema: canonicalSchema,
      // "update counter caches on destroy with indestructible through record"
      // intentionally raises on destroy, which aborts the PG transaction and
      // poisons transactional-fixture teardown for all subsequent tests.
      usesTransaction: ["update counter caches on destroy with indestructible through record"],
    },
  );

  // Register models at describe-time (synchronously) so reflections
  // are available before any eager validation triggered by fixtures.
  registerModel([
    Tag,
    OrderedTag,
    Tagging,
    IndestructibleTagging,
    Comment,
    VerySpecialComment,
    Category,
    SpecialCategory,
    Categorization,
    Post,
    FirstPost,
    TaggedPost,
    CategoryPost,
    Author,
    AuthorFavorite,
    AuthorFavoriteWithScope,
    AuthorAddress,
    Person,
    PersonWithDependentDestroyJobs,
    PersonWithDependentDeleteAllJobs,
    PersonWithDependentNullifyJobs,
    PersonalLegacyThing,
    Reader,
    LazyReader,
    SecureReader,
    Book,
    PublishedBook,
    Subscriber,
    Subscription,
    Company,
    Firm,
    Developer,
    SpecialDeveloper,
    DeveloperWithIncorrectlyOrderedHasManyThrough,
    AuditLog,
    AuditLogRequired,
    Human,
    Contract,
    SpecialContract,
    Member,
    Membership,
    CurrentMembership,
    SuperMembership,
    TenantMembership,
    Club,
    SuperClub,
    Organization,
    Owner,
    Pet,
    Toy,
    PetTreasure,
    Treasure,
    Job,
    Reference,
    Essay,
    Zine,
    Interest,
    Seminar,
    Session,
    Section,
    User,
    Family,
    FamilyTree,
    ShardedBlogPost,
    ShardedTag,
    ShardedBlogPostTag,
    CpkTag,
    CpkOrder,
    CpkOrderTag,
    CpkBook,
    CpkBookWithOrderAgreements,
    CpkOrderAgreement,
    CpkChapter,
    SpecialCategorization,
  ]);

  it("has many through create record", async () => {
    const book = await Book.find(books("awdr").id);
    const subscriber = await (book as any).subscribers.create({ nick: "bob" });
    expect(subscriber).toBeTruthy();
    expect(subscriber.isNewRecord()).toBe(false);
  });

  it.skip("marshal dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  it("through association with joins", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOtherComment = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).comments.merge(Post.joins("comments")).toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOtherComment.id]);
  });

  it("through association with left joins", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOtherComment = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).comments.merge(Post.leftOuterJoins("comments")).toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOtherComment.id]);
  });

  it.skip("through association with through scope and nested where", async () => {
    const company = await Company.create({ name: "special" });
    const developer = await SpecialDeveloper.create({});
    await SpecialContract.create({
      company_id: company.id,
      special_developer_id: developer.id,
    });
    const result = await (company as any).specialDevelopers
      .whereNot({ "contracts.id": null })
      .toArray();
    expect(result.map((d: any) => d.id)).toEqual([developer.id]);
  });

  it("preload with nested association", async () => {
    const davidId = authors("david").id;
    const maryId = authors("mary").id;
    const postList = await Post.where({ id: [davidId, maryId] })
      .preload("author", "authorFavoritesWithScope")
      .order("id");
    // With preloading, author_favorites_with_scope should be cached
    for (const p of postList) {
      // association already loaded — should not issue a new query
      expect((p as any).authorFavoritesWithScope).toBeDefined();
    }
    expect(await (postList[0] as any).authorFavoritesWithScope.size()).toBe(1);
  });

  it("preload sti rhs class", async () => {
    const devs = await Developer.includes("firms").all();
    expect(devs.length).toBeGreaterThan(0);
    for (const dev of devs) {
      expect((dev as any).firms).toBeDefined();
    }
  });

  it("preload sti middle relation", async () => {
    const club = await Club.create({ name: "Aaron cool banana club" });
    const member1 = await Member.create({ name: "Aaron" });
    const member2 = await Member.create({ name: "Cat" });
    await SuperMembership.create({ club_id: club.id, member_id: member1.id });
    await CurrentMembership.create({ club_id: club.id, member_id: member2.id });

    const club1 = await Club.includes("members").findBy({ id: club.id });
    const clubMembers = ((club1 as any).members as any[]).sort(
      (a: any, b: any) => Number(a.id) - Number(b.id),
    );
    const expected = [member1, member2].sort((a, b) => Number(a.id) - Number(b.id));
    expect(clubMembers.map((m: any) => m.id)).toEqual(expected.map((m) => m.id));
  });

  it("preload multiple instances of the same record", async () => {
    const club = await Club.create({ name: "Aaron cool banana club" });
    await Membership.create({
      club_id: club.id,
      member_id: (await Member.create({ name: "Aaron" })).id,
    });
    await Membership.create({
      club_id: club.id,
      member_id: (await Member.create({ name: "Bob" })).id,
    });

    const preloadedClubs = await Club.joins("memberships").preload("membership");
    expect(preloadedClubs.length).toBeGreaterThan(0);
    for (const c of preloadedClubs) {
      expect((c as any).membership).toBeDefined();
    }
  });

  it("ordered has many through", async () => {
    // Rails creates an anonymous person class with ordered posts
    class PersonPrime extends Base {
      static {
        this._tableName = "people";
        this.hasMany("readers", { foreignKey: "person_id" });
        this.hasMany("posts", {
          scope: (q: any) => q.order("posts.id DESC"),
          through: "readers",
          className: "Post",
        });
      }
    }
    registerModel("PersonPrime", PersonPrime);

    const posts = await (PersonPrime as any)
      .includes("posts")
      .first()
      .then((p: any) => p.posts);
    expect(posts.length).toBeGreaterThan(1);
    for (let i = 0; i < posts.length - 1; i++) {
      expect(posts[i].id).toBeGreaterThan(posts[i + 1].id);
    }
  });

  it("singleton has many through", async () => {
    const anonbook = await Book.first();
    const namebook = await Book.find((anonbook as any).id);

    const anonSubscribers = await (anonbook as any).subscribers.toArray();
    expect(anonSubscribers.length).toBeGreaterThan(0);
    for (const s of anonSubscribers) {
      expect(s).toBeInstanceOf(Subscriber);
    }
    const nameSubscribers = await (namebook as any).subscribers.toArray();
    expect(nameSubscribers.map((s: any) => s.id).sort()).toEqual(
      anonSubscribers.map((s: any) => s.id).sort(),
    );
  });

  it("no pk join table append", async () => {
    // Rails: make_no_pk_hm_t creates anonymous models using lessons/lessons_students/students
    class NoPkLesson extends Base {
      static {
        this._tableName = "lessons";
        this.attribute("name", "string");
        this.hasMany("lessonStudents", { className: "NoPkLessonStudent", foreignKey: "lesson_id" });
        this.hasMany("students", { through: "lessonStudents", className: "NoPkStudent" });
      }
    }
    class NoPkLessonStudent extends Base {
      static {
        this._tableName = "lessons_students";
        this.attribute("lesson_id", "big_integer");
        this.attribute("student_id", "big_integer");
        this.belongsTo("student", { className: "NoPkStudent", foreignKey: "student_id" });
      }
    }
    class NoPkStudent extends Base {
      static {
        this._tableName = "students";
        this.attribute("name", "string");
      }
    }
    registerModel("NoPkLesson", NoPkLesson);
    registerModel("NoPkLessonStudent", NoPkLessonStudent);
    registerModel("NoPkStudent", NoPkStudent);

    const sicp = new NoPkLesson({ name: "SICP" });
    const ben = new NoPkStudent({ name: "Ben Bitdiddle" });
    await (sicp as any).students.push(ben);
    await sicp.save();
    expect(sicp.isPersisted()).toBe(true);
  });

  it.skip("no pk join table delete", async () => {
    class NoPkDelLesson extends Base {
      static {
        this._tableName = "lessons";
        this.attribute("name", "string");
        this.hasMany("lessonStudents", {
          className: "NoPkDelLessonStudent",
          foreignKey: "lesson_id",
        });
        this.hasMany("students", { through: "lessonStudents", className: "NoPkDelStudent" });
      }
    }
    class NoPkDelLessonStudent extends Base {
      static {
        this._tableName = "lessons_students";
        this.attribute("lesson_id", "big_integer");
        this.attribute("student_id", "big_integer");
        this.belongsTo("student", { className: "NoPkDelStudent", foreignKey: "student_id" });
      }
    }
    class NoPkDelStudent extends Base {
      static {
        this._tableName = "students";
        this.attribute("name", "string");
      }
    }
    registerModel("NoPkDelLesson", NoPkDelLesson);
    registerModel("NoPkDelLessonStudent", NoPkDelLessonStudent);
    registerModel("NoPkDelStudent", NoPkDelStudent);

    const sicp = new NoPkDelLesson({ name: "SICP" });
    const ben = new NoPkDelStudent({ name: "Ben Bitdiddle" });
    const louis = new NoPkDelStudent({ name: "Louis Reasoner" });
    await (sicp as any).students.push(ben);
    await (sicp as any).students.push(louis);
    await sicp.save();

    await (sicp as any).students.reload();
    const studentCountBefore = await NoPkDelStudent.count();
    const lessonStudentCountBefore = await NoPkDelLessonStudent.count();
    const allStudents = await NoPkDelStudent.all();
    await (sicp as any).students.destroy(...allStudents);
    expect(await NoPkDelStudent.count()).toBe(studentCountBefore);
    expect(await NoPkDelLessonStudent.count()).toBeLessThan(lessonStudentCountBefore as number);
  });

  it.skip("no pk join model callbacks", async () => {
    class NoPkCbLesson extends Base {
      static {
        this._tableName = "lessons";
        this.attribute("name", "string");
        this.hasMany("lessonStudents", {
          className: "NoPkCbLessonStudent",
          foreignKey: "lesson_id",
        });
        this.hasMany("students", { through: "lessonStudents", className: "NoPkCbStudent" });
      }
    }
    let afterDestroyCalled = false;
    class NoPkCbLessonStudent extends Base {
      static {
        this._tableName = "lessons_students";
        this.attribute("lesson_id", "big_integer");
        this.attribute("student_id", "big_integer");
        this.belongsTo("student", { className: "NoPkCbStudent", foreignKey: "student_id" });
        (this as any).afterDestroy(() => {
          afterDestroyCalled = true;
        });
      }
    }
    class NoPkCbStudent extends Base {
      static {
        this._tableName = "students";
        this.attribute("name", "string");
      }
    }
    registerModel("NoPkCbLesson", NoPkCbLesson);
    registerModel("NoPkCbLessonStudent", NoPkCbLessonStudent);
    registerModel("NoPkCbStudent", NoPkCbStudent);

    const sicp = new NoPkCbLesson({ name: "SICP" });
    const ben = new NoPkCbStudent({ name: "Ben Bitdiddle" });
    await (sicp as any).students.push(ben);
    await sicp.save();

    await (sicp as any).students.reload();
    const allStudents = await NoPkCbStudent.all();
    await (sicp as any).students.destroy(...allStudents);
    expect(afterDestroyCalled).toBe(true);
  });

  it("pk is not required for join", async () => {
    const post = await Post.includes("scategories").first();
    const post2 = await Post.includes("categories").first();
    const sCategories = await (post as any).scategories.toArray();
    const categories2 = await (post2 as any).categories.toArray();
    expect(sCategories.length).toBeGreaterThan(0);
    const sorted1 = [...sCategories].sort((a: any, b: any) => Number(a.id) - Number(b.id));
    const sorted2 = [...categories2].sort((a: any, b: any) => Number(a.id) - Number(b.id));
    expect(sorted1.map((c: any) => c.id)).toEqual(sorted2.map((c: any) => c.id));
  });

  it("include?", async () => {
    const person = new Person();
    const post = new Post();
    await (person as any).posts.push(post);
    const personPosts = await (person as any).posts.toArray();
    expect(personPosts.map((p: any) => p.id)).toContain(post.id);
  });

  it("associate existing", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    await (post as any).people.push(person);
    const postPeople = await (post as any).people.toArray();
    expect(postPeople.map((p: any) => p.id)).toContain(person.id);

    const reloaded = await Post.find(posts("thinking").id);
    const reloadedPeople = await (reloaded as any).people.reload().then((p: any) => p);
    expect(reloadedPeople.map((p: any) => p.id)).toContain(person.id);
  });

  it("delete all for with dependent option destroy", async () => {
    const person = await Person.find(people("david").id);
    const countBefore = await (person as any).jobsWithDependentDestroy.count();
    expect(countBefore).toBe(1);

    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).reload();
    const deleted = await (person as any).jobsWithDependentDestroy.deleteAll();
    expect(deleted).toBe(1);
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(Number(refCountBefore) - 1);
  });

  it.skip("delete all for with dependent option nullify", async () => {
    const person = await Person.find(people("david").id);
    expect(await (person as any).jobsWithDependentNullify.count()).toBe(1);

    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).reload();
    const deleted = await (person as any).jobsWithDependentNullify.deleteAll();
    expect(deleted).toBe(1);
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(refCountBefore);
  });

  it("delete all for with dependent option delete all", async () => {
    const person = await Person.find(people("david").id);
    expect(await (person as any).jobsWithDependentDeleteAll.count()).toBe(1);

    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).reload();
    const deleted = await (person as any).jobsWithDependentDeleteAll.deleteAll();
    expect(deleted).toBe(1);
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(Number(refCountBefore) - 1);
  });

  it("delete all on association clears scope", async () => {
    const post = await Post.create({ title: "Rails 6", body: "" });
    const people2 = (post as any).people;
    await people2.create({ first_name: "Jeb" });
    await people2.deleteAll();
    expect(await people2.first()).toBeNull();
  });

  it("concat", async () => {
    const person = await Person.find(people("david").id);
    const post = await Post.find(posts("thinking").id);
    const result = await (post as any).people.concat(person);
    expect(await (post as any).people.size()).toBe(1);
    expect(await (await Post.find(posts("thinking").id)).people.size()).toBe(1);
    expect((result as any[]).map((r: any) => r.id)).toContain(person.id);
  });

  it("associate existing record twice should add to target twice", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    const countBefore = (await (post as any).people.toArray()).length;
    await (post as any).people.push(person);
    await (post as any).people.push(person);
    expect((await (post as any).people.toArray()).length).toBe(countBefore + 2);
  });

  it("associate existing record twice should add records twice", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    const countBefore = await (post as any).people.count();
    await (post as any).people.push(person);
    await (post as any).people.push(person);
    expect(await (post as any).people.count()).toBe(countBefore + 2);
  });

  it("add two instance and then deleting", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    await (post as any).people.push(person);
    await (post as any).people.push(person);

    const peopleCountBefore = await (post as any).people.count();
    const readersCountBefore = await (post as any).readers.count();
    await (post as any).people.delete(person);
    expect(await (post as any).people.count()).toBe(peopleCountBefore - 2);
    expect(await (post as any).readers.count()).toBe(readersCountBefore - 2);

    const reloaded = await Post.find(posts("thinking").id);
    const reloadedPeople = await (reloaded as any).people.reload();
    expect(reloadedPeople.map((p: any) => p.id)).not.toContain(person.id);
  });

  it("associating new", async () => {
    const newPerson = new Person({ first_name: "bob" });
    const post = await Post.find(posts("thinking").id);
    await (post as any).people.push(newPerson);

    const thinkingPeople = await (post as any).people.toArray();
    expect(thinkingPeople.map((p: any) => p.first_name)).toContain("bob");

    const reloaded = await Post.find(posts("thinking").id);
    const reloadedPeople = await (reloaded as any).people.reload();
    expect(reloadedPeople.map((p: any) => p.first_name)).toContain("bob");
  });

  it("associate new by building", async () => {
    const post = await Post.find(posts("thinking").id);
    await (post as any).people.build({ first_name: "Bob" });
    await (post as any).people.build({ first_name: "Ted" });

    const firstNames = (post as any).people.map((p: any) => p.first_name);
    expect(firstNames).toContain("Bob");
    expect(firstNames).toContain("Ted");

    (post as any).body = `${(post as any).body}-changed`;
    await post.save();

    const reloaded = await Post.find(posts("thinking").id);
    const names = (await (reloaded as any).people.reload()).map((p: any) => p.first_name);
    expect(names).toContain("Bob");
    expect(names).toContain("Ted");
  });

  it("build then save with has many inverse", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await (post as any).people.build({ first_name: "Bob" });
    await person.save();
    await post.reload();

    expect((await (post as any).people.toArray()).map((p: any) => p.id)).toContain(person.id);
  });

  it("build then save with has one inverse", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await (post as any).singlePeople.build({ first_name: "Bob" });
    await person.save();
    await post.reload();

    expect((await (post as any).singlePeople.toArray()).map((p: any) => p.id)).toContain(person.id);
  });

  it("build then remove then save", async () => {
    const post = await Post.find(posts("thinking").id);
    await (post as any).people.build({ first_name: "Bob" });
    const ted = await (post as any).people.build({ first_name: "Ted" });
    await (post as any).people.delete(ted);
    await post.save();
    await post.reload();

    const names = (await (post as any).people.toArray()).map((p: any) => p.first_name);
    expect(names).toEqual(["Bob"]);
  });

  it("both parent ids set when saving new", async () => {
    const post = new Post({ title: "Hello", body: "world" });
    const person = new Person({ first_name: "Sean" });

    (post as any).people = [person];
    await post.save();

    expect(post.id).toBeTruthy();
    expect(person.id).toBeTruthy();
    const reader = await (post as any).readers.first();
    expect(Number(reader.post_id)).toBe(Number(post.id));
    expect(Number(reader.person_id)).toBe(Number(person.id));
  });

  it("delete association", async () => {
    const post = await Post.find(posts("welcome").id);
    await (post as any).people.reload();
    const michael = await Person.find(people("michael").id);
    await (post as any).people.delete(michael);

    expect(await (post as any).people.toArray()).toHaveLength(0);
    const welcomePost2 = await Post.find(posts("welcome").id);
    await (welcomePost2 as any).people.reload();
    expect(await (welcomePost2 as any).people.size()).toBe(0);
  });

  it("destroy association", async () => {
    const personCountBefore = await Person.count();
    const readerCountBefore = await Reader.count();
    const post = await Post.find(posts("welcome").id);
    const michael = await Person.find(people("michael").id);
    await (post as any).people.destroy(michael);
    expect(await Person.count()).toBe(personCountBefore);
    expect(await Reader.count()).toBe(Number(readerCountBefore) - 1);

    const reloaded = await Post.find(posts("welcome").id);
    expect(await (reloaded as any).people.toArray()).toHaveLength(0);
    await (reloaded as any).people.reload();
    expect(await (reloaded as any).people.size()).toBe(0);
  });

  it("destroy all", async () => {
    const personCountBefore = await Person.count();
    const readerCountBefore = await Reader.count();
    const post = await Post.find(posts("welcome").id);
    await (post as any).people.destroyAll();
    expect(await Person.count()).toBe(personCountBefore);
    expect(await Reader.count()).toBe(Number(readerCountBefore) - 1);

    const reloaded = await Post.find(posts("welcome").id);
    expect(await (reloaded as any).people.toArray()).toHaveLength(0);
    await (reloaded as any).people.reload();
    expect(await (reloaded as any).people.size()).toBe(0);
  });

  describe("composite PK through associations (canonical)", () => {
    it("destroy all on composite primary key model", async () => {
      const tag = cpkTags("cpk_tag_loyal_customer");
      const orders = await (tag as any).orders.toArray();
      expect(orders.length).toBeGreaterThan(0);
      await (tag as any).orders.destroyAll();
      expect(await (tag as any).orders.toArray()).toHaveLength(0);
      await (tag as any).orders.reload();
      expect(await (tag as any).orders.toArray()).toHaveLength(0);
    });

    it("composite primary key join table", async () => {
      const order = await CpkOrder.create({ shop_id: 1, status: "open" });
      const tag = cpkTags("cpk_tag_loyal_customer");
      const orderTag = await CpkOrderTag.create({
        order_id: (order as any).idValue,
        tag_id: (tag as any).id,
        attached_by: "Nikita",
      });
      const loadedOrder = await (orderTag as any).association("order").loadTarget();
      expect(loadedOrder?.idValue).toBe((order as any).idValue);
      const loadedTag = await (orderTag as any).association("tag").loadTarget();
      expect(loadedTag?.id).toBe((tag as any).id);
      await (orderTag as any).update({ attached_reason: "This is our loyal customer" });
      const orderTags = await (order as any).orderTags.toArray();
      const found = orderTags.find((ot: any) => Number(ot.tag_id) === Number((tag as any).id));
      expect(found.attached_reason).toBe("This is our loyal customer");
    });
  });

  it("destroy all on association clears scope", async () => {
    const post = await Post.create({ title: "Rails 6", body: "" });
    const ppl = (post as any).people;
    await ppl.create({ first_name: "Jeb" });
    await ppl.destroyAll();
    expect(await ppl.first()).toBeNull();
  });

  it("destroy on association clears scope", async () => {
    const post = await Post.create({ title: "Rails 6", body: "" });
    const ppl = (post as any).people;
    const person = await ppl.create({ first_name: "Jeb" });
    await ppl.destroy(person);
    expect(await ppl.first()).toBeNull();
  });

  it("delete on association clears scope", async () => {
    const post = await Post.create({ title: "Rails 6", body: "" });
    const ppl = (post as any).people;
    const person = await ppl.create({ first_name: "Jeb" });
    await ppl.delete(person);
    expect(await ppl.first()).toBeNull();
  });

  it.skip("should raise exception for destroying mismatching records", async () => {
    const personCountBefore = await Person.count();
    const readerCountBefore = await Reader.count();
    const post = await Post.find(posts("welcome").id);
    const thinkingPost = await Post.find(posts("thinking").id);
    await expect((post as any).people.destroy(thinkingPost)).rejects.toThrow();
    expect(await Person.count()).toBe(personCountBefore);
    expect(await Reader.count()).toBe(readerCountBefore);
  });

  it("delete through belongs to with dependent nullify", async () => {
    Reference.makeComments = true;
    try {
      const person = await Person.find(people("michael").id);
      const jobRecord = await Job.find(jobs("magician").id);
      const ref = await Reference.where({ job_id: jobRecord.id, person_id: person.id }).first();

      const jobCountBefore = await Job.count();
      const refCountBefore = await Reference.count();
      const personJobsBefore = await (person as any).jobs.count();
      await (person as any).jobsWithDependentNullify.delete(jobRecord);
      expect(await Job.count()).toBe(jobCountBefore);
      expect(await Reference.count()).toBe(refCountBefore);
      expect(await (person as any).jobs.count()).toBe(personJobsBefore - 1);

      const reloadedRef = await Reference.find((ref as any).id);
      expect((reloadedRef as any).job_id).toBeNull();
    } finally {
      Reference.makeComments = false;
    }
  });

  it.skip("delete through belongs to with dependent delete all", async () => {
    Reference.makeComments = true;
    try {
      const person = await Person.find(people("michael").id);
      const jobRecord = await Job.find(jobs("magician").id);

      expect(await (person as any).jobs.count()).toBeGreaterThanOrEqual(2);

      const jobCountBefore = await Job.count();
      const refCountBefore = await Reference.count();
      const personJobsBefore = await (person as any).jobs.count();
      await (person as any).jobsWithDependentDeleteAll.delete(jobRecord);
      expect(await Job.count()).toBe(jobCountBefore);
      expect(await Reference.count()).toBe(Number(refCountBefore) - 1);
      expect(await (person as any).jobs.count()).toBe(personJobsBefore - 1);

      // Check that the destroy callback on Reference did NOT run
      const reloadedPerson = await Person.find(people("michael").id);
      expect((reloadedPerson as any).comments).toBeNull();
    } finally {
      Reference.makeComments = false;
    }
  });

  it("delete through belongs to with dependent destroy", async () => {
    Reference.makeComments = true;
    try {
      const person = await Person.find(people("michael").id);
      const jobRecord = await Job.find(jobs("magician").id);

      expect(await (person as any).jobs.count()).toBeGreaterThanOrEqual(2);

      const jobCountBefore = await Job.count();
      const refCountBefore = await Reference.count();
      const personJobsBefore = await (person as any).jobs.count();
      await (person as any).jobsWithDependentDestroy.delete(jobRecord);
      expect(await Job.count()).toBe(jobCountBefore);
      expect(await Reference.count()).toBe(Number(refCountBefore) - 1);
      expect(await (person as any).jobs.count()).toBe(personJobsBefore - 1);

      // Check that the destroy callback on Reference ran
      const reloadedPerson = await Person.find(people("michael").id);
      expect((reloadedPerson as any).comments).toBe("Reference destroyed");
    } finally {
      Reference.makeComments = false;
    }
  });

  it("belongs to with dependent destroy", async () => {
    const person = await PersonWithDependentDestroyJobs.find(1);
    await (person as any).references.create({});

    const jobCountBefore = await Job.count();
    const personJobCount = await (person as any).jobs.count();
    const refCountBefore = await Reference.count();
    await person.destroy();
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(Number(refCountBefore) - Number(personJobCount));
  });

  it("belongs to with dependent delete all", async () => {
    const person = await PersonWithDependentDeleteAllJobs.find(1);
    await (person as any).references.create({});

    const jobCountBefore = await Job.count();
    const personJobCount = await (person as any).jobs.count();
    const refCountBefore = await Reference.count();
    await person.destroy();
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(Number(refCountBefore) - Number(personJobCount));
  });

  it("belongs to with dependent nullify", async () => {
    const person = await PersonWithDependentNullifyJobs.find(1);
    const refs = await (person as any).references.toArray();

    const refCountBefore = await Reference.count();
    const jobCountBefore = await Job.count();
    await person.destroy();
    expect(await Reference.count()).toBe(refCountBefore);
    expect(await Job.count()).toBe(jobCountBefore);

    for (const ref of refs) {
      const reloaded = await Reference.find(ref.id);
      expect((reloaded as any).job_id).toBeNull();
    }
  });

  it("update counter caches on delete", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.create({ name: "doomed" });

    const tagsCountBefore = (await Post.find(posts("welcome").id)).tags_count;
    await (await Post.find(posts("welcome").id)).tags.delete(tag);
    expect((await Post.find(posts("welcome").id)).tags_count).toBe(Number(tagsCountBefore) - 1);
  });

  it.skip("update counter caches on delete with dependent destroy", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.create({ name: "doomed" });
    await post.updateColumns({ tags_with_destroy_count: await (post as any).tags.count() });

    const countBefore = (await Post.find(posts("welcome").id)).tags_with_destroy_count;
    await (await Post.find(posts("welcome").id)).tagsWithDestroy.delete(tag);
    expect((await Post.find(posts("welcome").id)).tags_with_destroy_count).toBe(
      Number(countBefore) - 1,
    );
  });

  it.skip("update counter caches on delete with dependent nullify", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.create({ name: "doomed" });
    await post.updateColumns({ tags_with_nullify_count: await (post as any).tags.count() });

    const tagsCountBefore = (await Post.find(posts("welcome").id)).tags_count;
    const nullifyCountBefore = (await Post.find(posts("welcome").id)).tags_with_nullify_count;
    await (await Post.find(posts("welcome").id)).tagsWithNullify.delete(tag);
    expect((await Post.find(posts("welcome").id)).tags_count).toBe(tagsCountBefore);
    expect((await Post.find(posts("welcome").id)).tags_with_nullify_count).toBe(
      Number(nullifyCountBefore) - 1,
    );
  });

  it.skip("update counter caches on replace association", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.create({ name: "doomed" });
    await tag.taggedPosts.push(await Post.find(posts("thinking").id));

    tag.taggedPosts = [];
    await post.reload();

    expect(post.tags_count).toBe(await (post as any).taggings.count());
  });

  it.skip("update counter caches on destroy", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.create({ name: "doomed" });

    const countBefore = (await Post.find(posts("welcome").id)).tags_count;
    await tag.taggedPosts.destroy(post);
    expect((await Post.find(posts("welcome").id)).tags_count).toBe(Number(countBefore) - 1);
  });

  it("update counter caches on destroy with indestructible through record", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).indestructibleTags.create({ name: "doomed" });
    await post.updateColumns({
      indestructible_tags_count: await (post as any).indestructibleTags.count(),
    });

    const countBefore = (await Post.find(posts("welcome").id)).indestructible_tags_count;
    await (await Post.find(posts("welcome").id)).indestructibleTags.destroy(tag);
    expect((await Post.find(posts("welcome").id)).indestructible_tags_count).toBe(countBefore);
  });

  it("replace association", async () => {
    const post = await Post.find(posts("welcome").id);
    await (post as any).people.reload();
    const david = await Person.find(people("david").id);
    const michael = await Person.find(people("michael").id);

    await (post as any).people.replace([david]);

    const postPeople = await (post as any).people.reload();
    expect(postPeople.map((p: any) => p.id)).toContain(david.id);
    expect(postPeople.map((p: any) => p.id)).not.toContain(michael.id);

    const reloaded = await Post.find(posts("welcome").id);
    const reloadedPeople = await (reloaded as any).people.reload();
    expect(reloadedPeople.map((p: any) => p.id)).toContain(david.id);
    expect(reloadedPeople.map((p: any) => p.id)).not.toContain(michael.id);
  });

  it("replace association with duplicates", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    const countBefore = await (post as any).people.count();
    await (post as any).people.replace([person]);
    await (post as any).people.replace([person, person]);
    expect(await (post as any).people.count()).toBe(countBefore + 2);
  });

  it("replace order is preserved", async () => {
    const post = await Post.find(posts("welcome").id);
    const david = await Person.find(people("david").id);
    const michael = await Person.find(people("michael").id);

    await (post as any).people.clear();
    await (post as any).people.replace([david, michael]);
    const readers1 = await (post as any).readers.order("id").toArray();
    expect(readers1.map((r: any) => Number(r.person_id))).toEqual([
      Number(david.id),
      Number(michael.id),
    ]);

    await (post as any).people.clear();
    await (post as any).people.replace([michael, david]);
    const readers2 = await (post as any).readers.order("id").toArray();
    expect(readers2.map((r: any) => Number(r.person_id))).toEqual([
      Number(michael.id),
      Number(david.id),
    ]);
  });

  it("replace by id order is preserved", async () => {
    const post = await Post.find(posts("welcome").id);
    const david = await Person.find(people("david").id);
    const michael = await Person.find(people("michael").id);

    await (post as any).people.clear();
    await (post as any).people.replace([david, michael]);
    const readers1 = await (post as any).readers.order("id").toArray();
    expect(readers1.map((r: any) => Number(r.person_id))).toEqual([
      Number(david.id),
      Number(michael.id),
    ]);

    await (post as any).people.clear();
    await (post as any).people.replace([michael, david]);
    const readers2 = await (post as any).readers.order("id").toArray();
    expect(readers2.map((r: any) => Number(r.person_id))).toEqual([
      Number(michael.id),
      Number(david.id),
    ]);
  });

  it("associate with create", async () => {
    const post = await Post.find(posts("thinking").id);
    await (post as any).people.create({ first_name: "Jeb" });

    const names = (await (post as any).people.toArray()).map((p: any) => p.first_name);
    expect(names).toContain("Jeb");

    const reloaded = await Post.find(posts("thinking").id);
    const reloadedNames = (await (reloaded as any).people.reload()).map((p: any) => p.first_name);
    expect(reloadedNames).toContain("Jeb");
  });

  it("through record is built when created with where", async () => {
    const post = await Post.find(posts("thinking").id);
    const readerCountBefore = await (post as any).readers.count();
    await (post as any).people.where({ readers: { skimmer: true } }).create({ first_name: "Jeb" });
    expect(await (post as any).readers.count()).toBe(readerCountBefore + 1);
    const reader = await (post as any).readers.last();
    expect(reader.skimmer).toBe(true);
  });

  it("associate with create and no options", async () => {
    const post = await Post.find(posts("thinking").id);
    const countBefore = await (post as any).people.count();
    await (post as any).people.create({ first_name: "foo" });
    expect(await (post as any).people.count()).toBe(countBefore + 1);
  });

  it("associate with create with through having conditions", async () => {
    const post = await Post.find(posts("thinking").id);
    const countBefore = await (post as any).impatientPeople.count();
    await (post as any).impatientPeople.create({ first_name: "foo" });
    expect(await (post as any).impatientPeople.count()).toBe(countBefore + 1);
  });

  it("associate with create exclamation and no options", async () => {
    const post = await Post.find(posts("thinking").id);
    const countBefore = await (post as any).people.count();
    await (post as any).people.create({ first_name: "foo" });
    expect(await (post as any).people.count()).toBe(countBefore + 1);
  });

  it("create on new record", async () => {
    const p = new Post();
    await expect((p as any).people.create({ first_name: "mew" })).rejects.toThrow(
      "You cannot call create unless the parent is saved",
    );
    await expect((p as any).people.create({ first_name: "snow" })).rejects.toThrow(
      "You cannot call create unless the parent is saved",
    );
  });

  it("associate with create and invalid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    const countBefore = await (firm as any).developers.count();
    try {
      await (firm as any).developers.create({ name: "0" });
    } catch (_e) {
      // swallow invalid record
    }
    expect(await (firm as any).developers.count()).toBe(countBefore);
  });

  it("associate with create and valid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    const countBefore = await (firm as any).developers.count();
    await (firm as any).developers.create({ name: "developer" });
    expect(await (firm as any).developers.count()).toBe(countBefore + 1);
  });

  it("associate with create bang and invalid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    const countBefore = await (firm as any).developers.count();
    await expect((firm as any).developers.createBang({ name: "0" })).rejects.toThrow(RecordInvalid);
    expect(await (firm as any).developers.count()).toBe(countBefore);
  });

  it("associate with create bang and valid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    const countBefore = await (firm as any).developers.count();
    await (firm as any).developers.create({ name: "developer" });
    expect(await (firm as any).developers.count()).toBe(countBefore + 1);
  });

  it("push with invalid record", async () => {
    const firm = await Company.find(companies("first_firm").id);
    await expect((firm as any).developers.push(new Developer({ name: "0" }))).rejects.toThrow(
      RecordInvalid,
    );
  });

  it("push with invalid join record", async () => {
    (Contract as any).validate((r: any) => r.errors.add("base", "Invalid Contract"));
    try {
      const firm = await Company.find(companies("first_firm").id);
      const lifo = new Developer({ name: "lifo" });
      await expect((firm as any).developers.push(lifo)).rejects.toThrow(RecordInvalid);

      const lifo2 = await Developer.create({ name: "lifo" });
      await expect((firm as any).developers.push(lifo2)).rejects.toThrow(RecordInvalid);
    } finally {
      (Contract as any).clearValidatorsBang();
    }
  });

  it("clear associations", async () => {
    const post = await Post.find(posts("welcome").id);
    await (post as any).people.reload();
    await (post as any).people.clear();

    expect(await (post as any).people.size()).toBe(0);
    const welcomePost = await Post.find(posts("welcome").id);
    await (welcomePost as any).people.reload();
    expect(await (welcomePost as any).people.size()).toBe(0);
  });

  it("association callback ordering", async () => {
    Post.resetLog();
    const post = await Post.find(posts("thinking").id);
    const michael = await Person.find(people("michael").id);

    await (post as any).peopleWithCallbacks.push(michael);
    expect(Post.log().slice(-2)).toEqual([
      ["added", "before", "Michael"],
      ["added", "after", "Michael"],
    ]);

    const david = await Person.find(people("david").id);
    const bob = await Person.create({ first_name: "Bob" });
    const lary = new Person({ first_name: "Lary" });
    await (post as any).peopleWithCallbacks.push(david, bob, lary);
    expect(Post.log().slice(-6)).toEqual([
      ["added", "before", "David"],
      ["added", "after", "David"],
      ["added", "before", "Bob"],
      ["added", "after", "Bob"],
      ["added", "before", "Lary"],
      ["added", "after", "Lary"],
    ]);

    await (post as any).peopleWithCallbacks.build({ first_name: "Ted" });
    expect(Post.log().slice(-2)).toEqual([
      ["added", "before", "Ted"],
      ["added", "after", "Ted"],
    ]);

    await (post as any).peopleWithCallbacks.create({ first_name: "Sam" });
    expect(Post.log().slice(-2)).toEqual([
      ["added", "before", "Sam"],
      ["added", "after", "Sam"],
    ]);
  });

  it("dynamic find should respect association include", async () => {
    const person = await Person.find(1);
    const post = await (person as any).postsWithCommentsSortedByCommentId.findBy({
      title: "Welcome to the weblog",
    });
    expect(post).toBeTruthy();
  });

  it("count with include should alias join table", async () => {
    const michael = await Person.find(people("michael").id);
    expect(await (michael as any).posts.includes("readers").count()).toBe(2);
  });

  it("inner join with quoted table name", async () => {
    const michael = await Person.find(people("michael").id);
    expect(await (michael as any).jobs.size()).toBe(2);
  });

  it("get ids", async () => {
    const michael = await Person.find(people("michael").id);
    const ids = await (michael as any).postIds;
    expect([...ids].map(Number).sort()).toEqual(
      [posts("welcome").id, posts("authorless").id].map(Number).sort(),
    );
  });

  it("get ids for has many through with conditions should not preload", async () => {
    const post = await Post.find(posts("welcome").id);
    await Tagging.create({ taggable_type: "Post", taggable_id: post.id, tag_id: tags("misc").id });
    const assoc = (post as any).association("miscTags");
    const ids = await (post as any).miscTagIds;
    expect(ids).toBeDefined();
    expect(assoc.isLoaded()).toBe(false);
  });

  it("get ids for loaded associations", async () => {
    const michael = await Person.find(people("michael").id);
    await (michael as any).posts.reload();
    // Post ids should be accessible from already-loaded association
    const ids1 = await (michael as any).postIds;
    const ids2 = await (michael as any).postIds;
    expect([...ids1].sort()).toEqual([...ids2].sort());
  });

  it("get ids for unloaded associations does not load them", async () => {
    const michael = await Person.find(people("michael").id);
    const postsAssoc = (michael as any).association("posts");
    expect(postsAssoc.isLoaded()).toBe(false);
    const ids = await (michael as any).postIds;
    expect([...ids].map(Number).sort()).toEqual(
      [posts("welcome").id, posts("authorless").id].map(Number).sort(),
    );
    expect(postsAssoc.isLoaded()).toBe(false);
  });

  it("association proxy transaction method starts transaction in association class", async () => {
    const post = await Post.first();
    const tagsSpy = vi.spyOn(Tag, "transaction");
    try {
      await (post as any).tags.transaction(async () => {});
      expect(tagsSpy).toHaveBeenCalledOnce();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("has many through uses the through model to create transactions", async () => {
    const post = await Post.find(posts("thinking").id);
    const david = await Person.find(people("david").id);
    const michael = await Person.find(people("michael").id);

    const readerSpy = vi.spyOn(Reader, "transaction");
    try {
      // _pushThrough wraps in the through model (Reader)'s transaction
      await association(post, "people").replace([david, michael]);
      expect(readerSpy).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("has many association through a belongs to association where the association doesnt exist", async () => {
    const post = await Post.create({ title: "TITLE", body: "BODY" });
    expect(await (post as any).authorFavorites.toArray()).toEqual([]);
  });

  it("merge join association with has many through association proxy", async () => {
    const mary = await Author.find(authors("mary").id);
    // Should not raise — chaining on the has_many_through proxy should produce valid SQL
    const sql = await (mary as any).comments.where("1=1").toSql();
    expect(sql).toBeDefined();
  });

  it("has many association through a has many association with nonstandard primary keys", async () => {
    const blackbeard = await Owner.find(owners("blackbeard").id);
    expect(await (blackbeard as any).toys.count()).toBe(2);
  });

  it("find on has many association collection with include and conditions", async () => {
    const michael = await Person.find(people("michael").id);
    const postWithNoComments = await (michael as any).postsWithNoComments.first();
    expect(postWithNoComments.id).toBe(posts("authorless").id);
  });

  it("has many through has one reflection", async () => {
    const david = await Author.find(authors("david").id);
    const verySpecialComments = await (david as any).verySpecialComments.toArray();
    expect(verySpecialComments.map((c: any) => c.id)).toEqual([
      comments("eager_sti_on_associations_vs_comment").id,
    ]);
  });

  it("modifying has many through has one reflection should raise", async () => {
    const david = await Author.find(authors("david").id);
    const first = (await (david as any).verySpecialComments.toArray())[0];

    const c1 = await VerySpecialComment.create({ body: "Gorp!", post_id: 1011 });
    const c2 = await VerySpecialComment.create({ body: "Eep!", post_id: 1012 });
    await expect(association(david, "verySpecialComments").replace([c1, c2])).rejects.toThrow();

    await expect(async () => {
      await (david as any).verySpecialComments.push(
        await VerySpecialComment.create({ body: "Hoohah!", post_id: 1013 }),
      );
    }).rejects.toThrow();

    await expect(async () => {
      await (david as any).verySpecialComments.delete(first);
    }).rejects.toThrow();
  });

  it("has many association through a belongs to association", async () => {
    const mary = await Author.find(authors("mary").id);
    const post = await Post.create({ author_id: mary.id, title: "TITLE", body: "BODY" });
    await (mary as any).authorFavorites.create({ favorite_author_id: 1 });
    await (mary as any).authorFavorites.create({ favorite_author_id: 2 });
    await (mary as any).authorFavorites.create({ favorite_author_id: 3 });
    const maryFavorites = await (mary as any).authorFavorites.toArray();
    const postFavorites = await (post as any).authorFavorites.toArray();
    expect(postFavorites.map((f: any) => f.id).sort()).toEqual(
      maryFavorites.map((f: any) => f.id).sort(),
    );
  });

  it("has many association through a has many association to self", async () => {
    const susan = await Person.find(people("susan").id);
    const sarah = await Person.create({
      first_name: "Sarah",
      primary_contact_id: susan.id,
      gender: "F",
      number1_fan_id: 1,
    });
    const john = await Person.create({
      first_name: "John",
      primary_contact_id: sarah.id,
      gender: "M",
      number1_fan_id: 1,
    });
    const sarahAgents = await (sarah as any).agents.toArray();
    expect(sarahAgents.map((a: any) => a.id)).toEqual([john.id]);

    const susanAgentsOfAgents = (await (susan as any).agentsOfAgents.toArray())
      .map((a: any) => a.id)
      .sort();
    const susanAgents = await (susan as any).agents.toArray();
    const susanFlatNested = await Promise.all(
      susanAgents.map(async (a: any) => (await a.agents.toArray()).map((aa: any) => aa.id)),
    );
    const susanFlat = susanFlatNested.flat().sort();
    expect(susanAgentsOfAgents).toEqual(susanFlat);
  });

  it("associate existing with nonstandard primary key on belongs to", async () => {
    const mary = await Author.find(authors("mary").id);
    const general = await Category.find(categories("general").id);
    await Categorization.create({
      author_id: mary.id,
      named_category_name: (general as any).name,
    });
    const namedCats = await (mary as any).namedCategories.toArray();
    expect(namedCats.map((c: any) => c.id)).toContain(general.id);
  });

  it("collection build with nonstandard primary key on belongs to", async () => {
    const mary = await Author.find(authors("mary").id);
    const category = await (mary as any).namedCategories.build({ name: "Primary" });
    await mary.save();
    expect(
      await Categorization.exists({
        author_id: mary.id,
        named_category_name: category.name,
      }),
    ).toBe(true);
    const namedCats = await (mary as any).namedCategories.reload();
    expect(namedCats.map((c: any) => c.id)).toContain(category.id);
  });

  it("collection create with nonstandard primary key on belongs to", async () => {
    const mary = await Author.find(authors("mary").id);
    const category = await (mary as any).namedCategories.create({ name: "Primary" });
    expect(
      await Categorization.exists({
        author_id: mary.id,
        named_category_name: category.name,
      }),
    ).toBe(true);
    const namedCats = await (mary as any).namedCategories.reload();
    expect(namedCats.map((c: any) => c.id)).toContain(category.id);
  });

  it("collection exists", async () => {
    const mary = await Author.find(authors("mary").id);
    const category = await Category.create({ name: "Primary" });
    await Categorization.create({ author_id: mary.id, category_id: (category as any).id });
    expect(await (category as any).authors.exists({ id: mary.id })).toBe(true);
    const reloaded = await Category.find((category as any).id);
    expect(await (reloaded as any).authors.exists({ id: mary.id })).toBe(true);
  });

  it("collection delete with nonstandard primary key on belongs to", async () => {
    const mary = await Author.find(authors("mary").id);
    const category = await (mary as any).namedCategories.create({ name: "Primary" });
    await (mary as any).namedCategories.delete(category);
    expect(
      await Categorization.exists({
        author_id: mary.id,
        named_category_name: category.name,
      }),
    ).toBe(false);
    await (mary as any).namedCategories.reload();
    expect(await (mary as any).namedCategories.size()).toBe(0);
  });

  it("collection singular ids getter with string primary keys", async () => {
    const book = await Book.find(books("awdr").id);
    const subIds = await (book as any).subscriberIds;
    expect(subIds.length).toBe(2);
    expect([...subIds].sort()).toEqual(
      [subscribers("first").nick, subscribers("second").nick].sort(),
    );
  });

  it("collection singular ids setter", async () => {
    const company = await Company.find(companies("rails_core").id);
    const dev = (await Developer.first())!;
    await association(company, "developers").setIds([dev.id as number]);
    const devs = await (company as any).developers.toArray();
    expect(devs.map((d: any) => d.id)).toEqual([dev.id]);
  });

  it("collection singular ids setter with required type cast", async () => {
    const company = await Company.find(companies("rails_core").id);
    const dev = (await Developer.first())!;
    await association(company, "developers").setIds([`${dev.id}`]);
    const devs = await (company as any).developers.toArray();
    expect(devs.map((d: any) => d.id)).toEqual([dev.id]);
  });

  it("collection singular ids setter with string primary keys", async () => {
    const book = await Book.find(books("awdr").id);
    const second = await Subscriber.find(subscribers("second").nick);
    await association(book, "subscribers").setIds([second.nick]);
    expect((await (book as any).subscribers.reload()).map((s: any) => s.nick)).toEqual([
      second.nick,
    ]);

    await association(book, "subscribers").setIds([]);
    await (book as any).subscribers.reload();
    expect(await (book as any).subscribers.toArray()).toEqual([]);
  });

  it("collection singular ids setter raises exception when invalid ids set", async () => {
    const company = await Company.find(companies("rails_core").id);
    const dev = (await Developer.first())!;
    const ids = [dev.id as number, -9999];
    await expect(association(company, "developers").setIds(ids)).rejects.toThrow(
      /RecordNotFound|Couldn't find/,
    );
  });

  it("collection singular ids through setter raises exception when invalid ids set", async () => {
    const david = await Author.find(authors("david").id);
    const ids = [(categories("general") as any).name, "Unknown"];
    await expect(association(david, "essayCategories").setIds(ids)).rejects.toThrow(
      /RecordNotFound|Couldn't find/,
    );
  });

  it("build a model from hm through association with where clause", async () => {
    const book = await Book.find(books("awdr").id);
    // Should not raise
    const sub = (book as any).subscribers.where({ nick: "marklazz" }).build();
    expect(sub).toBeDefined();
  });

  it("attributes are being set when initialized from hm through association with where clause", async () => {
    const book = await Book.find(books("awdr").id);
    const newSubscriber = await (book as any).subscribers.where({ nick: "marklazz" }).build();
    expect(newSubscriber.nick).toBe("marklazz");
  });

  it("attributes are being set when initialized from hm through association with multiple where clauses", async () => {
    const book = await Book.find(books("awdr").id);
    const newSubscriber = await (book as any).subscribers
      .where({ nick: "marklazz" })
      .where({ name: "Marcelo Giorgi" })
      .build();
    expect(newSubscriber.nick).toBe("marklazz");
    expect(newSubscriber.name).toBe("Marcelo Giorgi");
  });

  it("include method in association through should return true for instance added with build", async () => {
    const person = new Person();
    const ref = await (person as any).references.build();
    const job = await ref.buildJob();
    expect(await (person as any).jobs.isInclude(job)).toBe(true);
  });

  it("include method in association through should return true for instance added with nested builds", async () => {
    const author = new Author({ name: "Test" });
    const post = await (author as any).posts.build({ title: "t", body: "b" });
    const comment = await post.comments.build({ body: "c" });
    expect(await (author as any).comments.isInclude(comment)).toBe(true);
  });

  it("through association readonly should be false", async () => {
    const michael = await Person.find(people("michael").id);
    const firstPost = await (michael as any).posts.first();
    expect(firstPost.isReadonly()).toBe(false);
    const allPosts = await (michael as any).posts.toArray();
    expect(allPosts[0].isReadonly()).toBe(false);
  });

  it("can update through association", async () => {
    const michael = await Person.find(people("michael").id);
    const firstPost = await (michael as any).posts.first();
    await expect(firstPost.update({ title: "Can write" })).resolves.toBeTruthy();
  });

  it("has many through with source scope", async () => {
    const michaelWelcomeReader = await Reader.find(readers("michael_welcome").id);
    const expectedId = (await michaelWelcomeReader.becomes(LazyReader)).id;
    const first = await Author.first();
    const result = await (first as any).lazyReadersSkimmersOrNot.toArray();
    expect(result.map((r: any) => r.id)).toEqual([expectedId]);
  });

  it.skip("has many through with through scope with includes", async () => {
    const bobWelcomeReader = await Reader.find(readers("bob_welcome").id);
    const expectedId = (await bobWelcomeReader.becomes(LazyReader)).id;
    const last = await Author.last();
    const result = await (last as any).lazyReadersSkimmersOrNot_2.toArray();
    expect(result.map((r: any) => r.id)).toEqual([expectedId]);
  });

  it.skip("has many through with through scope with joins", async () => {
    const bobWelcomeReader = await Reader.find(readers("bob_welcome").id);
    const expectedId = (await bobWelcomeReader.becomes(LazyReader)).id;
    const last = await Author.last();
    const result = await (last as any).lazyReadersSkimmersOrNot_3.toArray();
    expect(result.map((r: any) => r.id)).toEqual([expectedId]);
  });

  it("duplicated has many through with through scope with joins", async () => {
    const david = await Author.find(authors("david").id);
    await Categorization.create({
      author_id: david.id,
      post_id: posts("thinking").id,
      category_id: categories("technology").id,
    });

    const davidWelcomeGeneral = await Categorization.find(
      categorizations("david_welcome_general").id,
    );
    const first = await Author.first();

    const preloadedGeneralCats = (await Author.preload(
      "generalPosts",
      "generalCategorizations",
    ).first())!.generalCategorizations;
    expect(preloadedGeneralCats.map((c: any) => c.id)).toEqual([davidWelcomeGeneral.id]);

    const eagerGeneralCats = (await Author.eagerLoad(
      "generalPosts",
      "generalCategorizations",
    ).first())!.generalCategorizations;
    expect(eagerGeneralCats.map((c: any) => c.id)).toEqual([davidWelcomeGeneral.id]);

    const welcomePost = await Post.find(posts("welcome").id);
    const preloadedGeneralPosts = (await Author.preload(
      "generalCategorizations",
      "generalPosts",
    ).first())!.generalPosts;
    expect(preloadedGeneralPosts.map((p: any) => p.id)).toEqual([welcomePost.id]);

    const eagerGeneralPosts = (await Author.eagerLoad(
      "generalCategorizations",
      "generalPosts",
    ).first())!.generalPosts;
    expect(eagerGeneralPosts.map((p: any) => p.id)).toEqual([welcomePost.id]);
  });

  it.skip("has many through polymorphic with rewhere", async () => {
    const post = await TaggedPost.create({ title: "Tagged", body: "Post" });
    const tag = await (post as any).tags.create({ name: "Tag" });
    const preloaded = (await TaggedPost.preload("tags").last())!.tags;
    expect(preloaded.map((t: any) => t.id)).toEqual([tag.id]);
    const eagerLoaded = (await TaggedPost.eagerLoad("tags").last())!.tags;
    expect(eagerLoaded.map((t: any) => t.id)).toEqual([tag.id]);
  });

  it("has many through polymorphic with primary key option", async () => {
    const david = await Author.find(authors("david").id);
    const general = await Category.find(categories("general").id);
    const essayCats = await (david as any).essayCategories.toArray();
    expect(essayCats.map((c: any) => c.id)).toEqual([general.id]);

    const joinedAuthors = await Author.joins("essayCategories").where({
      "categories.id": general.id,
    });
    expect(joinedAuthors.map((a: any) => a.id)).toContain(david.id);

    const blackbeard = await Owner.find(owners("blackbeard").id);
    const essayOwners = await (david as any).essayOwners.toArray();
    expect(essayOwners.map((o: any) => o.id)).toEqual([blackbeard.id]);

    const ownersAuthors = await Author.joins("essayOwners").where({ "owners.name": "blackbeard" });
    expect(ownersAuthors.map((a: any) => a.id)).toContain(david.id);
  });

  it("has many through with primary key option", async () => {
    const david = await Author.find(authors("david").id);
    const general = await Category.find(categories("general").id);
    const essayCats2 = await (david as any).essayCategories_2.toArray();
    expect(essayCats2.map((c: any) => c.id)).toEqual([general.id]);

    const joinedAuthors = await Author.joins("essayCategories_2").where({
      "categories.id": general.id,
    });
    expect(joinedAuthors.map((a: any) => a.id)).toContain(david.id);
  });

  it("size of through association should increase correctly when has many association is added", async () => {
    const post = await Post.find(posts("thinking").id);
    const michael = await Person.find(people("michael").id);
    const readersBefore = await (post as any).readers.count();
    await (post as any).people.push(michael);
    expect(await (post as any).readers.count()).toBe(readersBefore + 1);
  });

  it("has many through with default scope on join model", async () => {
    const david = await Author.find(authors("david").id);
    const welcome = await Post.find(posts("welcome").id);
    const commentsOnFirst = await (david as any).commentsOnFirstPosts.toArray();
    const welcomeComments = await (welcome as any).comments.order("id").toArray();
    expect(commentsOnFirst.map((c: any) => c.id)).toEqual(welcomeComments.map((c: any) => c.id));
  });

  it("create has many through with default scope on join model", async () => {
    const david = await Author.find(authors("david").id);
    const category = await (david as any).specialCategories.create({ name: "Foo" });
    expect(await category.categorizations.where({ special: true }).count()).toBe(1);
  });

  it("joining has many through with distinct", async () => {
    const mary = await Author.joins("uniqueCategorizedPosts")
      .where({ id: authors("mary").id })
      .first();
    expect(await (mary as any).uniqueCategorizedPosts.size()).toBe(1);
    expect((await (mary as any).uniqueCategorizedPostIds).length).toBe(1);
  });

  it("joining has many through belongs to", async () => {
    const maryCatId = categorizations("mary_thinking_sti").id;
    const postList = await Post.joins("authorCategorizations")
      .order("posts.id")
      .where({ "categorizations.id": maryCatId });
    expect(postList.map((p: any) => p.id)).toEqual([
      posts("eager_other").id,
      posts("misc_by_mary").id,
      posts("other_by_mary").id,
    ]);
  });

  it("select chosen fields only", async () => {
    const david = await Author.find(authors("david").id);
    const first = await (david as any).comments.select("comments.body").first();
    const keys = Object.keys(first.attributes).sort();
    expect(keys).toEqual(["body", "id"].sort());
  });

  it("get has many through belongs to ids with conditions", async () => {
    const mary = await Author.find(authors("mary").id);
    const ids = await (mary as any).categoriesLikeGeneralIds;
    expect([...ids]).toEqual([categories("general").id]);
  });

  it("get collection singular ids on has many through with conditions and include", async () => {
    const person = await Person.first();
    const noCommentIds = await (person as any).postsWithNoCommentIds;
    const noComments = await (person as any).postsWithNoComments.toArray();
    expect([...noCommentIds].sort()).toEqual(noComments.map((p: any) => p.id).sort());
  });

  it("count has many through with named scope", async () => {
    const mary = await Author.find(authors("mary").id);
    expect(await (mary as any).categories.count()).toBe(2);
    expect(await (mary as any).categories.general().count()).toBe(1);
  });

  it("has many through belongs to should update when the through foreign key changes", async () => {
    const post = await Post.find(posts("eager_other").id);

    await (post as any).authorCategorizations.toArray();
    const proxy = (post as any).association("authorCategorizations");

    expect(proxy.isStaleTarget()).toBe(false);
    const mary = await Author.find(authors("mary").id);
    const maryCats = await (mary as any).categorizations.toArray();
    const postCats = await (post as any).authorCategorizations.toArray();
    expect(postCats.map((c: any) => c.id).sort()).toEqual(maryCats.map((c: any) => c.id).sort());

    (post as any).author_id = authors("david").id;

    expect(proxy.isStaleTarget()).toBe(true);
    const david = await Author.find(authors("david").id);
    const davidCats = await (david as any).categorizations.toArray();
    const updatedCats = await (post as any).authorCategorizations.toArray();
    expect(updatedCats.map((c: any) => c.id).sort()).toEqual(
      davidCats.map((c: any) => c.id).sort(),
    );
  });

  it("create with conditions hash on through association", async () => {
    const groucho = await Member.find(members("groucho").id);
    const club = await (groucho as any).clubs.create({});
    const reloaded = await Club.find(club.id);
    expect((await (reloaded as any).membership).favorite).toBe(true);
  });

  it("deleting from has many through a belongs to should not try to update counter", async () => {
    const post = await Post.find(posts("welcome").id);
    const address = await AuthorAddress.find(authorAddresses("david_address").id);

    const postAddresses = await (post as any).authorAddresses.toArray();
    expect(postAddresses.map((a: any) => a.id)).toContain(address.id);
    await (post as any).authorAddresses.delete(address);
    expect((post as any)["author_count"]).toBeUndefined();
  });

  it("primary key option on source", async () => {
    const post = await Post.find(posts("welcome").id);
    const general = await Category.find(categories("general").id);
    await Categorization.create({
      post_id: post.id,
      named_category_name: (general as any).name,
    });

    const namedCats = await (post as any).namedCategories.toArray();
    expect(namedCats.map((c: any) => c.id)).toEqual([general.id]);

    const namedIds = await (post as any).namedCategoryIds;
    expect([...namedIds]).toEqual([(general as any).name]);

    const reloaded = await Post.find(posts("welcome").id);
    const reloadedIds = await (reloaded as any).namedCategoryIds;
    expect([...reloadedIds]).toEqual([(general as any).name]);
  });

  it("create should not raise exception when join record has errors", async () => {
    (Categorization as any).validate((r: any) => r.errors.add("base", "Invalid Categorization"));
    try {
      const firstAuthor = await Author.first();
      // Should not throw
      await expect(
        Category.create({ name: "Fishing", authors: [firstAuthor] }),
      ).resolves.toBeDefined();
    } finally {
      (Categorization as any).clearValidatorsBang();
    }
  });

  it("assign array to new record builds join records", async () => {
    const firstAuthor = await Author.first();
    const c = new Category({ name: "Fishing", authors: [firstAuthor] });
    expect(await (c as any).categorizations.size()).toBe(1);
  });

  it("create bang should raise exception when join record has errors", async () => {
    (Categorization as any).validate((r: any) => r.errors.add("base", "Invalid Categorization"));
    try {
      const firstAuthor = await Author.first();
      await expect(
        Category.createBang({ name: "Fishing", authors: [firstAuthor] }),
      ).rejects.toThrow(RecordInvalid);
    } finally {
      (Categorization as any).clearValidatorsBang();
    }
  });

  it("save bang should raise exception when join record has errors", async () => {
    (Categorization as any).validate((r: any) => r.errors.add("base", "Invalid Categorization"));
    try {
      const firstAuthor = await Author.first();
      const c = new Category({ name: "Fishing", authors: [firstAuthor] });
      await expect(c.saveBang()).rejects.toThrow(RecordInvalid);
    } finally {
      (Categorization as any).clearValidatorsBang();
    }
  });

  it("save returns falsy when join record has errors", async () => {
    (Categorization as any).validate((r: any) => r.errors.add("base", "Invalid Categorization"));
    try {
      const firstAuthor = await Author.first();
      const c = new Category({ name: "Fishing", authors: [firstAuthor] });
      expect(await c.save()).toBeFalsy();
    } finally {
      (Categorization as any).clearValidatorsBang();
    }
  });

  it.skip("preloading empty through association via joins", async () => {
    const readerId = readers("michael_welcome").id;
    const person = await Person.create({ first_name: "Gaga" });
    const loaded = await Person.where({ id: person.id })
      .where(`readers.id = ${readerId} or 1=1`)
      .references("readers")
      .includes("posts");
    const p = loaded[0];
    expect((p as any).posts.loaded).toBe(true);
    expect(await (p as any).posts.toArray()).toEqual([]);
  });

  it.skip("preloading empty through with polymorphic source association", async () => {
    const owner = await Owner.create({ name: "Rainbow Unicat" });
    const pet = await Pet.create({ owner_id: owner.id });
    const person = await Person.create({ first_name: "Gaga" });
    const treasure = await Treasure.create({ looter_type: "Person", looter_id: person.id });
    const nonLootedTreasure = await Treasure.create({});
    await PetTreasure.create({
      pet_id: pet.id,
      treasure_id: treasure.id,
      rainbow_color: "Ultra violet indigo",
    });
    await PetTreasure.create({
      pet_id: pet.id,
      treasure_id: nonLootedTreasure.id,
      rainbow_color: "Ultra violet indigo",
    });

    const result = await Owner.where({ name: "Rainbow Unicat" })
      .includes({ pets: "persons" })
      .first();
    const persons = await (result as any).persons.toArray();
    expect(persons.map((p: any) => p.id)).toEqual([person.id]);
  });

  it("explicitly joining join table", async () => {
    const blackbeard = await Owner.find(owners("blackbeard").id);
    const toys1 = await (blackbeard as any).toys.toArray();
    const toys2 = await (blackbeard as any).toys.withPet().toArray();
    expect(toys2.map((t: any) => t.id).sort()).toEqual(toys1.map((t: any) => t.id).sort());
  });

  it.skip("has many through with polymorphic source", async () => {
    const general = await Tag.find(tags("general").id);
    const post = await (general as any).taggedPosts.create({ title: "foo", body: "bar" });
    const reloaded = await Post.find(post.id);
    const postTags = await (reloaded as any).tags.toArray();
    expect(postTags.map((t: any) => t.id)).toEqual([general.id]);
  });

  it("has many through with polymorhic join model", async () => {
    const zine = await Zine.create({});

    const human = await (zine as any).polymorphicHumans.build();
    await human.save();

    expect(await (zine as any).polymorphicHumans.count()).toBe(1);
    expect(await (zine as any).interests.count()).toBe(1);
  });

  it("has many through obeys order on through association", async () => {
    const blackbeard = await Owner.find(owners("blackbeard").id);
    const sql = await (blackbeard as any).toys.toSql();
    expect(sql).toContain("pets.name desc");
    const toyNames = (await (blackbeard as any).toys.toArray()).map(async (t: any) => {
      const pet = await t.pet;
      return pet?.name;
    });
    expect(await Promise.all(toyNames)).toEqual(["parrot", "bulbul"]);
  });

  it("has many through associations sum on columns", async () => {
    const post1 = await Post.create({ title: "active", body: "sample" });
    const post2 = await Post.create({ title: "inactive", body: "sample" });

    const p1 = await Person.create({ first_name: "aaron", followers_count: 1 });
    const p2 = await Person.create({ first_name: "schmit", followers_count: 2 });
    const p3 = await Person.create({ first_name: "bill", followers_count: 3 });
    const p4 = await Person.create({ first_name: "cal", followers_count: 4 });

    for (const p of [p1, p2, p3, p4]) {
      await Reader.create({ post_id: post1.id, person_id: p.id });
      await Reader.create({ post_id: post2.id, person_id: p.id });
    }

    const activePersons = await Person.joins("readers")
      .joins("posts")
      .distinct()
      .where({ "posts.title": "active" });
    const sum = activePersons.reduce((acc: number, p: any) => acc + p.followers_count, 0);
    expect(sum).toBe(10);
    expect(
      await Person.joins("readers")
        .joins("posts")
        .distinct()
        .where({ "posts.title": "active" })
        .sum("followers_count"),
    ).toBe(10);
  });

  it("has many through associations on new records use null relations", async () => {
    const person = new Person();
    expect(await (person as any).posts.toArray()).toEqual([]);
    expect(await (person as any).posts.where({ body: "omg" }).toArray()).toEqual([]);
    expect(await (person as any).posts.pluck("body")).toEqual([]);
    expect(await (person as any).posts.sum("tags_count")).toBe(0);
    expect(await (person as any).posts.count()).toBe(0);
  });

  it("has many through with default scope on the target", async () => {
    const michael = await Person.find(people("michael").id);
    const firstPosts = await (michael as any).firstPosts.toArray();
    expect(firstPosts.map((p: any) => p.id)).toEqual([posts("thinking").id]);

    const michaelAuthorless = await Reader.find(readers("michael_authorless").id);
    await michaelAuthorless.update({ first_post_id: 1 });
    const reloaded = await Person.find(people("michael").id);
    const firstPostsReloaded = await (reloaded as any).firstPosts.toArray();
    expect(firstPostsReloaded.map((p: any) => p.id)).toEqual([posts("thinking").id]);
  });

  it("has many through with includes in through association scope", async () => {
    const welcome = await Post.find(posts("welcome").id);
    const extra = await (welcome as any).authorAddressExtraWithAddress.toArray();
    expect(extra.length).toBeGreaterThan(0);
  });

  it("insert records via has many through association with scope", async () => {
    const club = await Club.create({});
    const member = await Member.create({});
    await Membership.create({ club_id: club.id, member_id: member.id });

    await (club as any).favorites.push(member);
    expect((await (club as any).favorites.toArray()).map((m: any) => m.id)).toEqual([member.id]);

    await club.reload();
    expect((await (club as any).favorites.toArray()).map((m: any) => m.id)).toEqual([member.id]);
  });

  it("insert records via has many through association with scope and association name different from the joining table name", async () => {
    const club = await Club.create({});
    const member = await Member.create({});
    await Membership.create({ club_id: club.id, member_id: member.id });

    await (club as any).customFavorites.push(member);
    expect((await (club as any).customFavorites.toArray()).map((m: any) => m.id)).toEqual([
      member.id,
    ]);

    await club.reload();
    expect((await (club as any).customFavorites.toArray()).map((m: any) => m.id)).toEqual([
      member.id,
    ]);
  });

  it.skip("has many through unscope default scope", async () => {
    const post = await Post.create({ title: "Beaches", body: "I like beaches!" });
    const david = await Person.find(people("david").id);
    const susan = await Person.find(people("susan").id);
    await Reader.create({ person_id: david.id, post_id: post.id });
    await LazyReader.create({ person_id: susan.id, post_id: post.id });

    expect(await (post as any).people.toArray()).toHaveLength(2);
    expect(await (post as any).lazyPeople.toArray()).toHaveLength(1);

    expect(await (post as any).lazyReadersUnscopeSkimmers.toArray()).toHaveLength(2);
    expect(await (post as any).lazyPeopleUnscopeSkimmers.toArray()).toHaveLength(2);
  });

  it("has many through add with sti middle relation", async () => {
    const club = await SuperClub.create({ name: "Fight Club" });
    const member = await Member.create({ name: "Tyler Durden" });

    await (club as any).members.push(member);
    expect(await SuperMembership.where({ member_id: member.id, club_id: club.id }).count()).toBe(1);
  });

  it("build for has many through association", async () => {
    const nsa = await Organization.find(organizations("nsa").id);
    const author = await nsa.association("author").loadTarget();
    const postDirect = await (author as any).posts.build();
    const postThrough = await (nsa as any).posts.build();
    expect(postDirect.author_id).toBe(postThrough.author_id);
  });

  it("has many through with scope that should not be fully merged", async () => {
    Club.hasMany("distinctMemberships", {
      scope: (q: any) => q.distinct(),
      className: "Membership",
    });
    Club.hasMany("specialFavorites", {
      through: "distinctMemberships",
      source: "member",
    });
    const newClub = new Club();
    const val = (newClub as any).specialFavorites.distinctValue;
    expect(val).toBeUndefined();
  });

  it("has many through do not cache association reader if the though method has default scopes", async () => {
    const member = await Member.create({});
    const club = await Club.create({});
    await TenantMembership.create({ member_id: member.id, club_id: club.id });

    TenantMembership.currentMember = member;
    try {
      const tenantClubs = await (member as any).tenantClubs.toArray();
      expect(tenantClubs.map((c: any) => c.id)).toEqual([club.id]);

      TenantMembership.currentMember = null;

      const otherMember = await Member.create({});
      const otherClub = await Club.create({});
      await TenantMembership.create({ member_id: otherMember.id, club_id: otherClub.id });

      const otherTenantClubs = await (otherMember as any).tenantClubs.toArray();
      expect(otherTenantClubs.map((c: any) => c.id)).toEqual([otherClub.id]);
    } finally {
      TenantMembership.currentMember = null;
    }
  });

  it.skip("has many through with scope that has joined same table with parent relation", async () => {
    const david = await Author.find(authors("david").id);
    const result = await Author.joins("commentsForFirstAuthor").take();
    expect(result?.id).toBe(david.id);
  });

  it("has many through with left joined same table with through table", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOther = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).comments.leftJoins("post").toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOther.id]);
  });

  it("has many through with unscope should affect to through scope", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOther = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).unorderedComments.toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOther.id]);
  });

  it.skip("has many through with scope should accept string and hash join", async () => {
    const david = await Author.find(authors("david").id);
    const result = await Author.joins({
      commentsForFirstAuthor: "post",
    })
      .joins("inner join posts posts_alias on authors.id = posts_alias.author_id")
      .eagerLoad("categories")
      .take();
    expect(result?.id).toBe(david.id);
  });

  it("has many through with scope should respect table alias", async () => {
    const family = await Family.create({});
    const users = await Promise.all([User.create({}), User.create({}), User.create({})]);
    await FamilyTree.create({ member_id: users[0].id, family_id: family.id });
    await FamilyTree.create({ member_id: users[1].id, family_id: family.id });
    await FamilyTree.create({ member_id: users[2].id, family_id: family.id, token: "wat" });

    expect(await (users[0] as any).familyMembers.toArray()).toHaveLength(2);
    expect(await (users[2] as any).familyMembers.toArray()).toHaveLength(0);
  });

  describe("through scope (canonical)", () => {
    const { authors: canonicalAuthors } = fixtures(["authors", "posts", "comments"], {
      schema: canonicalSchema,
    });

    beforeAll(async () => {
      registerModel([Author, Post, FirstPost, Comment]);
    });

    const ids = (records: any[]) =>
      records.map((r: any) => r.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    it("through scope is affected by unscoping", async () => {
      const author = canonicalAuthors("david");
      const expected = ids(await association(author, "comments").toArray());

      const inside = await FirstPost.unscoped(async () => {
        await author.reload();
        return association(author, "commentsOnFirstPosts").toArray();
      });

      expect(ids(inside)).toEqual(expected);
      expect(inside.length).toBeGreaterThan(1);
    });

    it("through scope isnt affected by scoping", async () => {
      const author = canonicalAuthors("david");
      const expected = ids(await association(author, "commentsOnFirstPosts").toArray());

      const inside = await FirstPost.where({ id: 2 }).scoping(async () => {
        await author.reload();
        return association(author, "commentsOnFirstPosts").toArray();
      });

      expect(ids(inside)).toEqual(expected);
    });
  });

  it("incorrectly ordered through associations", async () => {
    await expect(
      DeveloperWithIncorrectlyOrderedHasManyThrough.create({
        companies: [await Company.create({})],
      }),
    ).rejects.toThrow();
  });

  it("has many through update ids with conditions", async () => {
    const author = await Author.create({ name: "Bill" });
    const general = await Category.find(categories("general").id);

    await author.update({
      specialCategoriesWithConditionIds: [general.id],
      nonspecialCategoriesWithConditionIds: [general.id],
    });

    expect(await (author as any).specialCategoriesWithConditionIds).toEqual([general.id]);
    expect(await (author as any).nonspecialCategoriesWithConditionIds).toEqual([general.id]);

    await author.update({ nonspecialCategoriesWithConditionIds: [] });
    await author.reload();

    expect(await (author as any).specialCategoriesWithConditionIds).toEqual([general.id]);
    expect(await (author as any).nonspecialCategoriesWithConditionIds).toEqual([]);
  });

  it("single has many through association with unpersisted parent instance", async () => {
    class PostWithSingleHasManyThrough extends Post {
      static {
        this.hasMany("subscriptions", { through: "author" });
      }
    }
    registerModel("PostWithSingleHasManyThrough", PostWithSingleHasManyThrough);

    const post = new PostWithSingleHasManyThrough();
    const mary = await Author.find(authors("mary").id);
    (post as any).author = mary;
    const book1 = await Book.create({ name: "essays on single has many through associations 1" });
    await (mary as any).books.push(book1);
    const sub1 = (await Subscription.first())!;
    await (book1 as any).subscriptions.push(sub1);
    const subs = await (post as any).subscriptions.toArray();
    expect(subs.map((s: any) => s.id)).toContain(sub1.id);

    const bob = await Author.find(authors("bob").id);
    (post as any).author = bob;
    const book2 = await Book.create({ name: "essays on single has many through associations 2" });
    await (bob as any).books.push(book2);
    const sub2 = (await Subscription.second())!;
    await (book2 as any).subscriptions.push(sub2);
    const subs2 = await (post as any).subscriptions.toArray();
    expect(subs2.map((s: any) => s.id)).toContain(sub2.id);
  });

  it("nested has many through association with unpersisted parent instance", async () => {
    class PostWithNestedHasManyThrough extends Post {
      static {
        this.hasMany("books", { through: "author" });
        this.hasMany("subscriptions", { through: "books" });
      }
    }
    registerModel("PostWithNestedHasManyThrough", PostWithNestedHasManyThrough);

    const post = new PostWithNestedHasManyThrough();
    const mary = await Author.find(authors("mary").id);
    (post as any).author = mary;
    const book1 = await Book.create({ name: "essays on nested has many through associations 1" });
    await (mary as any).books.push(book1);
    const sub1 = (await Subscription.first())!;
    await (book1 as any).subscriptions.push(sub1);
    const subs = await (post as any).subscriptions.toArray();
    expect(subs.map((s: any) => s.id)).toContain(sub1.id);

    const bob = await Author.find(authors("bob").id);
    (post as any).author = bob;
    const book2 = await Book.create({ name: "essays on nested has many through associations 2" });
    await (bob as any).books.push(book2);
    const sub2 = (await Subscription.second())!;
    await (book2 as any).subscriptions.push(sub2);
    const subs2 = await (post as any).subscriptions.toArray();
    expect(subs2.map((s: any) => s.id)).toContain(sub2.id);
  });

  it("child is visible to join model in add association callbacks", async () => {
    for (const callbackName of ["beforeAdd", "afterAdd"] as const) {
      class SentientTreasure extends Treasure {
        static {
          this.hasMany("petTreasures", {
            foreignKey: "treasure_id",
            [callbackName]: async (owner: any, added: any) => {
              const pet = await added.association("pet").loadTarget();
              if (!pet) throw new Error("No pet!");
            },
          });
          this.hasMany("pets", { through: "petTreasures" });
        }
      }
      registerModel("SentientTreasure", SentientTreasure);

      const treasure = new SentientTreasure();
      const mochi = await Pet.find(pets("mochi").id);
      await expect((treasure as any).pets.push(mochi)).resolves.toBeDefined();
    }
  });

  it("circular autosave association correctly saves multiple records", async () => {
    const cs180 = new Seminar({ name: "CS180" });
    const fall = new Session({ name: "Fall" });
    const sections = [
      await (cs180 as any).sections.build({ short_name: "A" }),
      await (cs180 as any).sections.build({ short_name: "B" }),
    ];
    await (fall as any).sections.push(...sections);
    await fall.save();
    await fall.reload();
    const fallSections = (await (fall as any).sections.toArray()).sort(
      (a: any, b: any) => Number(a.id) - Number(b.id),
    );
    const expectedIds = sections.map((s: any) => s.id).sort();
    expect(fallSections.map((s: any) => s.id).sort()).toEqual(expectedIds);
  });

  it.skip("post has many tags through association with composite query constraints", async () => {
    const blogPost = await ShardedBlogPost.find(shardedBlogPosts("great_post_blog_one").id);
    const expectedTagIds = (
      await ShardedBlogPostTag.where({
        blog_post_id: (blogPost as any).id,
        blog_id: (blogPost as any).blog_id,
      })
    ).map((t: any) => t.tag_id);

    const tagIds: any[] = [];
    // Capture SQL by wrapping
    const originalAll = (ShardedBlogPost.prototype as any).tags?.toArray;
    const tags2 = await (blogPost as any).tags.toArray();
    for (const t of tags2) tagIds.push(t.id);

    const quotedTagsBlogId = quoteTableName("sharded_tags.blog_id");
    const quotedPostsTagsBlogId = quoteTableName("sharded_blog_posts_tags.blog_id");
    const tagsSql = await (blogPost as any).tags.toSql();
    expect(tagsSql).toMatch(
      new RegExp(`ON.*${quotedTagsBlogId} = ${quotedPostsTagsBlogId}.*WHERE`, "i"),
    );
    expect(tagsSql).toMatch(new RegExp(`WHERE.*${quotedPostsTagsBlogId}`, "i"));

    expect(tagIds.length).toBeGreaterThan(0);
    expect([...tagIds].sort()).toEqual([...expectedTagIds].sort());
  });

  it("tags has manu posts through association with composite query constraints", async () => {
    const tag = await ShardedTag.find(shardedTags("short_read_blog_one").id);
    const expectedBlogPostIds = (
      await ShardedBlogPostTag.where({
        tag_id: (tag as any).id,
        blog_id: (tag as any).blog_id,
      })
    ).map((t: any) => t.blog_post_id);

    const blogPosts2 = await (tag as any).blogPosts.toArray();
    const blogPostIds = blogPosts2.map((p: any) => p.id);

    const quotedBlogPostsBlogId = quoteTableName("sharded_blog_posts.blog_id");
    const quotedPostsTagsBlogId = quoteTableName("sharded_blog_posts_tags.blog_id");
    const blogPostsSql = await (tag as any).blogPosts.toSql();
    expect(blogPostsSql).toMatch(
      new RegExp(`ON.*${quotedBlogPostsBlogId} = ${quotedPostsTagsBlogId}.*WHERE`, "i"),
    );
    expect(blogPostsSql).toMatch(new RegExp(`WHERE.*${quotedPostsTagsBlogId}`, "i"));

    expect(blogPostIds.length).toBeGreaterThan(0);
    expect([...blogPostIds].map(Number).sort()).toEqual(
      [...expectedBlogPostIds].map(Number).sort(),
    );
  });

  it("loading cpk association with unpersisted owner", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = new (await import("../test-helpers/models/cpk.js").then(
      (m) => m.CpkBookWithOrderAgreements,
    ))({
      id: [1, 2],
    });
    (book as any).order = order;
    const agreement = await (
      await import("../test-helpers/models/cpk.js").then((m) => m.CpkOrderAgreement)
    ).create({ order_id: (order as any).idValue });
    const agreements = await (book as any).orderAgreements.toArray();
    expect(agreements.map((a: any) => a.id)).toEqual([agreement.id]);
  });

  it("cpk stale target", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = await (
      await import("../test-helpers/models/cpk.js").then((m) => m.CpkBookWithOrderAgreements)
    ).create({
      id: [1, 2],
      order_id: (order as any).idValue,
    });
    await (
      await import("../test-helpers/models/cpk.js").then((m) => m.CpkOrderAgreement)
    ).create({ order_id: (order as any).idValue });

    await (book as any).orderAgreements.load();
    (book as any).order = new CpkOrder();

    expect((book as any).association("orderAgreements").isStaleTarget()).toBe(true);
  });

  it.skip("cpk association build through singular", async () => {
    const { CpkOrderWithSingularBookChapters } = await import("../test-helpers/models/cpk.js");
    const order = await CpkOrderWithSingularBookChapters.create({ id: [1, 2] });
    const book = await (order as any).createBook({ id: [3, 4] });
    const chapter = await (order as any).chapters.build();
    const chapterBook = await chapter.association("book").loadTarget();
    expect(chapterBook?.id).toEqual(book.id);
  });

  // TS-only: insertRecord with validate false skips join record validation
  it("insertRecord with validate false skips join record validation", async () => {
    class IrpvTagging extends Base {
      static {
        this._tableName = "taggings";
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("tag_id", "integer");
        (this as any).validates((r: any) => {
          r.errors.add("base", "Join always invalid");
        });
        this.belongsTo("tag", { className: "Tag", foreignKey: "tag_id" });
      }
    }
    registerModel("IrpvTagging", IrpvTagging);

    const post = await Post.create({ title: "Test", body: "" });
    const tag = await Tag.create({ name: "testjoin" });

    class IrpvPost extends Base {
      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.hasMany("irpvTaggings", { className: "IrpvTagging", foreignKey: "taggable_id" });
        this.hasMany("irpvTags", { through: "irpvTaggings", source: "tag", className: "Tag" });
      }
    }
    registerModel("IrpvPost", IrpvPost);

    const irpvPost = await IrpvPost.find(post.id);
    const assoc = (irpvPost as any).association("irpvTags");
    const result = await assoc.insertRecord(tag, false, false);
    expect(result).toBe(true);
    expect(await IrpvTagging.where({ taggable_id: post.id }).count()).toBe(1);
  });

  // TS-only: loads through a join model
  it("loads through a join model", async () => {
    const post = await Post.find(posts("welcome").id);
    const tagsBefore = await (post as any).tags.toArray();
    expect(tagsBefore.length).toBeGreaterThan(0);

    const tag = tagsBefore[0];
    const postTags2 = await Post.joins("tags").where({ id: post.id });
    expect(postTags2.length).toBeGreaterThan(0);
    expect(postTags2.map((p: any) => p.id)).toContain(post.id);
  });

  // TS-only: delete_all for with dependent option delete_all
  it("delete_all for with dependent option delete_all", async () => {
    const person = await Person.find(people("michael").id);
    const countBefore = await (person as any).jobsWithDependentDeleteAll.count();
    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).jobsWithDependentDeleteAll.deleteAll();
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(Number(refCountBefore) - Number(countBefore));
  });

  // TS-only: delete_all for with dependent option nullify
  it.skip("delete_all for with dependent option nullify", async () => {
    const person = await Person.find(people("michael").id);
    const countBefore = await (person as any).jobsWithDependentNullify.count();
    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).jobsWithDependentNullify.deleteAll();
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(refCountBefore);
  });
});
