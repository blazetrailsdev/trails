/**
 * Mirrors Rails activerecord/test/cases/associations/inverse_associations_test.rb
 */
import { describe, it, expect, beforeAll } from "vitest";
import {
  Base,
  association,
  registerModel,
  registerSubclass,
  enableSti,
  InverseOfAssociationNotFoundError,
  InverseOfAssociationRecursiveError,
} from "../index.js";
import { loadBelongsTo, loadHasOne, loadHasMany, setBelongsTo } from "../associations.js";
import { fixtures, setupFixtures } from "../test-helpers/fixtures.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Branch, BrokenBranch } from "../test-helpers/models/branch.js";
import { Human } from "../test-helpers/models/human.js";
import { Face } from "../test-helpers/models/face.js";
import { Interest } from "../test-helpers/models/interest.js";
import { Zine } from "../test-helpers/models/zine.js";
import { MixedCaseMonkey } from "../test-helpers/models/mixed-case-monkey.js";
import { Car } from "../test-helpers/models/car.js";
import { CpkCar, CpkCarReview, CpkAuthor, CpkBook, CpkOrder } from "../test-helpers/models/cpk.js";
import { Bulb } from "../test-helpers/models/bulb.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Rating } from "../test-helpers/models/rating.js";
import { Post, SpecialPost } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";
import { Sponsor } from "../test-helpers/models/sponsor.js";
import { Club } from "../test-helpers/models/club.js";
import { AdminAccount } from "../test-helpers/models/admin/account.js";
import { AdminUser } from "../test-helpers/models/admin/user.js";
import { User } from "../test-helpers/models/user.js";
import { Room } from "../test-helpers/models/room.js";
import { Company, Firm } from "../test-helpers/models/company.js";
import { Project } from "../test-helpers/models/project.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import { SpecialContract } from "../test-helpers/models/contract.js";
import { Book } from "../test-helpers/models/book.js";
import { Subscription } from "../test-helpers/models/subscription.js";
import { Subscriber } from "../test-helpers/models/subscriber.js";

/**
 * Rails' `with_has_many_inversing(model = ActiveRecord::Base)` toggles
 * `has_many_inversing` for the duration of the block. We mirror it as a
 * per-model flag that is reset afterwards.
 */
async function withHasManyInversing(
  model: typeof Base,
  fn: () => Promise<void> | void,
): Promise<void> {
  const prev = (model as any).hasManyInversing;
  (model as any).hasManyInversing = true;
  try {
    await fn();
  } finally {
    (model as any).hasManyInversing = prev;
  }
}

/**
 * Rails' `with_automatic_scope_inversing(*reflections)` temporarily marks each
 * reflection's target class as allowing automatic inverse detection through
 * scoped associations.
 */
async function withAutomaticScopeInversing(
  reflections: any[],
  fn: () => Promise<void> | void,
): Promise<void> {
  const saved = reflections.map((r) => ({
    r,
    prevAutoScope: r.klass.automaticScopeInversing,
    prevNameCache: r._inverseNameCache,
    prevOfCache: r._inverseOfCache,
  }));
  for (const { r } of saved) {
    r.klass.automaticScopeInversing = true;
    r._inverseNameCache = undefined;
    r._inverseOfCache = undefined;
  }
  try {
    await fn();
  } finally {
    for (const { r, prevAutoScope, prevNameCache, prevOfCache } of saved) {
      r.klass.automaticScopeInversing = prevAutoScope;
      r._inverseNameCache = prevNameCache;
      r._inverseOfCache = prevOfCache;
    }
  }
}

