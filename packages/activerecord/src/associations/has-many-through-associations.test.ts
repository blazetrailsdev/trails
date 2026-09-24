import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { Base, registerModel, RecordInvalid, RecordNotFound, RecordNotSaved } from "../index.js";
import { fixtures } from "../test-fixtures.js";
import { collectionProxyFor as association } from "../associations.js";
import {
  assertDeprecated,
  assertDifference,
  assertEmpty,
  assertNotEmpty,
  assertNoDifference,
  assertNothingRaised,
  assertRaises,
} from "@blazetrails/activesupport";
import { assertQueriesCount, assertNoQueries } from "../testing/query-assertions.js";
import { HasManyThroughCantAssociateThroughHasOneOrManyReflection } from "./errors.js";
import { AssociationTypeMismatch } from "../errors.js";
import { deprecator } from "../deprecator.js";
import { Preloader } from "./preloader.js";
import { quoteTableName } from "../support/quote-regex.js";

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

async function assertNotCalled(block: () => Promise<void>): Promise<void> {
  const spy = vi.spyOn(Preloader.prototype, "call");
  try {
    await block();
    expect(spy).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
}

describe("HasManyThroughAssociationsTest", () => {
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
  } = fixtures([
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
  ]);

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

  beforeEach(async () => {
    await Person.create({ first_name: "gummy" });
    await Reader.create({ person_id: 0, post_id: 0 });
  });

  it("has many through create record", async () => {
    const book = await Book.find(books("awdr").id);
    expect(await (book as any).subscribers.createBang({ nick: "bob" })).toBeTruthy();
  });

  it.skip("marshal dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  it("through association with joins", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOtherComment = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).comments.merge(Post.joins(":comments")).toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOtherComment.id]);
  });

  it("through association with left joins", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOtherComment = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).comments.merge(Post.leftOuterJoins(":comments")).toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOtherComment.id]);
  });

  it("through association with through scope and nested where", async () => {
    const company = await Company.create({ name: "special" });
    const developer = await SpecialDeveloper.create({});
    await SpecialContract.create({
      company: company,
      specialDeveloper: developer,
    });
    const result = await (company as any).specialDevelopers
      .where()
      .not({ "contracts.id": null })
      .toArray();
    expect(result.map((d: any) => d.id)).toEqual([developer.id]);
  });

  it("preload with nested association", async () => {
    const postList = await Post.where({ id: [authors("david").id, authors("mary").id] })
      .preload(":author", ":authorFavoritesWithScope")
      .order("id");

    await assertNoQueries(false, async () => {
      postList.forEach((p: any) => p.author);
      postList.forEach((p: any) => p.authorFavoritesWithScope);
      expect(await (postList[0] as any).authorFavoritesWithScope.length()).toEqual(1);
    });
  });

  it("preload sti rhs class", async () => {
    const developers = await Developer.includes(":firms").all();
    await assertNoQueries(false, async () => {
      developers.forEach((d: any) => d.firms);
    });
  });

  it("preload sti middle relation", async () => {
    const club = await Club.create({ name: "Aaron cool banana club" });
    const member1 = await Member.create({ name: "Aaron" });
    const member2 = await Member.create({ name: "Cat" });
    await SuperMembership.create({ club_id: club.id, member_id: member1.id });
    await CurrentMembership.create({ club_id: club.id, member_id: member2.id });

    const club1 = await Club.includes(":members").findBy({ id: club.id });
    const clubMembers = ((club1 as any).members as any[]).sort(
      (a: any, b: any) => Number(a.id) - Number(b.id),
    );
    const expected = [member1, member2].sort((a, b) => Number(a.id) - Number(b.id));
    expect(clubMembers.map((m: any) => m.id)).toEqual(expected.map((m) => m.id));
  });

  it("preload multiple instances of the same record", async () => {
    const club = await Club.createBang({ name: "Aaron cool banana club" });
    await Membership.createBang({
      club_id: club.id,
      member_id: (await Member.createBang({ name: "Aaron" })).id,
    });
    await Membership.createBang({
      club_id: club.id,
      member_id: (await Member.createBang({ name: "Bob" })).id,
    });

    const preloadedClubs = await Club.joins(":memberships").preload(":membership");
    await assertNoQueries(false, async () => {
      preloadedClubs.forEach((c: any) => c.membership);
    });
  });

  it("ordered has many through", async () => {
    class PersonPrime extends Base {
      declare readers: AssociationProxy<Reader>;
      declare posts: AssociationProxy<Post>;

      static {
        this._tableName = "people";
        this.hasMany("readers", { foreignKey: "person_id" });
        this.hasMany("posts", (q: any) => q.order("posts.id DESC"), {
          through: "readers",
          className: "Post",
        });
      }
    }
    registerModel("PersonPrime", PersonPrime);

    const posts = await (PersonPrime as any)
      .includes(":posts")
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
    class NoPkLesson extends Base {
      declare name: string | null;
      declare lessonStudents: AssociationProxy<NoPkLessonStudent>;
      declare students: AssociationProxy<Base>;

      static {
        this._tableName = "lessons";
        this.attribute("name", "string");
        this.hasMany("lessonStudents", { className: "NoPkLessonStudent", foreignKey: "lesson_id" });
        this.hasMany("students", { through: "lessonStudents", className: "NoPkStudent" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class NoPkLessonStudent extends Base {
      declare lesson_id: bigint | null;
      declare student_id: bigint | null;

      static {
        this._tableName = "lessons_students";
        this.attribute("lesson_id", "big_integer");
        this.attribute("student_id", "big_integer");
        this.belongsTo("student", { className: "NoPkStudent", foreignKey: "student_id" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface NoPkLessonStudent {
      get student(): NoPkStudent | null | Promise<NoPkStudent | null>;
      set student(value: NoPkStudent | null);
    }
    class NoPkStudent extends Base {
      declare name: string | null;

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
    expect(await sicp.saveBang()).toBeTruthy();
  });

  it("no pk join table delete", async () => {
    class NoPkDelLesson extends Base {
      declare name: string | null;
      declare lessonStudents: AssociationProxy<NoPkDelLessonStudent>;
      declare students: AssociationProxy<Base>;

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class NoPkDelLessonStudent extends Base {
      declare lesson_id: bigint | null;
      declare student_id: bigint | null;

      static {
        this._tableName = "lessons_students";
        this.attribute("lesson_id", "big_integer");
        this.attribute("student_id", "big_integer");
        this.belongsTo("student", { className: "NoPkDelStudent", foreignKey: "student_id" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface NoPkDelLessonStudent {
      get student(): NoPkDelStudent | null | Promise<NoPkDelStudent | null>;
      set student(value: NoPkDelStudent | null);
    }
    class NoPkDelStudent extends Base {
      declare name: string | null;

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
    expect(await sicp.saveBang()).toBeTruthy();

    await (sicp as any).students.reload();
    expect(await NoPkDelLessonStudent.count()).toBeGreaterThanOrEqual(2);
    await assertNoDifference(
      async () => Number(await NoPkDelStudent.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await NoPkDelLessonStudent.count()),
          -2,
          null,
          async () => {
            await (sicp as any).students.destroy(...(await NoPkDelStudent.all()));
          },
        );
      },
    );
  });

  it("no pk join model callbacks", async () => {
    class NoPkCbLesson extends Base {
      declare name: string | null;
      declare lessonStudents: AssociationProxy<NoPkCbLessonStudent>;
      declare students: AssociationProxy<Base>;

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class NoPkCbLessonStudent extends Base {
      declare lesson_id: bigint | null;
      declare student_id: bigint | null;

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface NoPkCbLessonStudent {
      get student(): NoPkCbStudent | null | Promise<NoPkCbStudent | null>;
      set student(value: NoPkCbStudent | null);
    }
    class NoPkCbStudent extends Base {
      declare name: string | null;

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
    expect(await sicp.saveBang()).toBeTruthy();

    await (sicp as any).students.reload();
    const allStudents = await NoPkCbStudent.all();
    await (sicp as any).students.destroy(...allStudents);
    expect(afterDestroyCalled).toBeTruthy();
  });

  it("pk is not required for join", async () => {
    const post = await Post.includes(":scategories").first();
    const post2 = await Post.includes(":categories").first();
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

    await assertQueriesCount(3, false, async () => {
      await (post as any).people.push(person);
    });

    await assertQueriesCount(1, false, async () => {
      expect((await (post as any).people.toArray()).map((p: any) => p.id)).toContain(person.id);
    });

    await post.reload();
    expect((await (await (post as any).people.reload()).toArray()).map((p: any) => p.id)).toContain(
      person.id,
    );
  });

  it("delete all for with dependent option destroy", async () => {
    const person = await Person.find(people("david").id);
    expect(await (person as any).jobsWithDependentDestroy.count()).toEqual(1);

    await assertNoDifference(
      async () => Number(await Job.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await Reference.count()),
          -1,
          null,
          async () => {
            expect(await (await person.reload()).jobsWithDependentDestroy.deleteAll()).toEqual(1);
          },
        );
      },
    );
  });

  it("delete all for with dependent option nullify", async () => {
    const person = await Person.find(people("david").id);
    expect(await (person as any).jobsWithDependentNullify.count()).toEqual(1);

    await assertNoDifference(
      async () => Number(await Job.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await Reference.count()),
          null,
          async () => {
            expect(await (await person.reload()).jobsWithDependentNullify.deleteAll()).toEqual(1);
          },
        );
      },
    );
  });

  it("delete all for with dependent option delete all", async () => {
    const person = await Person.find(people("david").id);
    expect(await (person as any).jobsWithDependentDeleteAll.count()).toEqual(1);

    await assertNoDifference(
      async () => Number(await Job.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await Reference.count()),
          -1,
          null,
          async () => {
            expect(await (await person.reload()).jobsWithDependentDeleteAll.deleteAll()).toEqual(1);
          },
        );
      },
    );
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
    const result = await (post as any).people.concat([person]);
    expect(await (post as any).people.size()).toBe(1);
    expect(await (await (post as any).people.reload()).size()).toBe(1);
    expect((await (post as any).people.toArray()).map((r: any) => r.id)).toEqual(
      (await result.toArray()).map((r: any) => r.id),
    );
  });

  it("associating a persisted record with unsaved changes saves those changes", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("michael").id);
    person.writeAttribute("first_name", "Bongo");

    await (post as any).association("people").concat([person]);

    await person.reload();
    expect(person.readAttribute("first_name")).toBe("Bongo");
  });

  it("pushing a persisted record with unsaved changes saves those changes", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("michael").id);
    person.writeAttribute("first_name", "Bongo");

    await (post as any).people.push(person);

    await person.reload();
    expect(person.readAttribute("first_name")).toBe("Bongo");
  });

  it("associate existing record twice should add to target twice", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    await assertDifference(
      async () => (await (post as any).people.toArray()).length,
      2,
      null,
      async () => {
        await (post as any).people.push(person);
        await (post as any).people.push(person);
      },
    );
  });

  it("associate existing record twice should add records twice", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    await assertDifference(
      async () => (post as any).people.count(),
      2,
      null,
      async () => {
        await (post as any).people.push(person);
        await (post as any).people.push(person);
      },
    );
  });

  it("add two instance and then deleting", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    await (post as any).people.push(person);
    await (post as any).people.push(person);

    const counts = [
      () => (post as any).people.count(),
      async () => (await (post as any).people.toArray()).length,
      () => (post as any).readers.count(),
      async () => (await (post as any).readers.toArray()).length,
    ];
    await assertDifference(counts, -2, null, async () => {
      await (post as any).people.delete(person);
    });

    expect((await (post as any).people.reload()).map((p: any) => p.id)).not.toContain(person.id);
  });

  it("associating new", async () => {
    await assertQueriesCount(1, false, async () => {
      await Post.find(posts("thinking").id);
    });
    const post = await Post.find(posts("thinking").id);
    let newPerson!: Person;

    await assertQueriesCount(0, false, async () => {
      newPerson = new Person({ first_name: "bob" });
    });

    await assertQueriesCount(4, false, async () => {
      await (post as any).people.push(newPerson);
    });

    await assertQueriesCount(1, false, async () => {
      expect((await (post as any).people.toArray()).map((p: any) => p.id)).toContain(newPerson.id);
    });

    await post.reload();
    expect((await (await (post as any).people.reload()).toArray()).map((p: any) => p.id)).toContain(
      newPerson.id,
    );
  });

  it("associate new by building", async () => {
    await assertQueriesCount(1, false, async () => {
      await Post.find(posts("thinking").id);
    });
    const post = await Post.find(posts("thinking").id);

    await assertQueriesCount(0, false, async () => {
      (post as any).people.build({ first_name: "Bob" });
      (post as any).people.new({ first_name: "Ted" });
    });

    await assertQueriesCount(1, false, async () => {
      expect((await (post as any).people.toArray()).map((p: any) => p.first_name)).toContain("Bob");
      expect((await (post as any).people.toArray()).map((p: any) => p.first_name)).toContain("Ted");
    });

    await assertQueriesCount(7, false, async () => {
      (post as any).body = `${(post as any).body}-changed`;
      await post.save();
    });

    await post.reload();
    const names = (await (await (post as any).people.reload()).toArray()).map(
      (p: any) => p.first_name,
    );
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

    await (post as any).association("people").writer([person]);
    await post.save();

    expect(post.id).toBeTruthy();
    expect(person.id).toBeTruthy();
    const reader = await (post as any).readers.first();
    expect(Number(reader.post_id)).toBe(Number(post.id));
    expect(Number(reader.person_id)).toBe(Number(person.id));
  });

  it("delete association", async () => {
    await assertQueriesCount(2, false, async () => {
      await Post.find(posts("welcome").id);
      await Person.find(people("michael").id);
    });
    const post = await Post.find(posts("welcome").id);
    const michael = await Person.find(people("michael").id);

    await assertQueriesCount(3, false, async () => {
      await (post as any).people.delete(michael);
    });

    await assertQueriesCount(1, false, async () => {
      assertEmpty(await (post as any).people.toArray());
    });

    await post.reload();
    assertEmpty((await (post as any).people.reload()).target);
  });

  it("destroy association", async () => {
    const post = await Post.find(posts("welcome").id);
    const michael = await Person.find(people("michael").id);
    await assertNoDifference(
      async () => Number(await Person.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await Reader.count()),
          -1,
          null,
          async () => {
            await (post as any).people.destroy(michael);
          },
        );
      },
    );

    await post.reload();
    assertEmpty(await (post as any).people.toArray());
    assertEmpty((await (post as any).people.reload()).target);
  });

  it("destroy all", async () => {
    await assertNoDifference(
      async () => Number(await Person.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await Reader.count()),
          -1,
          null,
          async () => {
            await ((await Post.find(posts("welcome").id)) as any).people.destroyAll();
          },
        );
      },
    );

    const post = await Post.find(posts("welcome").id);
    assertEmpty(await ((await post.reload()) as any).people.toArray());
    assertEmpty((await (post as any).people.reload()).target);
  });

  it("destroy all on composite primary key model", async () => {
    const tag = cpkTags("cpk_tag_loyal_customer");

    assertNotEmpty(await (tag as any).orders.toArray());

    await (tag as any).orders.destroyAll();
    assertEmpty(await (tag as any).orders.toArray());
    assertEmpty((await (tag as any).orders.reload()).target);
  });

  it("composite primary key join table", async () => {
    const order = await CpkOrder.create({ shop_id: 1, status: "open" });
    const tag = cpkTags("cpk_tag_loyal_customer");
    const orderTag = await CpkOrderTag.create({
      order_id: (order as any).id_value,
      tag_id: (tag as any).id,
      attached_by: "Nikita",
    });
    const loadedOrder = await (orderTag as any).association("order").loadTarget();
    expect(loadedOrder?.id_value).toBe((order as any).id_value);
    const loadedTag = await (orderTag as any).association("tag").loadTarget();
    expect(loadedTag?.id).toBe((tag as any).id);
    await (orderTag as any).update({ attached_reason: "This is our loyal customer" });
    const orderTags = await (order as any).orderTags.toArray();
    const found = orderTags.find((ot: any) => Number(ot.tag_id) === Number((tag as any).id));
    expect(found.attached_reason).toBe("This is our loyal customer");
  });

  it("appends a composite-pk target record through a join model", async () => {
    const order = await CpkOrder.create({ shop_id: 1, status: "open" });
    const tag = cpkTags("cpk_tag_loyal_customer");
    await (tag as any).orders.push(order);
    const joinRow = await CpkOrderTag.findBy({
      order_id: (order as any).id_value,
      tag_id: (tag as any).id,
    });
    expect(joinRow).not.toBeNull();
    const orders = await (tag as any).orders.reload();
    expect(orders.map((o: any) => Number(o.id_value))).toContain(Number((order as any).id_value));
  });

  it("composite through-key has_many through routes via join scope", async () => {
    const { CpkBookWithOrderAgreements, CpkOrderAgreement } =
      await import("../test-helpers/models/cpk.js");
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = await CpkBookWithOrderAgreements.create({ id: [1, 2] });
    (book as any).order = order;
    await book.save();
    const agreement = await CpkOrderAgreement.create({ order_id: (order as any).id_value });

    const sql = await (book as any).orderAgreements.toSql();
    const orderAgreementsFk = quoteTableName("cpk_order_agreements.order_id");
    const orderId = quoteTableName("cpk_orders.id");
    const orderShopId = quoteTableName("cpk_orders.shop_id");
    expect(sql).toMatch(new RegExp(`INNER JOIN ${quoteTableName("cpk_orders")}`, "i"));
    expect(sql).toMatch(new RegExp(`${orderAgreementsFk} = ${orderId}`, "i"));
    expect(sql).toMatch(new RegExp(`${orderShopId} =`, "i"));
    expect(sql).toMatch(new RegExp(`${orderId} =`, "i"));

    const rows = await (book as any).orderAgreements.toArray();
    expect(rows.map((a: any) => a.id)).toEqual([agreement.id]);
  });

  it("composite-pk target and through model has_many through routes via join scope", async () => {
    const tag = cpkTags("cpk_tag_loyal_customer");
    const sql = await (tag as any).orders.toSql();
    const ordersId = quoteTableName("cpk_orders.id");
    const orderTagsOrderId = quoteTableName("cpk_order_tags.order_id");
    const orderTagsTagId = quoteTableName("cpk_order_tags.tag_id");
    expect(sql).toMatch(new RegExp(`INNER JOIN ${quoteTableName("cpk_order_tags")}`, "i"));
    expect(sql).toMatch(new RegExp(`${ordersId} = ${orderTagsOrderId}`, "i"));
    expect(sql).toMatch(new RegExp(`${orderTagsTagId} =`, "i"));

    const orders = await (tag as any).orders.toArray();
    expect(orders.length).toBeGreaterThan(0);
  });

  it("composite source fk has_many through routes via join scope", async () => {
    const { CpkOrderWithSingularBookChapters } = await import("../test-helpers/models/cpk.js");
    const order = await CpkOrderWithSingularBookChapters.create({ id: [5, 6] });
    await (order as any).createBook({ id: [7, 8] });

    const sql = await (order as any).chapters.toSql();
    const chapAuthorId = quoteTableName("cpk_chapters.author_id");
    const chapBookId = quoteTableName("cpk_chapters.book_id");
    const bookAuthorId = quoteTableName("cpk_books.author_id");
    const bookId = quoteTableName("cpk_books.id");
    expect(sql).toMatch(new RegExp(`${chapAuthorId} = ${bookAuthorId}`, "i"));
    expect(sql).toMatch(new RegExp(`${chapBookId} = ${bookId}`, "i"));
    await expect((order as any).chapters.toArray()).resolves.toBeInstanceOf(Array);
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

  it("should raise exception for destroying mismatching records", async () => {
    const post = await Post.find(posts("welcome").id);
    const thinkingPost = await Post.find(posts("thinking").id);
    await assertNoDifference(
      [async () => Number(await Person.count()), async () => Number(await Reader.count())],
      null,
      async () => {
        await assertRaises([AssociationTypeMismatch], {}, () =>
          (post as any).people.destroy(thinkingPost),
        );
      },
    );
  });

  it("delete through belongs to with dependent nullify", async () => {
    Reference.makeComments = true;
    try {
      const person = await Person.find(people("michael").id);
      const job = await Job.find(jobs("magician").id);
      const reference = await Reference.where({ job_id: job.id, person_id: person.id }).first();

      await assertNoDifference(
        [async () => Number(await Job.count()), async () => Number(await Reference.count())],
        null,
        async () => {
          await assertDifference(
            () => (person as any).jobs.count(),
            -1,
            null,
            async () => {
              await (person as any).jobsWithDependentNullify.delete(job);
            },
          );
        },
      );

      expect((await (reference as any).reload()).job_id).toBeNull();
    } finally {
      Reference.makeComments = false;
    }
  });

  it("delete through belongs to with dependent delete all", async () => {
    Reference.makeComments = true;
    try {
      const person = await Person.find(people("michael").id);
      const job = await Job.find(jobs("magician").id);

      expect((await (person as any).jobs.count()) >= 2).toBeTruthy();

      await assertNoDifference(
        async () => Number(await Job.count()),
        null,
        async () => {
          await assertDifference(
            [() => (person as any).jobs.count(), async () => Number(await Reference.count())],
            -1,
            null,
            async () => {
              await (person as any).jobsWithDependentDeleteAll.delete(job);
            },
          );
        },
      );

      expect((await person.reload()).comments).toBeNull();
    } finally {
      Reference.makeComments = false;
    }
  });

  it("delete through belongs to with dependent destroy", async () => {
    Reference.makeComments = true;
    try {
      const person = await Person.find(people("michael").id);
      const job = await Job.find(jobs("magician").id);

      expect((await (person as any).jobs.count()) >= 2).toBeTruthy();

      await assertNoDifference(
        async () => Number(await Job.count()),
        null,
        async () => {
          await assertDifference(
            [() => (person as any).jobs.count(), async () => Number(await Reference.count())],
            -1,
            null,
            async () => {
              await (person as any).jobsWithDependentDestroy.delete(job);
            },
          );
        },
      );

      expect((await person.reload()).comments).toEqual("Reference destroyed");
    } finally {
      Reference.makeComments = false;
    }
  });

  it("belongs to with dependent destroy", async () => {
    const person = await PersonWithDependentDestroyJobs.find(1);

    await (person as any).references.createBang();

    const jobsCount = await (person as any).jobs.count();
    await assertNoDifference(
      async () => Number(await Job.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await Reference.count()),
          -jobsCount,
          null,
          async () => {
            await person.destroy();
          },
        );
      },
    );
  });

  it("belongs to with dependent delete all", async () => {
    const person = await PersonWithDependentDeleteAllJobs.find(1);

    await (person as any).references.createBang();

    const jobsCount = await (person as any).jobs.count();
    await assertNoDifference(
      async () => Number(await Job.count()),
      null,
      async () => {
        await assertDifference(
          async () => Number(await Reference.count()),
          -jobsCount,
          null,
          async () => {
            await person.destroy();
          },
        );
      },
    );
  });

  it("belongs to with dependent nullify", async () => {
    const person = await PersonWithDependentNullifyJobs.find(1);

    const references = await (person as any).references.toArray();

    await assertNoDifference(
      [async () => Number(await Reference.count()), async () => Number(await Job.count())],
      null,
      async () => {
        await person.destroy();
      },
    );

    for (const reference of references) {
      expect((await reference.reload()).job_id).toBeNull();
    }
  });

  it("update counter caches on delete", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.createBang({ name: "doomed" });

    await assertDifference(
      async () => ((await post.reload()) as any).tags_count,
      -1,
      null,
      async () => {
        await ((await Post.find(posts("welcome").id)) as any).tags.delete(tag);
      },
    );
  });

  it("update counter caches on delete with dependent destroy", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.createBang({ name: "doomed" });
    await post.updateColumns({ tags_with_destroy_count: await (post as any).tags.count() });

    await assertDifference(
      async () => ((await post.reload()) as any).tags_with_destroy_count,
      -1,
      null,
      async () => {
        await ((await Post.find(posts("welcome").id)) as any).tagsWithDestroy.delete(tag);
      },
    );
  });

  it("update counter caches on delete with dependent nullify", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.createBang({ name: "doomed" });
    await post.updateColumns({ tags_with_nullify_count: await (post as any).tags.count() });

    await assertNoDifference(
      async () => ((await post.reload()) as any).tags_count,
      null,
      async () => {
        await assertDifference(
          async () => ((await post.reload()) as any).tags_with_nullify_count,
          -1,
          null,
          async () => {
            await ((await Post.find(posts("welcome").id)) as any).tagsWithNullify.delete(tag);
          },
        );
      },
    );
  });

  it("update counter caches on replace association", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.create({ name: "doomed" });
    await tag.taggedPosts.push(await Post.find(posts("thinking").id));

    await tag.taggedPosts.replace([]);
    await post.reload();

    expect(post.tags_count).toBe(await (post as any).taggings.count());
  });

  it("update counter caches on destroy", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).tags.createBang({ name: "doomed" });

    await assertDifference(
      async () => ((await post.reload()) as any).tags_count,
      -1,
      null,
      async () => {
        await tag.taggedPosts.destroy(post);
      },
    );
  });

  it("update counter caches on destroy with indestructible through record", async () => {
    const post = await Post.find(posts("welcome").id);
    const tag = await (post as any).indestructibleTags.createBang({ name: "doomed" });
    await post.updateColumns({
      indestructible_tags_count: await (post as any).indestructibleTags.count(),
    });

    await assertNoDifference(
      async () => ((await post.reload()) as any).indestructible_tags_count,
      null,
      async () => {
        await ((await Post.find(posts("welcome").id)) as any).indestructibleTags.destroy(tag);
      },
    );
  });

  it("replace association", async () => {
    await assertQueriesCount(4, false, async () => {
      const welcome = await Post.find(posts("welcome").id);
      await Person.find(people("david").id);
      await Person.find(people("michael").id);
      await (welcome as any).people.reload();
    });
    const post = await Post.find(posts("welcome").id);
    const david = await Person.find(people("david").id);
    const michael = await Person.find(people("michael").id);
    await (post as any).people.reload();

    await assertQueriesCount(4, false, async () => {
      await (post as any).association("people").writer([david]);
    });

    await assertNoQueries(false, async () => {
      expect((post as any).people.target.map((p: any) => p.id)).toContain(david.id);
      expect((post as any).people.target.map((p: any) => p.id)).not.toContain(michael.id);
    });

    await post.reload();
    expect((await (post as any).people.reload()).target.map((p: any) => p.id)).toContain(david.id);
    expect((await (post as any).people.reload()).target.map((p: any) => p.id)).not.toContain(
      michael.id,
    );
  });

  it("replace association with duplicates", async () => {
    const post = await Post.find(posts("thinking").id);
    const person = await Person.find(people("david").id);

    await assertDifference(
      () => (post as any).people.count(),
      2,
      null,
      async () => {
        await (post as any).association("people").writer([person]);
        await (post as any).association("people").writer([person, person]);
      },
    );
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
    await assertQueriesCount(1, false, async () => {
      await Post.find(posts("thinking").id);
    });
    const post = await Post.find(posts("thinking").id);

    await assertQueriesCount(4, false, async () => {
      await (post as any).people.create({ first_name: "Jeb" });
    });

    await assertQueriesCount(1, false, async () => {
      expect((await (post as any).people.toArray()).map((p: any) => p.first_name)).toContain("Jeb");
    });

    await post.reload();
    expect(
      (await (await (post as any).people.reload()).toArray()).map((p: any) => p.first_name),
    ).toContain("Jeb");
  });

  it("through record is built when created with where", async () => {
    const post = await Post.find(posts("thinking").id);
    await assertDifference(
      () => (post as any).readers.count(),
      1,
      null,
      async () => {
        await (post as any).people
          .where({ readers: { skimmer: true } })
          .create({ first_name: "Jeb" });
      },
    );
    const reader = await (post as any).readers.last();
    expect(reader.skimmer).toEqual(true);
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

    let error = await assertRaises([RecordNotSaved], {}, () =>
      (p as any).people.create({ first_name: "mew" }),
    );
    expect(error.message).toEqual("You cannot call create unless the parent is saved");

    error = await assertRaises([RecordNotSaved], {}, () =>
      (p as any).people.createBang({ first_name: "snow" }),
    );
    expect(error.message).toEqual("You cannot call create unless the parent is saved");
  });

  it("associate with create and invalid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    await assertNoDifference(
      () => (firm as any).developers.count(),
      null,
      async () => {
        await assertNothingRaised(() => (firm as any).developers.create({ name: "0" }));
      },
    );
  });

  it("associate with create and valid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    await assertDifference(
      () => (firm as any).developers.count(),
      1,
      null,
      async () => {
        await (firm as any).developers.create({ name: "developer" });
      },
    );
  });

  it("associate with create bang and invalid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    await assertNoDifference(
      () => (firm as any).developers.count(),
      null,
      async () => {
        await assertRaises([RecordInvalid], {}, () =>
          (firm as any).developers.createBang({ name: "0" }),
        );
      },
    );
  });

  it("associate with create bang and valid options", async () => {
    const firm = await Company.find(companies("first_firm").id);
    await assertDifference(
      () => (firm as any).developers.count(),
      1,
      null,
      async () => {
        await (firm as any).developers.createBang({ name: "developer" });
      },
    );
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
      await assertRaises([RecordInvalid], {}, () =>
        assertDeprecated(null, deprecator(), () => (firm as any).developers.push(lifo)),
      );

      const lifo2 = await Developer.createBang({ name: "lifo" });
      await assertRaises([RecordInvalid], {}, () =>
        assertDeprecated(null, deprecator(), () => (firm as any).developers.push(lifo2)),
      );
    } finally {
      (Contract as any).clearValidatorsBang();
    }
  });

  it("clear associations", async () => {
    await assertQueriesCount(2, false, async () => {
      const welcome = await Post.find(posts("welcome").id);
      await (welcome as any).people.reload();
    });

    const post = await Post.find(posts("welcome").id);
    await (post as any).people.load();
    await assertQueriesCount(1, false, async () => {
      await (post as any).people.clear();
    });

    await assertNoQueries(false, async () => {
      assertEmpty((post as any).people.target);
    });

    await post.reload();
    assertEmpty((await (post as any).people.reload()).target);
  });

  it("association callback ordering", async () => {
    Post.resetLog();
    const log = Post.log();
    const post = await Post.find(posts("thinking").id);

    await (post as any).peopleWithCallbacks.push(await Person.find(people("michael").id));
    expect(log.slice(-2)).toEqual([
      ["added", "before", "Michael"],
      ["added", "after", "Michael"],
    ]);

    await (post as any).peopleWithCallbacks.push(
      await Person.find(people("david").id),
      await Person.createBang({ first_name: "Bob" }),
      new Person({ first_name: "Lary" }),
    );
    expect(log.slice(-6)).toEqual([
      ["added", "before", "David"],
      ["added", "after", "David"],
      ["added", "before", "Bob"],
      ["added", "after", "Bob"],
      ["added", "before", "Lary"],
      ["added", "after", "Lary"],
    ]);

    (post as any).peopleWithCallbacks.build({ first_name: "Ted" });
    expect(log.slice(-2)).toEqual([
      ["added", "before", "Ted"],
      ["added", "after", "Ted"],
    ]);

    await (post as any).peopleWithCallbacks.create({ first_name: "Sam" });
    expect(log.slice(-2)).toEqual([
      ["added", "before", "Sam"],
      ["added", "after", "Sam"],
    ]);

    await (post as any)
      .association("peopleWithCallbacks")
      .writer([
        await Person.find(people("michael").id),
        await Person.find(people("david").id),
        new Person({ first_name: "Julian" }),
        await Person.createBang({ first_name: "Roger" }),
      ]);
    expect(
      log
        .slice(-12, -4)
        .map((entry: any[]) => entry[entry.length - 1])
        .sort(),
    ).toEqual(["Bob", "Bob", "Lary", "Lary", "Sam", "Sam", "Ted", "Ted"]);
    expect(log.slice(-4)).toEqual([
      ["added", "before", "Julian"],
      ["added", "after", "Julian"],
      ["added", "before", "Roger"],
      ["added", "after", "Roger"],
    ]);

    (post as any).peopleWithCallbacks.build({}, (person: any) => {
      person.first_name = "Ted";
    });
    expect(log.slice(-2)).toEqual([
      ["added", "before", "Ted"],
      ["added", "after", "Ted"],
    ]);

    await (post as any).peopleWithCallbacks.create({}, (person: any) => {
      person.first_name = "Sam";
    });
    expect(log.slice(-2)).toEqual([
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
    expect(await (michael as any).posts.includes(":readers").count()).toBe(2);
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
    await Tagging.createBang({
      taggable_type: "Post",
      taggable_id: post.id,
      tag_id: tags("misc").id,
    });
    await assertNotCalled(async () => {
      await (post as any).miscTagIds;
    });
  });

  it("get ids for loaded associations", async () => {
    const michael = await Person.find(people("michael").id);
    await (michael as any).posts.reload();
    await assertNoQueries(false, async () => {
      await (michael as any).postIds;
      await (michael as any).postIds;
    });
  });

  it("get ids for unloaded associations does not load them", async () => {
    const michael = await Person.find(people("michael").id);
    expect((michael as any).posts.loaded).toBeFalsy();
    expect([...(await (michael as any).postIds)].sort()).toEqual(
      [posts("welcome").id, posts("authorless").id].sort(),
    );
    expect((michael as any).posts.loaded).toBeFalsy();
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
    const author = await Author.find(authors("mary").id);
    await assertNothingRaised(() => (author as any).comments.ratings().toSql());
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

  it.skip("modifying has many through has one reflection should raise", async () => {
    // BLOCKED: << on a has_many :through over a has_one raises NotNullViolation instead of HasManyThroughCantAssociateThroughHasOneOrManyReflection — filed as 0155-assertion-surfaced-port-bugs/through-has-one-push-skips-ensure-mutable
    const david = await Author.find(authors("david").id);
    const blocks = [
      async () =>
        association(david, "verySpecialComments").replace([
          await VerySpecialComment.createBang({ body: "Gorp!", post_id: 1011 }),
          await VerySpecialComment.createBang({ body: "Eep!", post_id: 1012 }),
        ]),
      async () =>
        (david as any).verySpecialComments.push(
          await VerySpecialComment.createBang({ body: "Hoohah!", post_id: 1013 }),
        ),
      async () =>
        (david as any).verySpecialComments.delete(await (david as any).verySpecialComments.first()),
    ];
    for (const block of blocks) {
      await assertRaises([HasManyThroughCantAssociateThroughHasOneOrManyReflection], {}, block);
    }
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
    expect(await (mary as any).namedCategories.first()).toEqual(general);
  });

  it("collection build with nonstandard primary key on belongs to", async () => {
    const author = await Author.find(authors("mary").id);
    const category = (author as any).namedCategories.build({ name: "Primary" });
    await author.save();
    expect(
      await Categorization.exists({ author_id: author.id, named_category_name: category.name }),
    ).toBeTruthy();
    expect((await (author as any).namedCategories.reload()).map((c: any) => c.id)).toContain(
      category.id,
    );
  });

  it("collection create with nonstandard primary key on belongs to", async () => {
    const author = await Author.find(authors("mary").id);
    const category = await (author as any).namedCategories.create({ name: "Primary" });
    expect(
      await Categorization.exists({ author_id: author.id, named_category_name: category.name }),
    ).toBeTruthy();
    expect((await (author as any).namedCategories.reload()).map((c: any) => c.id)).toContain(
      category.id,
    );
  });

  it.skip("collection exists", async () => {
    // BLOCKED: mass assignment — Category.createBang({ author_ids }) raises UnknownAttributeError — filed as 0155-assertion-surfaced-port-bugs/ctor-mass-assign-collection-ids-unsupported
    const author = await Author.find(authors("mary").id);
    const category = await Category.createBang({ author_ids: [author.id], name: "Primary" });
    expect(await (category as any).authors.exists({ id: author.id })).toBeTruthy();
    await category.reload();
    expect(await (category as any).authors.exists({ id: author.id })).toBeTruthy();
  });

  it("collection delete with nonstandard primary key on belongs to", async () => {
    const author = await Author.find(authors("mary").id);
    const category = await (author as any).namedCategories.create({ name: "Primary" });
    await (author as any).namedCategories.delete(category);
    expect(
      await Categorization.exists({ author_id: author.id, named_category_name: category.name }),
    ).toBeFalsy();
    assertEmpty((await (author as any).namedCategories.reload()).target);
  });

  it("collection singular ids getter with string primary keys", async () => {
    const book = await Book.find(books("awdr").id);
    const subIds = await (book as any).subscriberIds;
    expect(subIds.length).toBe(2);
    expect([...subIds].sort()).toEqual(
      [subscribers("first").nick, subscribers("second").nick].sort(),
    );
  });

  it("collection singular ids getter through with custom primary key", async () => {
    const david = await Author.find(authors("david").id);
    const catIds = await (david as any).essayCategoryIds;
    expect([...catIds].sort()).toEqual([(categories("general") as any).name]);
  });

  it("collection singular ids setter", async () => {
    const company = await Company.find(companies("rails_core").id);
    const dev = (await Developer.first())!;
    await (company as any).association("developers").idsWriter([dev.id as number]);
    const devs = await (company as any).developers.toArray();
    expect(devs.map((d: any) => d.id)).toEqual([dev.id]);
  });

  it("collection singular ids setter with required type cast", async () => {
    const company = await Company.find(companies("rails_core").id);
    const dev = (await Developer.first())!;
    await (company as any).association("developers").idsWriter([`${dev.id}`]);
    const devs = await (company as any).developers.toArray();
    expect(devs.map((d: any) => d.id)).toEqual([dev.id]);
  });

  it("collection singular ids setter with string primary keys", async () => {
    await assertNothingRaised(async () => {
      const book = await Book.find(books("awdr").id);
      await (book as any).association("subscribers").idsWriter([subscribers("second").nick]);
      expect(
        (await (await (book as any).subscribers.reload()).toArray()).map((s: any) => s.nick),
      ).toEqual([subscribers("second").nick]);

      await (book as any).association("subscribers").idsWriter([]);
      expect(await (await (book as any).subscribers.reload()).toArray()).toEqual([]);
    });
  });

  it("collection singular ids setter raises exception when invalid ids set", async () => {
    const company = await Company.find(companies("rails_core").id);
    const ids = [(await Developer.first())!.id as number, -9999];
    const e = await assertRaises([RecordNotFound], {}, () =>
      (company as any).association("developers").idsWriter(ids),
    );
    const msg = `Couldn't find all Developers with 'id': (${ids[0]}, -9999) (found 1 results, but was looking for 2). Couldn't find Developer with id -9999.`;
    expect(e.message).toEqual(msg);
  });

  it("collection singular ids through setter raises exception when invalid ids set", async () => {
    const author = await Author.find(authors("david").id);
    const ids = [(categories("general") as any).name, "Unknown"];
    const e = await assertRaises([RecordNotFound], {}, () =>
      (author as any).association("essayCategories").idsWriter(ids),
    );
    const msg =
      "Couldn't find all Categories with 'name': (General, Unknown) (found 1 results, but was looking for 2). Couldn't find Category with name Unknown.";
    expect(e.message).toEqual(msg);
  });

  it("build a model from hm through association with where clause", async () => {
    const book = await Book.find(books("awdr").id);
    await assertNothingRaised(() => (book as any).subscribers.where({ nick: "marklazz" }).build());
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

  it.skip("include method in association through should return true for instance added with build", async () => {
    // BLOCKED: an unsaved owner's has_many :through target omits records built through the join association — filed as 0155-assertion-surfaced-port-bugs/through-target-omits-through-built-records-on-new-owner
    const person = new Person();
    const reference = (person as any).references.build();
    const job = reference.buildJob();
    expect(await (person as any).jobs.toArray()).toContain(job);
  });

  it.skip("include method in association through should return true for instance added with nested builds", async () => {
    // BLOCKED: an unsaved owner's has_many :through target omits records built through the join association — filed as 0155-assertion-surfaced-port-bugs/through-target-omits-through-built-records-on-new-owner
    const author = new Author();
    const post = (author as any).posts.build();
    const comment = post.comments.build();
    expect(await (author as any).comments.toArray()).toContain(comment);
  });

  it("through association readonly should be false", async () => {
    const michael = await Person.find(people("michael").id);
    expect((await (michael as any).posts.first()).isReadonly()).toBeFalsy();
    expect((await (michael as any).posts.toArray())[0].isReadonly()).toBeFalsy();
  });

  it("can update through association", async () => {
    const michael = await Person.find(people("michael").id);
    await assertNothingRaised(async () => {
      const firstPost = await (michael as any).posts.first();
      await firstPost.updateBang({ title: "Can write" });
    });
  });

  it("has many through with source scope", async () => {
    const expected = [
      ((await (await Reader.find(readers("michael_welcome").id)).becomes(LazyReader)) as any).id,
    ];
    const ids = (records: any[]) => records.map((r: any) => r.id);
    expect(ids(await ((await Author.first()) as any).lazyReadersSkimmersOrNot.toArray())).toEqual(
      expected,
    );
    expect(
      ids(
        await (
          (await Author.preload(":lazyReadersSkimmersOrNot").first()) as any
        ).lazyReadersSkimmersOrNot.toArray(),
      ),
    ).toEqual(expected);
    expect(
      ids(
        await (
          (await Author.eagerLoad(":lazyReadersSkimmersOrNot").first()) as any
        ).lazyReadersSkimmersOrNot.toArray(),
      ),
    ).toEqual(expected);
  });

  it("has many through with through scope with includes", async () => {
    const expected = [
      ((await (await Reader.find(readers("bob_welcome").id)).becomes(LazyReader)) as any).id,
    ];
    const ids = (records: any[]) => records.map((r: any) => r.id);
    expect(ids(await ((await Author.last()) as any).lazyReadersSkimmersOrNot_2.toArray())).toEqual(
      expected,
    );
    expect(
      ids(
        await (
          (await Author.preload(":lazyReadersSkimmersOrNot_2").last()) as any
        ).lazyReadersSkimmersOrNot_2.toArray(),
      ),
    ).toEqual(expected);
    expect(
      ids(
        await (
          (await Author.eagerLoad(":lazyReadersSkimmersOrNot_2").last()) as any
        ).lazyReadersSkimmersOrNot_2.toArray(),
      ),
    ).toEqual(expected);
  });

  it("has many through with through scope with joins", async () => {
    const expected = [
      ((await (await Reader.find(readers("bob_welcome").id)).becomes(LazyReader)) as any).id,
    ];
    const ids = (records: any[]) => records.map((r: any) => r.id);
    expect(ids(await ((await Author.last()) as any).lazyReadersSkimmersOrNot_3.toArray())).toEqual(
      expected,
    );
    expect(
      ids(
        await (
          (await Author.preload(":lazyReadersSkimmersOrNot_3").last()) as any
        ).lazyReadersSkimmersOrNot_3.toArray(),
      ),
    ).toEqual(expected);
    expect(
      ids(
        await (
          (await Author.eagerLoad(":lazyReadersSkimmersOrNot_3").last()) as any
        ).lazyReadersSkimmersOrNot_3.toArray(),
      ),
    ).toEqual(expected);
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
      ":generalPosts",
      ":generalCategorizations",
    ).first())!.generalCategorizations;
    expect(preloadedGeneralCats.map((c: any) => c.id)).toEqual([davidWelcomeGeneral.id]);

    const eagerGeneralCats = (await Author.eagerLoad(
      ":generalPosts",
      ":generalCategorizations",
    ).first())!.generalCategorizations;
    expect(eagerGeneralCats.map((c: any) => c.id)).toEqual([davidWelcomeGeneral.id]);

    const welcomePost = await Post.find(posts("welcome").id);
    const preloadedGeneralPosts = (await Author.preload(
      ":generalCategorizations",
      ":generalPosts",
    ).first())!.generalPosts;
    expect(preloadedGeneralPosts.map((p: any) => p.id)).toEqual([welcomePost.id]);

    const eagerGeneralPosts = (await Author.eagerLoad(
      ":generalCategorizations",
      ":generalPosts",
    ).first())!.generalPosts;
    expect(eagerGeneralPosts.map((p: any) => p.id)).toEqual([welcomePost.id]);
  });

  it("has many through polymorphic with rewhere", async () => {
    const post = await TaggedPost.create({ title: "Tagged", body: "Post" });
    const tag = await (post as any).tags.create({ name: "Tag" });
    const preloaded = (await TaggedPost.preload(":tags").last())!.tags;
    expect(preloaded.map((t: any) => t.id)).toEqual([tag.id]);
    const eagerLoaded = (await TaggedPost.eagerLoad(":tags").last())!.tags;
    expect(eagerLoaded.map((t: any) => t.id)).toEqual([tag.id]);
  });

  it("has many through polymorphic with primary key option", async () => {
    const david = await Author.find(authors("david").id);
    const general = await Category.find(categories("general").id);
    expect((await (david as any).essayCategories.toArray()).map((c: any) => c.id)).toEqual([
      general.id,
    ]);

    let joinedAuthors = await Author.joins(":essayCategories").where({
      "categories.id": general.id,
    });
    expect(joinedAuthors[0].id).toEqual(david.id);

    const blackbeard = await Owner.find(owners("blackbeard").id);
    expect((await (david as any).essayOwners.toArray()).map((o: any) => o.id)).toEqual([
      blackbeard.id,
    ]);

    joinedAuthors = await Author.joins(":essayOwners").where("owners.name = 'blackbeard'");
    expect(joinedAuthors[0].id).toEqual(david.id);
  });

  it("has many through with primary key option", async () => {
    const david = await Author.find(authors("david").id);
    const general = await Category.find(categories("general").id);
    expect((await (david as any).essayCategories_2.toArray()).map((c: any) => c.id)).toEqual([
      general.id,
    ]);

    const joinedAuthors = await Author.joins(":essayCategories_2").where({
      "categories.id": general.id,
    });
    expect(joinedAuthors[0].id).toEqual(david.id);
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
    const mary = await Author.joins(":uniqueCategorizedPosts")
      .where({ id: authors("mary").id })
      .first();
    expect(await (mary as any).uniqueCategorizedPosts.size()).toBe(1);
    expect((await (mary as any).uniqueCategorizedPostIds).length).toBe(1);
  });

  it("joining has many through belongs to", async () => {
    const maryCatId = categorizations("mary_thinking_sti").id;
    const postList = await Post.joins(":authorCategorizations")
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

    await (post as any).authorCategorizations.load();
    const proxy = (post as any).association("authorCategorizations");

    expect(proxy.isStaleTarget()).toBeFalsy();
    const mary = await Author.find(authors("mary").id);
    const byId = (a: any, b: any) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    expect(
      (await (post as any).authorCategorizations.toArray()).sort(byId).map((c: any) => c.id),
    ).toEqual((await (mary as any).categorizations.toArray()).sort(byId).map((c: any) => c.id));

    (post as any).author_id = authors("david").id;

    expect(proxy.isStaleTarget()).toBeTruthy();
    const david = await Author.find(authors("david").id);
    expect(
      (await (post as any).authorCategorizations.toArray()).sort(byId).map((c: any) => c.id),
    ).toEqual((await (david as any).categorizations.toArray()).sort(byId).map((c: any) => c.id));
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

    expect((await (post as any).authorAddresses.toArray()).map((a: any) => a.id)).toContain(
      address.id,
    );
    await (post as any).authorAddresses.delete(address);
    expect((post as any).get("author_count") == null).toBeTruthy();
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
      await assertNothingRaised(async () => {
        await Category.create({ name: "Fishing", authors: [await Author.first()] });
      });
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

  it("preloading empty through association via joins", async () => {
    const readerId = readers("michael_welcome").id;
    const person = await Person.createBang({ first_name: "Gaga" });
    const loaded = await Person.where({ id: person.id })
      .where(`readers.id = ${readerId} or 1=1`)
      .references(":readers")
      .includes(":posts");
    const p = loaded[0];
    expect((p as any).posts.loaded).toBeTruthy();
    expect(await (p as any).posts.toArray()).toEqual([]);
  });

  it("preloading empty through with polymorphic source association", async () => {
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
      .includes({ ":pets": ":persons" })
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

  it("has many through with polymorphic source", async () => {
    const general = await Tag.find(tags("general").id);
    const post = await (general as any).taggedPosts.create({ title: "foo", body: "bar" });
    const reloaded = await Post.find(post.id);
    const postTags = await (reloaded as any).tags.toArray();
    expect(postTags.map((t: any) => t.id)).toEqual([general.id]);
  });

  it("has many through with polymorhic join model", async () => {
    const zine = await Zine.createBang({});

    await assertNothingRaised(async () => {
      await (await (zine as any).polymorphicHumans.build()).saveBang();
    });

    expect(await (zine as any).polymorphicHumans.count()).toEqual(1);
    expect(await (zine as any).interests.count()).toEqual(1);
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

    const person1 = await Person.create({ first_name: "aaron", followers_count: 1 });
    const person2 = await Person.create({ first_name: "schmit", followers_count: 2 });
    const person3 = await Person.create({ first_name: "bill", followers_count: 3 });
    const person4 = await Person.create({ first_name: "cal", followers_count: 4 });

    for (const person of [person1, person2, person3, person4]) {
      await Reader.create({ post_id: post1.id, person_id: person.id });
    }
    for (const person of [person1, person2, person3, person4]) {
      await Reader.create({ post_id: post2.id, person_id: person.id });
    }

    const activePersons = Person.joins(":readers")
      .joins(":posts")
      .distinct()
      .where({ "posts.title": "active" });

    const sum = (await activePersons).reduce((acc: number, p: any) => acc + p.followers_count, 0);
    expect(sum).toEqual(10);
    expect(await activePersons.sum("followers_count")).toEqual(10);
    expect(await activePersons.sum("followers_count")).toEqual(sum);
  });

  it("has many through associations on new records use null relations", async () => {
    const person = new Person();

    await assertNoQueries(false, async () => {
      expect(await (person as any).posts.toArray()).toEqual([]);
      expect(await (person as any).posts.where({ body: "omg" }).toArray()).toEqual([]);
      expect(await (person as any).posts.pluck("body")).toEqual([]);
      expect(await (person as any).posts.sum("tags_count")).toEqual(0);
      expect(await (person as any).posts.count()).toEqual(0);
    });
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
    assertNotEmpty(extra);
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

  it("has many through unscope default scope", async () => {
    const post = await Post.createBang({ title: "Beaches", body: "I like beaches!" });
    await Reader.createBang({ person_id: people("david").id, post_id: post.id });
    await LazyReader.createBang({ person_id: people("susan").id, post_id: post.id });

    expect((await (post as any).people.toArray()).length).toEqual(2);
    expect((await (post as any).lazyPeople.toArray()).length).toEqual(1);

    expect((await (post as any).lazyReadersUnscopeSkimmers.toArray()).length).toEqual(2);
    expect((await (post as any).lazyPeopleUnscopeSkimmers.toArray()).length).toEqual(2);
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
    Club.hasMany("distinctMemberships", (q: any) => q.distinct(), {
      className: "Membership",
    });
    Club.hasMany("specialFavorites", {
      through: "distinctMemberships",
      source: "member",
    });
    const newClub = new Club();
    const val = (newClub as any).specialFavorites.distinctValue;
    expect(val).toBeNull();
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

  it("has many through with scope that has joined same table with parent relation", async () => {
    const david = await Author.find(authors("david").id);
    const result = await Author.joins(":commentsForFirstAuthor").take();
    expect(result?.id).toBe(david.id);
  });

  it("has many through with left joined same table with through table", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOther = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).comments.leftJoins(":post").toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOther.id]);
  });

  it("has many through with unscope should affect to through scope", async () => {
    const mary = await Author.find(authors("mary").id);
    const eagerOther = await Comment.find(comments("eager_other_comment1").id);
    const result = await (mary as any).unorderedComments.toArray();
    expect(result.map((c: any) => c.id)).toEqual([eagerOther.id]);
  });

  it("has many through with scope should accept string and hash join", async () => {
    const david = await Author.find(authors("david").id);
    const result = await Author.joins({
      ":commentsForFirstAuthor": ":post",
    })
      .joins("inner join posts posts_alias on authors.id = posts_alias.author_id")
      .eagerLoad(":categories")
      .take();
    expect(result?.id).toBe(david.id);
  });

  it("has many through with scope should respect table alias", async () => {
    const family = await Family.createBang({});
    const users = [await User.createBang({}), await User.createBang({}), await User.createBang({})];
    await FamilyTree.createBang({ member_id: users[0].id, family_id: family.id });
    await FamilyTree.createBang({ member_id: users[1].id, family_id: family.id });
    await FamilyTree.createBang({ member_id: users[2].id, family_id: family.id, token: "wat" });

    expect((await (users[0] as any).familyMembers.toArray()).length).toEqual(2);
    expect((await (users[2] as any).familyMembers.toArray()).length).toEqual(0);
  });

  const ids = (records: any[]) =>
    records.map((r: any) => r.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  it("through scope is affected by unscoping", async () => {
    const author = authors("david");

    const expected = ids(await association(author, "comments"));
    await FirstPost.unscoped(async () => {
      expect(ids(await association(author, "commentsOnFirstPosts"))).toEqual(expected);
    });
  });

  it("through scope isnt affected by scoping", async () => {
    const author = authors("david");
    const expected = ids(await association(author, "commentsOnFirstPosts"));

    const inside = await FirstPost.where({ id: 2 }).scoping(async () => {
      association(author, "commentsOnFirstPosts").reset();
      return association(author, "commentsOnFirstPosts").toArray();
    });

    expect(ids(inside)).toEqual(expected);
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
    expect(subs.map((s: any) => s.id)).toEqual([sub1.id]);

    const bob = await Author.find(authors("bob").id);
    (post as any).author = bob;
    const book2 = await Book.create({ name: "essays on single has many through associations 2" });
    await (bob as any).books.push(book2);
    const sub2 = (await Subscription.second())!;
    await (book2 as any).subscriptions.push(sub2);
    const subs2 = await (post as any).subscriptions.toArray();
    expect(subs2.map((s: any) => s.id)).toEqual([sub2.id]);
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
    expect(subs.map((s: any) => s.id)).toEqual([sub1.id]);

    const bob = await Author.find(authors("bob").id);
    (post as any).author = bob;
    const book2 = await Book.create({ name: "essays on nested has many through associations 2" });
    await (bob as any).books.push(book2);
    const sub2 = (await Subscription.second())!;
    await (book2 as any).subscriptions.push(sub2);
    const subs2 = await (post as any).subscriptions.toArray();
    expect(subs2.map((s: any) => s.id)).toEqual([sub2.id]);
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
      await assertNothingRaised(() => (treasure as any).pets.push(mochi));
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

  it("post has many tags through association with composite query constraints", async () => {
    const blogPost = await ShardedBlogPost.find(shardedBlogPosts("great_post_blog_one").id);
    const expectedTagIds = (
      await ShardedBlogPostTag.where({
        blog_post_id: (blogPost as any).id,
        blog_id: (blogPost as any).blog_id,
      })
    ).map((t: any) => t.tag_id);

    const tagIds: any[] = [];
    const tags2 = await (blogPost as any).tags.toArray();
    for (const t of tags2) tagIds.push(t.id);

    const quotedTagsBlogId = quoteTableName("sharded_tags.blog_id");
    const quotedPostsTagsBlogId = quoteTableName("sharded_blog_posts_tags.blog_id");
    const tagsSql = await (blogPost as any).tags.toSql();
    expect(tagsSql).toMatch(
      new RegExp(`ON.*${quotedTagsBlogId} = ${quotedPostsTagsBlogId}.*WHERE`, "i"),
    );
    expect(tagsSql).toMatch(new RegExp(`WHERE.*${quotedPostsTagsBlogId}`, "i"));

    assertNotEmpty(tagIds);
    expect([...tagIds].map(Number).sort()).toEqual([...expectedTagIds].map(Number).sort());
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

    assertNotEmpty(blogPostIds);
    expect([...blogPostIds].map(Number).sort()).toEqual(
      [...expectedBlogPostIds].map(Number).sort(),
    );
  });

  it("through association resolves composite source association primary key", async () => {
    const blogPost = await ShardedBlogPost.find(shardedBlogPosts("great_post_blog_one").id);
    const tags = await (blogPost as any).tags.toArray();
    expect(tags.length).toBeGreaterThan(0);
    const tag = tags[0];

    await (blogPost as any).tags.delete(tag);
    const remaining = await (blogPost as any).tags.reload();
    expect(remaining.map((t: any) => Number(t.id))).not.toContain(Number(tag.id));
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
    ).create({ order_id: (order as any).id_value });
    const agreements = await (book as any).orderAgreements.toArray();
    expect(agreements.map((a: any) => a.id)).toEqual([agreement.id]);
  });

  it("cpk stale target", async () => {
    const order = await CpkOrder.create({ shop_id: 1 });
    const book = await (
      await import("../test-helpers/models/cpk.js").then((m) => m.CpkBookWithOrderAgreements)
    ).create({
      id: [1, 2],
      order_id: (order as any).id_value,
    });
    await (
      await import("../test-helpers/models/cpk.js").then((m) => m.CpkOrderAgreement)
    ).create({ order_id: (order as any).id_value });

    await (book as any).orderAgreements.load();
    (book as any).order = new CpkOrder();

    expect((book as any).association("orderAgreements").isStaleTarget()).toBeTruthy();
  });

  it("cpk association build through singular", async () => {
    const { CpkOrderWithSingularBookChapters } = await import("../test-helpers/models/cpk.js");
    const order = await CpkOrderWithSingularBookChapters.createBang({ id: [1, 2] });
    const book = await (order as any).createBookBang({ id: [3, 4] });
    const chapter = (order as any).chapters.build();

    expect((await chapter.association("book").loadTarget())?.id).toEqual(book.id);
  });

  it("insertRecord with validate false still raises on invalid join record", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class IrpvTagging extends Base {
      declare taggable_id: number | null;
      declare taggable_type: string | null;
      declare tag_id: number | null;

      static {
        this._tableName = "taggings";
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
        this.attribute("tag_id", "integer");
        (this as any).validate((r: any) => {
          r.errors.add("base", "Join always invalid");
        });
        this.belongsTo("tag", { className: "Tag", foreignKey: "tag_id" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface IrpvTagging {
      get tag(): Tag | null | Promise<Tag | null>;
      set tag(value: Tag | null);
    }
    registerModel("IrpvTagging", IrpvTagging);

    const post = await Post.create({ title: "Test", body: "" });
    const tag = await Tag.create({ name: "testjoin" });

    class IrpvPost extends Base {
      declare title: string | null;
      declare body: string | null;
      declare irpvTaggings: AssociationProxy<IrpvTagging>;
      declare irpvTags: AssociationProxy<Base>;

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
    await expect(assoc.insertRecord(tag, false, false)).rejects.toThrow(RecordInvalid);
    expect(await IrpvTagging.where({ taggable_id: post.id }).count()).toBe(0);
  });

  it("loads through a join model", async () => {
    const post = await Post.find(posts("welcome").id);
    const tagsBefore = await (post as any).tags.toArray();
    expect(tagsBefore.length).toBeGreaterThan(0);

    const tag = tagsBefore[0];
    const postTags2 = await Post.joins(":tags").where({ id: post.id });
    expect(postTags2.length).toBeGreaterThan(0);
    expect(postTags2.map((p: any) => p.id)).toContain(post.id);
  });

  it("delete_all for with dependent option delete_all", async () => {
    const person = await Person.find(people("michael").id);
    const countBefore = await (person as any).jobsWithDependentDeleteAll.count();
    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).jobsWithDependentDeleteAll.deleteAll();
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(Number(refCountBefore) - Number(countBefore));
  });

  it("delete_all for with dependent option nullify", async () => {
    const person = await Person.find(people("michael").id);
    const countBefore = await (person as any).jobsWithDependentNullify.count();
    const jobCountBefore = await Job.count();
    const refCountBefore = await Reference.count();
    await (person as any).jobsWithDependentNullify.deleteAll();
    expect(await Job.count()).toBe(jobCountBefore);
    expect(await Reference.count()).toBe(refCountBefore);
  });
});