describe("AutomaticInverseFindingTests", () => {
  const { books } = fixtures(
    ["ratings", "comments", "cars", "bulbs", "books", "subscriptions", "subscribers"],
    {
      schema: canonicalSchema,
    },
  );
  beforeAll(() => {
    [
      MixedCaseMonkey,
      Human,
      Face,
      Car,
      Bulb,
      Comment,
      Rating,
      Post,
      SpecialPost,
      Author,
      AdminAccount,
      AdminUser,
      User,
      Room,
      Company,
      SpecialContract,
      Book,
      Subscription,
      Subscriber,
      CpkCar,
      CpkCarReview,
    ].forEach((m) => registerModel(m));
  });

  it("has one and belongs to should find inverse automatically on multiple word name", () => {
    const monkeyReflection = (MixedCaseMonkey as any).reflectOnAssociation("human");
    const humanReflection = (Human as any).reflectOnAssociation("mixedCaseMonkey");

    expect(monkeyReflection.hasInverse()).toBe(true);
    expect(monkeyReflection.inverseOf()).toBe(humanReflection);

    expect(humanReflection.hasInverse()).toBe(true);
    expect(humanReflection.inverseOf()).toBe(monkeyReflection);
  });

  it("has many and belongs to should find inverse automatically for model in module", () => {
    const accountReflection = (AdminAccount as any).reflectOnAssociation("users");
    const userReflection = (AdminUser as any).reflectOnAssociation("account");
    expect(accountReflection.hasInverse()).toBe(true);
    expect(accountReflection.inverseOf()).toBe(userReflection);
  });

  it("has one and belongs to should find inverse automatically", () => {
    const carReflection = (Car as any).reflectOnAssociation("bulb");
    const bulbReflection = (Bulb as any).reflectOnAssociation("car");

    expect(carReflection.hasInverse()).toBe(true);
    expect(carReflection.inverseOf()).toBe(bulbReflection);

    expect(bulbReflection.hasInverse()).toBe(true);
    expect(bulbReflection.inverseOf()).toBe(carReflection);
  });

  it("has many and belongs to should find inverse automatically", () => {
    const commentReflection = (Comment as any).reflectOnAssociation("ratings");
    const ratingReflection = (Rating as any).reflectOnAssociation("comment");

    expect(commentReflection.hasInverse()).toBe(true);
    expect(commentReflection.inverseOf()).toBe(ratingReflection);
  });

  it("has many and belongs to should find inverse automatically for extension block", () => {
    const commentReflection = (Comment as any).reflectOnAssociation("post");
    const postReflection = (Post as any).reflectOnAssociation("comments");

    expect(postReflection.hasInverse()).toBe(true);
    expect(postReflection.inverseOf()).toBe(commentReflection);
  });

  it("has many and belongs to should find inverse automatically for sti", () => {
    const authorReflection = (Author as any).reflectOnAssociation("posts");
    const authorChildReflection = (Author as any).reflectOnAssociation("specialPosts");
    const postReflection = (Post as any).reflectOnAssociation("author");

    expect(authorReflection.hasInverse()).toBe(true);
    expect(authorReflection.inverseOf()).toBe(postReflection);

    expect(authorChildReflection.hasInverse()).toBe(true);
    expect(authorChildReflection.inverseOf()).toBe(postReflection);
  });

  it("has one and belongs to with non default foreign key should not find inverse automatically", async () => {
    const user = await User.create({});
    const ownedRoom = await Room.create({ owner_id: (user as any).id });
    expect(await (user as any).room).toBeNull();
    expect((ownedRoom as any).user).toBeNull();
    expect((await (ownedRoom as any).loadBelongsTo("owner")).id).toBe((user as any).id);
    expect((await (user as any).loadHasOne("ownedRoom")).id).toBe((ownedRoom as any).id);
  });

  it("has one and belongs to with custom association name should not find wrong inverse automatically", () => {
    const userReflection = (Room as any).reflectOnAssociation("user");
    const ownerReflection = (Room as any).reflectOnAssociation("owner");
    const roomReflection = (User as any).reflectOnAssociation("room");
    expect(userReflection.hasInverse()).toBe(true);
    expect(userReflection.inverseOf()).toBe(roomReflection);
    expect(ownerReflection.hasInverse()).toBe(false);
    expect(ownerReflection.inverseOf()).not.toBe(roomReflection);
  });

  it("has many and belongs to with a scope and automatic scope inversing should find inverse automatically", async () => {
    const contactsReflection = (Company as any).reflectOnAssociation("specialContracts");
    const companyReflection = (SpecialContract as any).reflectOnAssociation("company");
    expect(contactsReflection.scope).toBeTruthy();
    expect(companyReflection.scope).toBeFalsy();
    await withAutomaticScopeInversing([contactsReflection, companyReflection], () => {
      expect(contactsReflection.hasInverse()).toBe(true);
      expect(contactsReflection.inverseOf()).toBe(companyReflection);
      expect(companyReflection.inverseOf()).not.toBe(contactsReflection);
    });
  });

  it("has one and belongs to with a scope and automatic scope inversing should find inverse automatically", async () => {
    const postReflection = (Author as any).reflectOnAssociation("recentPost");
    const authorReflection = (Post as any).reflectOnAssociation("author");
    expect(postReflection.scope).toBeTruthy();
    expect(authorReflection.scope).toBeFalsy();
    await withAutomaticScopeInversing([postReflection, authorReflection], () => {
      expect(postReflection.hasInverse()).toBe(true);
      expect(postReflection.inverseOf()).toBe(authorReflection);
      expect(authorReflection.inverseOf()).not.toBe(postReflection);
    });
  });

  it("has many with scoped belongs to does not find inverse automatically", async () => {
    const book = books("tlg");
    // Mirror Rails: book.update_attribute(:author_visibility, :invisible) so the scoped
    // belongs_to query (author_visibility: 0) returns nil even when the FK is set.
    await (book as any).updateAttribute("author_visibility", 1);
    expect(await association(book, "subscriptions").build({}).book).toBeNull();

    const subscriptionReflection = (Book as any).reflectOnAssociation("subscriptions");
    const bookReflection = (Subscription as any).reflectOnAssociation("book");
    expect(subscriptionReflection.scope).toBeFalsy();
    expect(bookReflection.scope).toBeTruthy();

    await withAutomaticScopeInversing([bookReflection, subscriptionReflection], async () => {
      expect(await association(book, "subscriptions").build({}).book).toBeNull();
    });
  });

  it("has one and belongs to automatic inverse shares objects", async () => {
    const car = (await Car.first())!;
    const bulb = await Bulb.createBang({ car });

    expect((car as any).bulb).toBe(bulb);

    (car as any).bulb.color = "Blue";
    expect((car as any).bulb.color).toBe((bulb as any).color);

    (bulb as any).color = "Red";
    expect((bulb as any).color).toBe((car as any).bulb.color);
  });

  it("has many and belongs to automatic inverse shares objects on rating", async () => {
    const comment = (await Comment.first())!;
    const rating = await Rating.createBang({ comment_id: (comment as any).id });

    const ratingComment = (await loadBelongsTo(rating, "comment", { inverseOf: "ratings" })) as any;
    expect(ratingComment.id).toBe((comment as any).id);

    ratingComment.body = "Fennec foxes are the smallest of the foxes.";
    expect((rating as any).comment.body).toBe(ratingComment.body);
  });

  it("has many and belongs to automatic inverse shares objects on comment", async () => {
    const rating = await Rating.createBang({});
    const comment = (await Comment.first())!;
    await loadBelongsTo(rating, "comment", { inverseOf: "ratings" });
    (rating as any).comment = comment;

    expect((rating as any).comment).toBe(comment);

    (rating as any).comment.body = "Fennec foxes are the smallest of the foxes.";
    expect((rating as any).comment.body).toBe((comment as any).body);
  });

  it("belongs to should find inverse has many automatically", async () => {
    expect((Subscription as any).automaticallyInvertPluralAssociations).toBe(true);

    const book = await Book.createBang({});
    const subscriber = (book as any).subscribers.new({ nick: "Nickname" });

    await subscriber.saveBang();

    const reloaded = await book.reload();
    const subscribers = await (reloaded as any).subscribers.toArray();
    expect(subscribers.map((s: any) => s.nick)).toEqual([subscriber.nick]);
    expect(await (reloaded as any).subscribers.count()).toBe(1);
  });

  it("polymorphic and has many through relationships should not have inverses", () => {
    const sponsorReflection = (Sponsor as any).reflectOnAssociation("sponsorable");
    expect(sponsorReflection.hasInverse()).toBe(false);

    const clubReflection = (Club as any).reflectOnAssociation("members");
    expect(clubReflection.hasInverse()).toBe(false);
  });

  it("polymorphic has one should find inverse automatically", () => {
    const humanReflection = (Human as any).reflectOnAssociation("polymorphicFaceWithoutInverse");
    expect(humanReflection.hasInverse()).toBe(true);
  });

  it("has many inverse of derived automatically despite of composite foreign key", () => {
    const carReviewReflection = (CpkCar as any).reflectOnAssociation("carReviews");
    expect(carReviewReflection.hasInverse()).toBe(true);
    expect(carReviewReflection.inverseOf()).toBe((CpkCarReview as any).reflectOnAssociation("car"));
  });

  it("belongs to inverse of derived automatically despite of composite foreign key", () => {
    const carReflection = (CpkCarReview as any).reflectOnAssociation("car");
    expect(carReflection.hasInverse()).toBe(true);
    expect(carReflection.inverseOf()).toBe((CpkCar as any).reflectOnAssociation("carReviews"));
  });
});

describe("InverseAssociationTests", () => {
  fixtures({
    companies: [Company, {}],
    developers: [Developer, {}],
    projects: [Project, {}],
  });

  beforeAll(() => {
    [Human, Face, Interest, Club, Sponsor, Company, Firm, Developer, Project, AuditLog].forEach(
      (m) => registerModel(m),
    );
    enableSti(Company);
    registerSubclass(Firm);
  });

  it("should allow for inverse of options in associations", () => {
    expect(() => {
      class Wheels extends Base {}
      (Wheels as any).hasMany("wheels", { inverseOf: "car" });
    }).not.toThrow();
    expect(() => {
      class Engines extends Base {}
      (Engines as any).hasOne("engine", { inverseOf: "car" });
    }).not.toThrow();
    expect(() => {
      class Cars extends Base {}
      (Cars as any).belongsTo("car", { inverseOf: "driver" });
    }).not.toThrow();
  });

  it("should be able to ask a reflection if it has an inverse", () => {
    expect((Human as any).reflectOnAssociation("face").hasInverse()).toBe(true);
    expect((Human as any).reflectOnAssociation("interests").hasInverse()).toBe(true);
    expect((Face as any).reflectOnAssociation("human").hasInverse()).toBe(true);

    expect((Club as any).reflectOnAssociation("sponsor").hasInverse()).toBe(false);
    expect((Club as any).reflectOnAssociation("memberships").hasInverse()).toBe(false);
    expect((Sponsor as any).reflectOnAssociation("sponsorClub").hasInverse()).toBe(false);
  });

  it("inverse of method should supply the actual reflection instance it is the inverse of", () => {
    expect((Human as any).reflectOnAssociation("face").inverseOf()).toBe(
      (Face as any).reflectOnAssociation("human"),
    );
    expect((Human as any).reflectOnAssociation("interests").inverseOf()).toBe(
      (Interest as any).reflectOnAssociation("human"),
    );
    expect((Face as any).reflectOnAssociation("human").inverseOf()).toBe(
      (Human as any).reflectOnAssociation("face"),
    );
  });

  it("associations with no inverse of should return nil", () => {
    expect((Club as any).reflectOnAssociation("sponsor").inverseOf()).toBeNull();
    expect((Club as any).reflectOnAssociation("memberships").inverseOf()).toBeNull();
    expect((Sponsor as any).reflectOnAssociation("sponsorClub").inverseOf()).toBeNull();
  });

  it("polymorphic associations dont attempt to find inverse of", () => {
    const sponsorRef = (Sponsor as any).reflectOnAssociation("sponsor");
    expect(() => sponsorRef.klass).toThrow();
    expect(sponsorRef.inverseOf()).toBeNull();

    const superHumanRef = (Face as any).reflectOnAssociation("superHuman");
    expect(() => superHumanRef.klass).toThrow();
    expect(superHumanRef.inverseOf()).toBeNull();
  });

  it("this inverse stuff", async () => {
    const firm = await Firm.create({ name: "Adequate Holdings" });
    await Project.create({ name: "Project 1", firm });
    await Developer.create({ name: "Gorbypuff", firm });

    const newProject = (await (Project as any).last()) as Project;
    expect((Project as any).reflectOnAssociation("leadDeveloper").inverseOf()).toBeTruthy();
    expect(await (newProject as any).loadHasOne("leadDeveloper")).toBeTruthy();
  });
});

describe("InverseHasOneTests", () => {
  const { humans } = fixtures(["humans", "faces"], { schema: canonicalSchema });
  beforeAll(() => {
    registerModel(Human);
    registerModel(Face);
  });

  it("parent instance should be shared with child on find", async () => {
    const human = humans("gordon");
    const face = (await loadHasOne(human, "face", { inverseOf: "human" }))!;
    expect((face as any).human.name).toBe(human.name);
    (human as any).name = "Bongo";
    expect((face as any).human.name).toBe((human as any).name);
    (face as any).human.name = "Mungo";
    expect((face as any).human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with eager loaded child on find", async () => {
    let human = (await Human.where({ name: "Gordon" }).includes("face"))[0];
    let face = (human as any).face;
    expect(face.human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect(face.human.name).toBe((human as any).name);
    face.human.name = "Mungo";
    expect(face.human.name).toBe((human as any).name);

    human = (await Human.where({ name: "Gordon" }).includes("face").order("faces.id"))[0];
    face = (human as any).face;
    expect(face.human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect(face.human.name).toBe((human as any).name);
    face.human.name = "Mungo";
    expect(face.human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with newly built child", async () => {
    const human = (await Human.first())!;
    const face = (human as any).buildFace({ description: "haunted" });
    expect(face.human).not.toBeNull();
    expect(face.human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect(face.human.name).toBe((human as any).name);
    face.human.name = "Mungo";
    expect(face.human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with newly created child", async () => {
    const human = (await Human.first())!;
    const face = await (human as any).createFace({ description: "haunted" });
    expect(face.human).not.toBeNull();
    expect(face.human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect(face.human.name).toBe((human as any).name);
    face.human.name = "Mungo";
    expect(face.human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with newly created child via bang method", async () => {
    const human = (await Human.first())!;
    const face = await (human as any).createFaceBang({ description: "haunted" });
    expect(face.human).not.toBeNull();
    expect(face.human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect(face.human.name).toBe((human as any).name);
    face.human.name = "Mungo";
    expect(face.human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with replaced via accessor child", async () => {
    const human = (await Human.first())!;
    const face = new Face({ description: "haunted" }) as any;
    (human as any).face = face;
    expect(face.human).not.toBeNull();
    expect(face.human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect(face.human.name).toBe((human as any).name);
    face.human.name = "Mungo";
    expect(face.human.name).toBe((human as any).name);
  });

  it("child instance should be shared with replaced via accessor parent", async () => {
    const human = humans("gordon");
    const face = await Face.createBang({ description: "haunted", human: humans("steve") });
    (face as any).human = human;
    expect((human as any).face).toBe(face);
    expect((human as any).face.description).toBe((face as any).description);
    (face as any).description = "Bongo";
    expect((human as any).face.description).toBe((face as any).description);
    (human as any).face.description = "Mungo";
    expect((human as any).face.description).toBe((face as any).description);
  });

  it("trying to use inverses that dont exist should raise an error", async () => {
    const human = (await Human.first())!;
    await expect(
      loadHasOne(human, "confusedFace", { className: "Face", inverseOf: "cnffusedHuman" }),
    ).rejects.toThrow(InverseOfAssociationNotFoundError);
  });

  it("trying to use inverses that dont exist should have suggestions for fix", async () => {
    const human = (await Human.first())!;
    const err = await loadHasOne(human, "confusedFace", {
      className: "Face",
      inverseOf: "cnffusedHuman",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(InverseOfAssociationNotFoundError);
    expect(err.detailedMessage()).toMatch(/Did you mean\?/);
    expect(err.corrections[0]).toBe("confusedHuman");
  });
});

describe("InverseHasManyTests", () => {
  const { humans, comments, authors } = fixtures(
    // authors before posts: a `ref("authors", …)` in the posts fixtures resolves
    // to a CRC32 fallback id unless the authors set is already loaded, which
    // would orphan every post's `author_id`.
    ["humans", "interests", "authors", "posts", "comments", "cpkAuthors", "cpkOrders", "cpkBooks"],
    { schema: canonicalSchema },
  );
  beforeAll(async () => {
    [Human, Interest, Post, SpecialPost, Author, Comment, CpkAuthor, CpkBook, CpkOrder].forEach(
      (m) => registerModel(m),
    );
    await (CpkAuthor as any).loadSchema();
    await (CpkBook as any).loadSchema();
    await (CpkOrder as any).loadSchema();
  });

  it("parent instance should be shared with every child on find", async () => {
    const human = humans("gordon");
    const interests = await loadHasMany(human, "interests", { inverseOf: "human" });
    expect(interests.length).toBeGreaterThan(0);
    for (const interest of interests) {
      expect((interest as any).human.name).toBe(human.name);
      (human as any).name = "Bongo";
      expect((interest as any).human.name).toBe((human as any).name);
      (interest as any).human.name = "Mungo";
      expect((interest as any).human.name).toBe((human as any).name);
    }
  });

  it("parent instance should be shared with every child on find for sti", async () => {
    const author = authors("david");
    const posts = await loadHasMany(author, "posts", { inverseOf: "author" });
    expect(posts.length).toBeGreaterThan(0);
    for (const post of posts) {
      expect((post as any).author.name).toBe((author as any).name);
      (author as any).name = "Bongo";
      expect((post as any).author.name).toBe((author as any).name);
      (post as any).author.name = "Mungo";
      expect((post as any).author.name).toBe((author as any).name);
    }

    const specialPosts = await loadHasMany(author, "specialPosts", {
      className: "SpecialPost",
      inverseOf: "author",
    });
    expect(specialPosts.length).toBeGreaterThan(0);
    for (const post of specialPosts) {
      expect((post as any).author.name).toBe((author as any).name);
      (author as any).name = "Bongo";
      expect((post as any).author.name).toBe((author as any).name);
      (post as any).author.name = "Mungo";
      expect((post as any).author.name).toBe((author as any).name);
    }
  });

  it("parent instance should be shared with eager loaded children", async () => {
    let human = (await Human.where({ name: "Gordon" }).includes("interests"))[0];
    let interests = (human as any).interests;
    for (const interest of await interests.toArray()) {
      expect(interest.human.name).toBe((human as any).name);
      (human as any).name = "Bongo";
      expect(interest.human.name).toBe((human as any).name);
      interest.human.name = "Mungo";
      expect(interest.human.name).toBe((human as any).name);
    }

    human = (await Human.where({ name: "Gordon" }).includes("interests").order("interests.id"))[0];
    interests = (human as any).interests;
    for (const interest of await interests.toArray()) {
      expect(interest.human.name).toBe((human as any).name);
      (human as any).name = "Bongo";
      expect(interest.human.name).toBe((human as any).name);
      interest.human.name = "Mungo";
      expect(interest.human.name).toBe((human as any).name);
    }
  });

  it("parent instance should be shared with newly block style built child", async () => {
    const human = (await Human.first())!;
    const interest = association(human, "interests").build({ topic: "Industrial Revolution" });
    expect((interest as any).topic).not.toBeNull();
    expect((interest as any).human).not.toBeNull();
    expect((interest as any).human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect((interest as any).human.name).toBe((human as any).name);
    (interest as any).human.name = "Mungo";
    expect((interest as any).human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with newly created via bang method child", async () => {
    const human = (await Human.first())!;
    const interest = await association(human, "interests").createBang({
      topic: "Industrial Revolution Re-enactment",
    });
    expect((interest as any).human).not.toBeNull();
    expect((interest as any).human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect((interest as any).human.name).toBe((human as any).name);
    (interest as any).human.name = "Mungo";
    expect((interest as any).human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with newly block style created child", async () => {
    const human = (await Human.first())!;
    const interest = await association(human, "interests").create({
      topic: "Industrial Revolution Re-enactment",
    });
    expect((interest as any).topic).not.toBeNull();
    expect((interest as any).human).not.toBeNull();
    expect((interest as any).human.name).toBe((human as any).name);
  });

  it("parent instance should be shared within create block of new child", async () => {
    const human = (await Human.first())!;
    const interest = await association(human, "interests").create({}, (i: any) => {
      expect(i.human).toBe(human);
    });
    expect((interest as any).human).toBe(human);
  });

  it("parent instance should be shared within build block of new child", async () => {
    const human = (await Human.first())!;
    const interest = association(human, "interests").build({}, (i: any) => {
      expect(i.human).toBe(human);
    });
    expect((interest as any).human).toBe(human);
  });

  it("parent instance should be shared with poked in child", async () => {
    const human = humans("gordon");
    const interest = await Interest.create({ topic: "Industrial Revolution Re-enactment" });
    await association(human, "interests").push(interest);
    expect((interest as any).human).not.toBeNull();
    expect((interest as any).human.name).toBe(human.name);
    (human as any).name = "Bongo";
    expect((interest as any).human.name).toBe((human as any).name);
    (interest as any).human.name = "Mungo";
    expect((interest as any).human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with replaced via accessor children", async () => {
    const human = (await Human.first())!;
    const interest = new Interest({ topic: "Industrial Revolution Re-enactment" });
    await association(human, "interests").replace([interest]);
    expect((interest as any).human).not.toBeNull();
    expect((interest as any).human.name).toBe((human as any).name);
    (human as any).name = "Bongo";
    expect((interest as any).human.name).toBe((human as any).name);
    (interest as any).human.name = "Mungo";
    expect((interest as any).human.name).toBe((human as any).name);
  });

  it("parent instance should be shared with first and last child", async () => {
    const human = (await Human.first())!;
    const interests = association(human, "interests");
    expect(((await interests.first()) as any).human).toBe(human);
    expect(((await interests.last()) as any).human).toBe(human);
  });

  it("parent instance should be shared with first n and last n children", async () => {
    const human = (await Human.first())!;
    const interests = association(human, "interests");
    const firstTwo = (await interests.first(2)) as any[];
    expect(firstTwo[0].human).toBe(human);
    expect(firstTwo[1].human).toBe(human);
    const lastTwo = (await interests.last(2)) as any[];
    expect(lastTwo[0].human).toBe(human);
    expect(lastTwo[1].human).toBe(human);
  });

  it("parent instance should find child instance using child instance id", async () => {
    const human = await Human.create({});
    const interest = await Interest.create({});
    await association(human, "interests").replace([interest]);
    const proxy = association(human, "interests");
    expect(((await proxy.first()) as any).id).toBe((interest as any).id);
    expect(((await proxy.find((interest as any).id)) as any).id).toBe((interest as any).id);
    expect(((await proxy.first()) as any).human).toBe(human);
    expect(((await proxy.find((interest as any).id)) as any).human).toBe(human);
  });

  it("parent instance should find child instance using child instance id when created", async () => {
    const human = await Human.create({});
    const interest = await Interest.create({ human_id: (human as any).id });
    const proxy = association(human, "interests");
    expect(((await proxy.first()) as any).human).toBe(human);
    const found = (await proxy.find((interest as any).id)) as any;
    expect(found.human).toBe(human);
    expect(found.human.name).toBeNull();
    (human as any).name = "Ben Bitdiddle";
    expect(((await proxy.find((interest as any).id)) as any).human.name).toBe((human as any).name);
  });

  it("find on child instance with id should not load all child records", async () => {
    const human = await Human.create({});
    const interest = await Interest.create({ human_id: (human as any).id });
    const proxy = association(human, "interests");
    await proxy.find((interest as any).id);
    expect(proxy.loaded).toBe(false);
  });

  it("find on child instance with id should set inverse instances", async () => {
    const human = await Human.create({});
    const interest = await Interest.create({ human_id: (human as any).id });
    const child = (await association(human, "interests").find((interest as any).id)) as any;
    expect(child.human).not.toBeNull();
  });

  it("find on child instances with ids should set inverse instances", async () => {
    const human = await Human.create({});
    const i1 = await Interest.create({ human_id: (human as any).id });
    const i2 = await Interest.create({ human_id: (human as any).id });
    const children = (await association(human, "interests").find([
      (i1 as any).id,
      (i2 as any).id,
    ])) as any[];
    for (const child of children) {
      expect(child.human).not.toBeNull();
    }
  });

  it("inverse should be set on composite primary key child", async () => {
    const author = new CpkAuthor({ name: "John" });
    const book = association(author, "books").build({ id: [null, 1], title: "The Rails Way" });
    new CpkOrder({ book, status: "paid" });
    await (author as any).saveBang();

    expect((book as any).association("order").isLoaded()).toBe(true);
  });

  it("raise record not found error when invalid ids are passed", async () => {
    await Interest.deleteAll();
    const human = await Human.create({});
    await expect(association(human, "interests").find(245324523)).rejects.toThrow();
    await expect(
      association(human, "interests").find([8432342, 2390102913, 2453245234523452]),
    ).rejects.toThrow();
  });

  it("raise record not found error when no ids are passed", async () => {
    const human = await Human.create({});
    const proxy = association(human, "interests");
    await proxy.load();
    const err = await (proxy as any).find().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RecordNotFound");
    expect(err.model).toBe("Interest");
    expect(err.primaryKey).toBe("id");
  });

  it("trying to use inverses that dont exist should raise an error", async () => {
    const human = (await Human.first())!;
    await expect(
      loadHasMany(human, "secretInterests", { className: "Interest", inverseOf: "secretHuman" }),
    ).rejects.toThrow(InverseOfAssociationNotFoundError);
  });

  it("child instance should point to parent without saving", async () => {
    const human = new Human();
    const interest = await Interest.create({ topic: "Industrial Revolution Re-enactment" });
    await association(human, "interests").push(interest);
    expect((interest as any).human).not.toBeNull();
    (interest as any).human.name = "Charles";
    expect((interest as any).human.name).toBe((human as any).name);
    expect(human.isPersisted()).toBe(false);
  });

  it("inverse instance should be set before find callbacks are run", async () => {
    (Interest as any).afterFind((interest: any) => {
      if (!(interest.association("human").isLoaded() && interest.human != null)) {
        throw new Error("inverse not set before after_find");
      }
    });
    try {
      const human = (await Human.first())!;
      const interests = await loadHasMany(human, "interests", { inverseOf: "human" });
      expect(interests.length).toBeGreaterThan(0);

      const preloaded = (await (Human as any).includes("interests").first())!;
      expect(preloaded.association("interests").target.length).toBeGreaterThan(0);

      const joined = (await (Human as any).joins("interests").includes("interests").first())!;
      expect(joined.association("interests").target.length).toBeGreaterThan(0);
    } finally {
      (Interest as any).resetCallbacks("find");
    }
  });

  it("inverse instance should be set before initialize callbacks are run", async () => {
    (Interest as any).afterInitialize((interest: any) => {
      if (!interest.isNewRecord()) {
        if (!(interest.association("human").isLoaded() && interest.human != null)) {
          throw new Error("inverse not set before after_initialize");
        }
      }
    });
    try {
      const human = (await Human.first())!;
      const interests = await loadHasMany(human, "interests", { inverseOf: "human" });
      expect(interests.length).toBeGreaterThan(0);
    } finally {
      (Interest as any).resetCallbacks("initialize");
    }
  });

  it("inverse works when the association self references the same object", async () => {
    const comment = comments("greetings");
    await Comment.create({
      parent_id: (comment as any).id,
      post_id: (comment as any).post_id,
      body: "New Comment",
    });
    (comment as any).body = "OMG";
    const children = await loadHasMany(comment, "children", {
      className: "Comment",
      foreignKey: "parent_id",
      inverseOf: "parent",
    });
    expect((children[0] as any).parent.body).toBe((comment as any).body);
  });

  it("changing the association id makes the inversed association target stale", async () => {
    const post1 = (await Post.first())!;
    const post2 = (await Post.all().order("id").offset(1).first())!;
    const comment = (await loadHasMany(post1, "comments", { inverseOf: "post" }))[0] as any;
    expect(await loadBelongsTo(comment, "post", { inverseOf: "comments" })).toBe(post1);
    await comment.updateBang({ post_id: (post2 as any).id });
    const reloaded = (await loadBelongsTo(comment, "post", { inverseOf: "comments" })) as any;
    expect(reloaded.id).toBe((post2 as any).id);
  });
});

describe("InverseBelongsToTests", () => {
  const { faces, interests } = fixtures(["humans", "faces", "interests"], {
    schema: canonicalSchema,
  });
  beforeAll(() => {
    [Human, Face, Interest].forEach((m) => registerModel(m));
  });

  it("child instance should be shared with parent on find", async () => {
    const face = faces("trusting");
    const human = (await loadBelongsTo(face, "human", { inverseOf: "face" }))!;
    expect((human as any).face.description).toBe((face as any).description);
    (face as any).description = "gormless";
    expect((human as any).face.description).toBe((face as any).description);
    (human as any).face.description = "pleasing";
    expect((human as any).face.description).toBe((face as any).description);
  });

  it("eager loaded child instance should be shared with parent on find", async () => {
    let face = (await Face.where({ description: "trusting" }).includes("human"))[0] as any;
    let human = face.human;
    expect(human.face.description).toBe(face.description);
    face.description = "gormless";
    expect(human.face.description).toBe(face.description);
    human.face.description = "pleasing";
    expect(human.face.description).toBe(face.description);

    face = (
      await Face.where({ description: "trusting" }).includes("human").order("humans.id")
    )[0] as any;
    human = face.human;
    expect(human.face.description).toBe(face.description);
    face.description = "gormless";
    expect(human.face.description).toBe(face.description);
    human.face.description = "pleasing";
    expect(human.face.description).toBe(face.description);
  });

  it("child instance should be shared with newly built parent", async () => {
    const face = faces("trusting");
    const human = (face as any).buildHuman({ name: "Charles" });
    expect(human.face).not.toBeNull();
    expect(human.face.description).toBe((face as any).description);
    (face as any).description = "gormless";
    expect(human.face.description).toBe((face as any).description);
    human.face.description = "pleasing";
    expect(human.face.description).toBe((face as any).description);
  });

  it("child instance should be shared with newly created parent", async () => {
    const face = faces("trusting");
    const human = await (face as any).createHuman({ name: "Charles" });
    expect(human.face).not.toBeNull();
    expect(human.face.description).toBe((face as any).description);
    (face as any).description = "gormless";
    expect(human.face.description).toBe((face as any).description);
    human.face.description = "pleasing";
    expect(human.face.description).toBe((face as any).description);
  });

  it("should not try to set inverse instances when the inverse is a has many", async () => {
    const interest = interests("trainspotting");
    const human = (await loadBelongsTo(interest, "human", { inverseOf: "interests" }))!;
    // Rails: human.interests.detect { |_iz| _iz.id == interest.id } — block-find
    // over the CollectionProxy (Enumerable#detect loads the target), not the AR
    // PK finder.
    const iz = await (human as any).interests.detect((i: any) => i.id === (interest as any).id);
    expect(iz).toBeDefined();
    expect(iz.topic).toBe((interest as any).topic);
    (interest as any).topic = "Eating cheese with a spoon";
    expect(iz.topic).not.toBe((interest as any).topic);
    iz.topic = "Cow tipping";
    expect((interest as any).topic).not.toBe(iz.topic);
  });

  it("with has many inversing should try to set inverse instances when the inverse is a has many", async () => {
    await withHasManyInversing(Human, async () => {
      const interest = interests("trainspotting");
      const human = (await loadBelongsTo(interest, "human", { inverseOf: "interests" })) as any;
      const cached = human._associationCache("interests")?.target as any[];
      const iz = cached.find((i: any) => i.id === (interest as any).id);
      expect(iz).toBeDefined();
      expect(iz.topic).toBe((interest as any).topic);
      (interest as any).topic = "Eating cheese with a spoon";
      expect(iz.topic).toBe((interest as any).topic);
      iz.topic = "Cow tipping";
      expect((interest as any).topic).toBe(iz.topic);
    });
  });

  it("with has many inversing should have single record when setting record through attribute in build method", async () => {
    await withHasManyInversing(Human, async () => {
      const human = await Human.create({});
      association(human, "interests").build({ human });
      expect(await association(human, "interests").size()).toBe(1);
      await (human as any).saveBang();
      expect(await association(human, "interests").size()).toBe(1);
    });
  });

  it("with has many inversing does not trigger association callbacks on set when the inverse is a has many", async () => {
    await withHasManyInversing(Interest, async () => {
      const interest = interests("trainspotting");
      const human = (await loadBelongsTo(interest, "humanWithCallbacks", {
        className: "Human",
        foreignKey: "human_id",
        inverseOf: "interestsWithCallbacks",
      })) as any;
      expect(human.addCallbackCalled).toBe(false);
    });
  });

  it("with has many inversing does not add duplicate associated objects", async () => {
    await withHasManyInversing(Interest, async () => {
      const human = new Human();
      const interest = new Interest();
      (interest as any).human = human;
      await association(human, "interests").push(interest);
      expect(await association(human, "interests").size()).toBe(1);
    });
  });

  it("with has many inversing does not add unsaved duplicate records when collection is loaded", async () => {
    await withHasManyInversing(Interest, async () => {
      const human = await Human.create({});
      await association(human, "interests").load();
      const interest = new Interest();
      setBelongsTo(interest, "human", human, { inverseOf: "interests" });
      await association(human, "interests").push(interest);
      expect(await association(human, "interests").size()).toBe(1);
    });
  });

  it("with has many inversing does not add saved duplicate records when collection is loaded", async () => {
    await withHasManyInversing(Interest, async () => {
      const human = await Human.create({});
      await association(human, "interests").load();
      const interest = await Interest.create({ human_id: (human as any).id });
      await association(human, "interests").push(interest);
      expect(await association(human, "interests").size()).toBe(1);
    });
  });

  it("unscope does not set inverse when incorrect", async () => {
    const interest = interests("trainspotting");
    const human = (await loadBelongsTo(interest, "human", { inverseOf: "interests" }))!;
    const createdHuman = await Human.create({ name: "wrong human" });
    const foundInterest = await (createdHuman as any).interests
      .or((human as any).interests)
      .detect((thisInterest: any) => (interest as any).id === thisInterest.id);
    const foundHuman = await loadBelongsTo(foundInterest, "human", { inverseOf: "interests" });
    expect((foundHuman as any).id).toBe((human as any).id);
  });

  it("or does not set inverse when incorrect", async () => {
    const interest = interests("trainspotting");
    const human = (await loadBelongsTo(interest, "human", { inverseOf: "interests" }))!;
    const createdHuman = await Human.create({ name: "wrong human" });
    const foundInterest = await (createdHuman as any).interests
      .unscope("where")
      .detect((thisInterest: any) => (interest as any).id === thisInterest.id);
    const foundHuman = await loadBelongsTo(foundInterest, "human", { inverseOf: "interests" });
    expect((foundHuman as any).id).toBe((human as any).id);
  });

  it("child instance should be shared with replaced via accessor parent", async () => {
    const face = faces("trusting");
    const human = new Human({ name: "Charles" });
    (face as any).human = human;
    expect((human as any).face).not.toBeNull();
    expect((human as any).face.description).toBe((face as any).description);
    (face as any).description = "gormless";
    expect((human as any).face.description).toBe((face as any).description);
    (human as any).face.description = "pleasing";
    expect((human as any).face.description).toBe((face as any).description);
  });

  it("trying to use inverses that dont exist should raise an error", async () => {
    const face = (await Face.first())!;
    await expect(
      loadBelongsTo(face, "confusedHuman", { className: "Human", inverseOf: "cnffusedFace" }),
    ).rejects.toThrow(InverseOfAssociationNotFoundError);
  });

  it("trying to use inverses that dont exist should have suggestions for fix", async () => {
    const face = (await Face.first())!;
    const err = await loadBelongsTo(face, "confusedHuman", {
      className: "Human",
      inverseOf: "cnffusedFace",
    }).catch((e) => e);
    expect(err).toBeInstanceOf(InverseOfAssociationNotFoundError);
    expect(err.detailedMessage()).toMatch(/Did you mean\?/);
    expect(err.corrections[0]).toBe("confusedFace");
  });

  it("building has many parent association inverses one record", async () => {
    await withHasManyInversing(Interest, async () => {
      const interest = new Interest();
      (interest as any).buildHuman();
      expect(await association((interest as any).human, "interests").size()).toBe(1);
      await (interest as any).saveBang();
      expect(await association((interest as any).human, "interests").size()).toBe(1);
    });
  });
});

describe("InversePolymorphicBelongsToTests", () => {
  const { faces, interests } = fixtures(["humans", "faces", "interests"], {
    schema: canonicalSchema,
  });
  beforeAll(() => {
    [Human, Face, Interest].forEach((m) => registerModel(m));
  });

  it("child instance should be shared with parent on find", async () => {
    const face = faces("confused");
    const human = (await loadBelongsTo(face, "polymorphicHuman", {
      polymorphic: true,
      inverseOf: "polymorphicFace",
    })) as any;
    expect(human.polymorphicFace.description).toBe((face as any).description);
    (face as any).description = "gormless";
    expect(human.polymorphicFace.description).toBe((face as any).description);
    human.polymorphicFace.description = "pleasing";
    expect(human.polymorphicFace.description).toBe((face as any).description);
  });

  it("eager loaded child instance should be shared with parent on find", async () => {
    let face = (await Face.where({ description: "confused" }).includes("human"))[0] as any;
    let human = (await loadBelongsTo(face, "polymorphicHuman", {
      polymorphic: true,
      inverseOf: "polymorphicFace",
    })) as any;
    expect(human.polymorphicFace.description).toBe(face.description);
    face.description = "gormless";
    expect(human.polymorphicFace.description).toBe(face.description);
    human.polymorphicFace.description = "pleasing";
    expect(human.polymorphicFace.description).toBe(face.description);

    face = (
      await Face.where({ description: "confused" }).includes("human").order("humans.id")
    )[0] as any;
    human = (await loadBelongsTo(face, "polymorphicHuman", {
      polymorphic: true,
      inverseOf: "polymorphicFace",
    })) as any;
    expect(human.polymorphicFace.description).toBe(face.description);
    face.description = "gormless";
    expect(human.polymorphicFace.description).toBe(face.description);
    human.polymorphicFace.description = "pleasing";
    expect(human.polymorphicFace.description).toBe(face.description);
  });

  it("child instance should be shared with replaced via accessor parent", async () => {
    const face = faces("confused");
    await (face as any).loadBelongsTo("polymorphicHuman");
    expect((face as any).polymorphicHuman).not.toBeNull();
    const newHuman = new Human();
    (face as any).polymorphicHuman = newHuman;
    expect((newHuman as any).polymorphicFace.description).toBe((face as any).description);
    (face as any).description = "Bongo";
    expect((newHuman as any).polymorphicFace.description).toBe((face as any).description);
    (newHuman as any).polymorphicFace.description = "Mungo";
    expect((newHuman as any).polymorphicFace.description).toBe((face as any).description);
  });

  it("inversed instance should not be reloaded after stale state changed", async () => {
    const newHuman = new Human();
    const face = new Face();
    (newHuman as any).face = face;
    const oldInversedHuman = (face as any).human;
    await (newHuman as any).saveBang();
    const newInversedHuman = (face as any).human;
    expect(oldInversedHuman).toBe(newInversedHuman);
  });

  it("inversed instance should not be reloaded after stale state changed with validation", async () => {
    const face = new Face({ human: new Human() });
    const oldInversedHuman = (face as any).human;
    await (face as any).saveBang();
    const newInversedHuman = (face as any).human;
    expect(oldInversedHuman).toBe(newInversedHuman);
  });

  it("inversed instance should load after autosave if it is not already loaded", async () => {
    const human = await Human.createBang({});
    await Face.createBang({ human_id: (human as any).id });
    const faceAssoc = (human as any).association("autosaveFace");
    const face = await faceAssoc.loadTarget();

    await face.reload(); // clear cached load of autosave_human
    face.description = "new description";
    await human.saveBang();

    // After the owner save, autosave's set_inverse_instance must have wired the
    // child's belongs_to back to the owner without a fresh DB load.
    expect(face.association("autosaveHuman").isLoaded()).toBe(true);
    expect(face.association("autosaveHuman").target).not.toBeNull();
  });

  // Regression (trails-specific, surfaced in PR #3503): the module-level
  // `association()` helper returns a CollectionProxy for *every* association
  // type, so a has_one `createBang` used to append the new record to the
  // proxy's array `_target`. That array surfaced through `_associationCache`
  // as an array-shaped singular `target`, and `autosaveHasOne` bailed on
  // `Array.isArray(child)` — silently skipping the child on owner save.
  it("has_one createBang stores a single record as target, not an array", async () => {
    const human = await Human.createBang({});
    const face = await association(human, "autosaveFace").createBang({ description: "haunted" });

    const holder = (human as any).association("autosaveFace");
    expect(Array.isArray(holder.target)).toBe(false);
    expect(holder.target).toBe(face);

    // autosave must not bail: a description change on the created child is
    // persisted when the owner is saved.
    (face as any).description = "new description";
    await human.saveBang();
    await (face as any).reload();
    expect((face as any).description).toBe("new description");
  });

  it("should not try to set inverse instances when the inverse is a has many", async () => {
    const interest = interests("llama_wrangling");
    const human = (await loadBelongsTo(interest, "polymorphicHuman", {
      polymorphic: true,
      inverseOf: "polymorphicInterests",
    })) as any;
    // Rails: human.polymorphic_interests.detect { |_iz| _iz.id == interest.id }
    const iz = await human.polymorphicInterests.detect((i: any) => i.id === (interest as any).id);
    expect(iz).toBeDefined();
    expect(iz.topic).toBe((interest as any).topic);
    (interest as any).topic = "Eating cheese with a spoon";
    expect(iz.topic).not.toBe((interest as any).topic);
    iz.topic = "Cow tipping";
    expect((interest as any).topic).not.toBe(iz.topic);
  });

  it("with has many inversing should try to set inverse instances when the inverse is a has many", async () => {
    await withHasManyInversing(Human, async () => {
      const interest = interests("llama_wrangling");
      const human = (await loadBelongsTo(interest, "polymorphicHuman", {
        polymorphic: true,
        inverseOf: "polymorphicInterests",
      })) as any;
      const cached = human._associationCache("polymorphicInterests")?.target as any[];
      const iz = cached.find((i: any) => i.id === (interest as any).id);
      expect(iz).toBeDefined();
      expect(iz.topic).toBe((interest as any).topic);
      (interest as any).topic = "Eating cheese with a spoon";
      expect(iz.topic).toBe((interest as any).topic);
      iz.topic = "Cow tipping";
      expect((interest as any).topic).toBe(iz.topic);
    });
  });

  it("with has many inversing does not trigger association callbacks on set when the inverse is a has many", async () => {
    await withHasManyInversing(Interest, async () => {
      const interest = interests("llama_wrangling");
      const human = await (interest as any).loadBelongsTo("polymorphicHumanWithCallbacks");
      expect(human.addCallbackCalled).toBe(false);
    });
  });

  it("trying to access inverses that dont exist shouldnt raise an error", async () => {
    const face = (await Face.first())!;
    await loadBelongsTo(face, "puzzledPolymorphicHuman", {
      polymorphic: true,
      inverseOf: "puzzledPolymorphicFace",
    });
  });

  it("trying to set polymorphic inverses that dont exist at all should raise an error", async () => {
    const face = (await Face.first())!;
    const human = (await Human.first())!;
    expect(() => {
      (face as any).puzzledPolymorphicHuman = human;
    }).toThrow(InverseOfAssociationNotFoundError);
  });

  it("trying to set polymorphic inverses that dont exist on the instance being set should raise an error", async () => {
    const face1 = (await Face.first())!;
    const human = (await Human.first())!;
    expect(() => {
      (face1 as any).polymorphicHuman = human;
    }).not.toThrow();
    const face2 = (await Face.first())!;
    const interest = (await Interest.first())!;
    expect(() => {
      (face2 as any).polymorphicHuman = interest;
    }).toThrow(InverseOfAssociationNotFoundError);
  });
});

// NOTE - these tests might not be meaningful, ripped as they were from the parental_control plugin
// which would guess the inverse rather than look for an explicit configuration option.
describe("InverseMultipleHasManyInversesForSameModel", () => {
  fixtures(["humans", "interests", "zines"], { schema: canonicalSchema });
  beforeAll(() => {
    [Human, Interest, Zine].forEach((m) => registerModel(m));
  });

  it("that we can load associations that have the same reciprocal name from different models", async () => {
    const interest = (await Interest.first())!;
    await loadBelongsTo(interest, "zine", { inverseOf: "interests" });
    await loadBelongsTo(interest, "human", { inverseOf: "interests" });
  });

  it("that we can create associations that have the same reciprocal name from different models", async () => {
    const interest = (await Interest.first()) as any;
    interest.buildZine({ title: "Get Some in Winter! 2008" });
    interest.buildHuman({ name: "Gordon" });
    await interest.saveBang();
  });
});

// Rails declares `test_recursive_inverse_on_recursive_model_has_many_inversing`
// inside `InverseBelongsToTests`; a second same-named describe carries the
// dedicated `branches` table setup BrokenBranch needs without disturbing the
// fixture-backed block above.
describe("InverseBelongsToTests", () => {
  setupFixtures();
  beforeAll(async () => {
    await defineSchema(canonicalSchema);
    [Branch, BrokenBranch].forEach((m) => registerModel(m));
  });

  it("recursive model has many inversing", async () => {
    await withHasManyInversing(Branch, async () => {
      const main = await Branch.create({});
      const feature = (await association(main, "branches").create({})) as any;
      const topic = association(feature, "branches").build({}) as any;
      expect(topic.branch.branch).toBe(main);
    });
  });

  it("recursive inverse on recursive model has many inversing", async () => {
    await withHasManyInversing(BrokenBranch, async () => {
      const main = await BrokenBranch.create({});
      const feature = await association(main, "branches").create({});
      const topic = association(feature, "branches").build({});
      const err = await loadBelongsTo(topic, "branch", {
        className: "BrokenBranch",
        inverseOf: "branch",
      }).catch((e) => e);
      expect(err).toBeInstanceOf(InverseOfAssociationRecursiveError);
      expect((err as Error).message).toBe(
        "Inverse association branch (:branch in BrokenBranch) is recursive.",
      );
    });
  });
});
