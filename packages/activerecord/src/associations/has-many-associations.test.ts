import { kernelThrow } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  SubclassNotFound,
  Base,
  CollectionProxy,
  collectionProxyFor as association,
  registerModel,
  registerSubclass,
  RecordNotFound,
  RecordNotSaved,
  AssociationTypeMismatch,
  ReadOnlyRecord,
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
} from "../index.js";
import {
  Company,
  Firm as HmFirm,
  Client,
  NamespacedFirm,
  NamespacedClient,
  DependentFirm,
  RestrictedWithExceptionFirm,
  RestrictedWithErrorFirm,
} from "../test-helpers/models/company.js";
import { Account } from "../test-helpers/models/account.js";
import { Contract } from "../test-helpers/models/contract.js";
import { Car } from "../test-helpers/models/car.js";
import { Bulb } from "../test-helpers/models/bulb.js";
import { Developer, AuditLog } from "../test-helpers/models/developer.js";
import { Project } from "../test-helpers/models/project.js";
import { Speedometer } from "../test-helpers/models/speedometer.js";
import { Minivan } from "../test-helpers/models/minivan.js";
import { Invoice } from "../test-helpers/models/invoice.js";
import { LineItem as HmLineItem } from "../test-helpers/models/line-item.js";
import { Associations, isAssociationCached } from "../associations.js";
import { DeleteRestrictionError } from "./errors.js";
import { assertQueriesCount, assertNoQueries } from "../testing/query-assertions.js";
import {
  assertDifference,
  assertEmpty,
  assertNothingRaised,
  assertNot,
  assertNotEmpty,
  assertRaise,
} from "@blazetrails/activesupport";

import { fixtures } from "../test-fixtures.js";

function setup(): void {
  beforeEach(() => {
    Client.destroyedClientIds.clear();
  });
}

import "../support/canonical-model-index.js";
import {
  Author as HmAuthor,
  AuthorAddress as HmAuthorAddress,
} from "../test-helpers/models/author.js";
import { Essay as HmEssay } from "../test-helpers/models/essay.js";
import { Person as HmPerson } from "../test-helpers/models/person.js";
import { Reader as HmReader } from "../test-helpers/models/reader.js";
import { Subscriber as HmSubscriber } from "../test-helpers/models/subscriber.js";
import { Subscription as HmSubscription } from "../test-helpers/models/subscription.js";
import {
  CommentOverlappingCounterCache,
  UserCommentsCount,
  PostCommentsCount,
} from "../test-helpers/models/comment-overlapping-counter-cache.js";
import { Post as HmPost, FirstPost as HmFirstPost } from "../test-helpers/models/post.js";
import { Tag as HmTag } from "../test-helpers/models/tag.js";
import { Car as HmCar } from "../test-helpers/models/car.js";
import { Engine as HmEngine } from "../test-helpers/models/engine.js";
import { Bulb as HmBulb, FunkyBulb as HmFunkyBulb } from "../test-helpers/models/bulb.js";
import { Tagging as HmTagging } from "../test-helpers/models/tagging.js";
import {
  Topic as HmTopic,
  DefaultRejectedTopic as HmDefaultRejectedTopic,
} from "../test-helpers/models/topic.js";
import {
  Reply as HmReply,
  SillyReply as HmSillyReply,
  UniqueReply as HmUniqueReply,
  SillyUniqueReply as HmSillyUniqueReply,
} from "../test-helpers/models/reply.js";
import { Ship as HmShip, FamousShip } from "../test-helpers/models/ship.js";
import { FamousPirate } from "../test-helpers/models/pirate.js";
import { Reference as HmReference } from "../test-helpers/models/reference.js";
import { ShipPart as HmShipPart } from "../test-helpers/models/ship-part.js";
import { Treasure as HmTreasure } from "../test-helpers/models/treasure.js";
import { SubStiPost as HmSubStiPost } from "../test-helpers/models/post.js";
import { Image as HmImage } from "../test-helpers/models/image.js";
import { Comment } from "../test-helpers/models/comment.js";
import { Human } from "../test-helpers/models/human.js";
import { Category } from "../test-helpers/models/category.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import {
  CpkAuthor,
  CpkBook,
  CpkOrder,
  CpkBrokenOrder,
  CpkBrokenOrderWithNonCpkBooks,
  CpkNonCpkBook,
} from "../test-helpers/models/cpk.js";
import { captureSql } from "../testing/sql-capture.js";
import { currentAdapter } from "../support/adapter-helper.js";
import { CompositePrimaryKeyMismatchError } from "./errors.js";
import { TypedEssay } from "../test-helpers/models/essay.js";
import { PersonWithPolymorphicDependentNullifyComments } from "../test-helpers/models/person.js";

describe("HasManyAssociationsTestPrimaryKeys", () => {
  const { people } = fixtures([
    "authors",
    "authorAddresses",
    "essays",
    "subscribers",
    "subscriptions",
    "people",
  ]);

  beforeAll(async () => {
    registerModel(HmSubscriber);
    registerModel(HmSubscription);
    registerModel(HmAuthor);
    registerModel(HmAuthorAddress);
    registerModel(HmEssay);
    registerModel(HmPerson);
    await HmSubscriber.loadSchema();
    await HmSubscription.loadSchema();
    await HmAuthor.loadSchema();
    await HmEssay.loadSchema();
    await HmPerson.loadSchema();
  });

  it("custom primary key on new record should fetch with query", async () => {
    const subscriber = new HmSubscriber({ nick: "webster132" });
    const subscriptions = association(subscriber, "subscriptions");
    expect(subscriptions.loaded).toBe(false);

    await assertQueriesCount(1, false, async () => {
      expect(await subscriptions.size()).toBe(2);
    });

    const expected = await HmSubscription.where({ subscriber_id: "webster132" });
    const actual = await subscriptions;
    expect(actual.map((r) => r.id).sort()).toEqual(expected.map((r) => r.id).sort());
  });

  it("association primary key on new record should fetch with query", async () => {
    const author = new HmAuthor({ name: "David" });
    const essays = association(author, "essays");
    expect(essays.loaded).toBe(false);

    await assertQueriesCount(1, false, async () => {
      expect(await essays.size()).toBe(1);
    });

    const expected = await HmEssay.where({ writer_id: "David" });
    const actual = await essays;
    expect(actual.map((r) => r.id).sort()).toEqual(expected.map((r) => r.id).sort());
  });

  it("ids on unloaded association with custom primary key", async () => {
    const david = people("david");
    const expected = (await HmEssay.where({ writer_id: "David" })).map((e) => e.id);
    const ids = await (david.association("essays") as any).idsReader();
    expect(ids).toEqual(expected);
  });

  it("ids on loaded association with custom primary key", async () => {
    const david = people("david");
    const assoc = david.association("essays") as any;
    await assoc.loadTarget();
    const expected = (await HmEssay.where({ writer_id: "David" })).map((e) => e.id);
    const ids = await assoc.idsReader();
    expect(ids).toEqual(expected);
  });

  it("blank custom primary key on new record should not run queries", async () => {
    const author = new HmAuthor();
    const essays = association(author, "essays");
    expect(essays.loaded).toBe(false);

    await assertQueriesCount(0, false, async () => {
      expect(await essays.size()).toBe(0);
    });
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);
  setup();

  beforeAll(async () => {
    registerModel(Company);
    registerModel(HmFirm);
    registerModel(Client);
    registerModel(Account);
    Company.inheritanceColumn = "type";
    registerSubclass(HmFirm);
    registerSubclass(Client);
    await Company.loadSchema();
    await Account.loadSchema();
  });

  it("transaction when deleting persisted", async () => {
    const good = Client.new({ name: "Good" }) as any;
    const bad = Client.new({ name: "Bad" }) as any;
    bad.raiseOnDestroy = true;

    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.replace([good, bad]);

    try {
      await firstFirm.clientsOfFirm.destroy(good, bad);
    } catch (e) {
      if (!(e instanceof Client.RaisedOnDestroy)) throw e;
    }

    const reloaded = (await firstFirm.clientsOfFirm.reload()) as any[];
    expect(reloaded.map((c) => c.id)).toEqual([good.id, bad.id]);
  });

  it("transaction when deleting new record", async () => {
    const firm = HmFirm.new() as any;
    await assertQueriesCount(0, false, async () => {
      const client = Client.new({ name: "New Client" });
      await firm.clientsOfFirm.concat(client);
      await firm.clientsOfFirm.destroy(client);
    });
  });

  it("clearing an association collection", async () => {
    const firm = companies("first_firm") as any;
    const clientId = (await firm.clientsOfFirm.first()).id;
    expect(await firm.clientsOfFirm.size()).toBe(2);

    await firm.clientsOfFirm.clear();

    expect(await firm.clientsOfFirm.size()).toBe(0);
    await firm.clientsOfFirm.reload();
    expect(await firm.clientsOfFirm.size()).toBe(0);
    expect(Client.destroyedClientIds.get(firm.id as number) ?? []).toEqual([]);

    await assertNothingRaised(async () => {
      expect(await (await Client.find(clientId)).firm).toBeNull();
    });
  });

  it("transactions when adding to persisted", async () => {
    const good = Client.new({ name: "Good" }) as any;
    const bad = Client.new({ name: "Bad" }) as any;
    bad.raiseOnSave = true;

    const firstFirm = companies("first_firm") as any;
    try {
      await firstFirm.clientsOfFirm.concat(good, bad);
    } catch (e) {
      if (!(e instanceof Client.RaisedOnSave)) throw e;
    }

    const reloaded = (await firstFirm.clientsOfFirm.reload()) as any[];
    expect(reloaded.map((c) => c.id)).not.toContain(good.id);
  });

  it("transactions when adding to new record", async () => {
    const firm = HmFirm.new() as any;
    await assertQueriesCount(0, false, async () => {
      await firm.clientsOfFirm.concat(Client.new({ name: "Natural Company" }));
    });
  });

  it("adding buffers a record whose save fails into the target", async () => {
    const bad = Client.new({ name: "Bad" }) as any;
    bad.throwOnSave = true;

    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.load();
    await firstFirm.clientsOfFirm.concat(bad);

    expect(await firstFirm.clientsOfFirm.toArray()).toContain(bad);
    const reloaded = (await firstFirm.clientsOfFirm.reload()) as any[];
    expect(reloaded).not.toContain(bad);
  });

  it("creating a record whose save fails buffers it into the target", async () => {
    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.load();

    const saveSpy = vi.spyOn(Client.prototype as any, "save").mockResolvedValue(false);
    let bad: any;
    try {
      bad = await firstFirm.clientsOfFirm.create({ name: "Bad" });
    } finally {
      saveSpy.mockRestore();
    }

    expect(bad.isNewRecord()).toBe(true);
    expect(await firstFirm.clientsOfFirm.toArray()).toContain(bad);
    const reloaded = (await firstFirm.clientsOfFirm.reload()) as any[];
    expect(reloaded).not.toContain(bad);
  });

  it("create with bang on has many when parent is new raises", async () => {
    const firm = new HmFirm();
    let error: any;
    try {
      await (firm as any).plainClients.createBang({ name: "Whoever" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);
    expect(error.message).toBe("You cannot call create unless the parent is saved");
    expect(error.record).toBe(firm);
  });

  it("regular create on has many when parent is new raises", async () => {
    const firm = new HmFirm();
    let error: any;
    try {
      await (firm as any).plainClients.create({ name: "Whoever" });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);
    expect(error.message).toBe("You cannot call create unless the parent is saved");
    expect(error.record).toBe(firm);
  });

  it("destroying", async () => {
    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.load();
    expect(firstFirm.clientsOfFirm.loaded).toBe(true);

    const before = (await Client.count()) as number;
    const first = await firstFirm.clientsOfFirm.first();
    await firstFirm.clientsOfFirm.destroy(first);
    expect(await Client.count()).toBe(before - 1);

    await firstFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
    await firstFirm.clientsOfFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
  });

  it("destroying by integer id", async () => {
    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.load();
    expect(firstFirm.clientsOfFirm.loaded).toBe(true);

    const before = (await Client.count()) as number;
    const first = await firstFirm.clientsOfFirm.first();
    await firstFirm.clientsOfFirm.destroy(first.id);
    expect(await Client.count()).toBe(before - 1);

    await firstFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
    await firstFirm.clientsOfFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
  });

  it("destroying by string id", async () => {
    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.load();
    expect(firstFirm.clientsOfFirm.loaded).toBe(true);

    const before = (await Client.count()) as number;
    const first = await firstFirm.clientsOfFirm.first();
    await firstFirm.clientsOfFirm.destroy(String(first.id));
    expect(await Client.count()).toBe(before - 1);

    await firstFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
    await firstFirm.clientsOfFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
  });

  it("destroying a collection", async () => {
    const firstFirm = companies("first_firm") as any;
    await firstFirm.clientsOfFirm.load();
    expect(firstFirm.clientsOfFirm.loaded).toBe(true);

    await firstFirm.clientsOfFirm.create({ name: "Another Client" });
    expect(await firstFirm.clientsOfFirm.size()).toBe(3);

    const all = (await firstFirm.clientsOfFirm.load()) as any[];
    const before = (await Client.count()) as number;
    await firstFirm.clientsOfFirm.destroy([all[0], all[1]]);
    expect(await Client.count()).toBe(before - 2);

    await firstFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
    await firstFirm.clientsOfFirm.reload();
    expect(await firstFirm.clientsOfFirm.size()).toBe(1);
  });

  it("destroy all", async () => {
    await forceSignal37ToLoadAllClientsOfFirm(companies);

    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBeTruthy();

    const clients = await (companies("first_firm") as any).clientsOfFirm.toArray();
    expect(clients.length === 0).toBeFalsy();
    const destroyed = await (companies("first_firm") as any).clientsOfFirm.destroyAll();
    expect([...destroyed].sort((a: any, b: any) => Number(a.id) - Number(b.id))).toEqual(
      [...clients].sort((a: any, b: any) => Number(a.id) - Number(b.id)),
    );
    expect(destroyed.every((client: any) => client.isFrozen())).toBeTruthy();
    expect(await (companies("first_firm") as any).clientsOfFirm.isEmpty()).toBeTruthy();
    await (companies("first_firm") as any).clientsOfFirm.reload();
    expect(await (companies("first_firm") as any).clientsOfFirm.isEmpty()).toBeTruthy();
  });

  it("destroy returns the removed records", async () => {
    const firstFirm = companies("first_firm") as any;
    const first = await firstFirm.clientsOfFirm.first();
    const removed = await firstFirm.clientsOfFirm.destroy(first);
    expect(removed.map((r: any) => r.id)).toEqual([first.id]);
  });
});

describe("HasManyAssociationsTestForReorderWithJoinDependency", () => {
  const { authors } = fixtures(["authors", "authorAddresses", "posts", "comments"]);

  it("should generate valid sql", async () => {
    const author = authors("david") as any;
    const last = await author.postsWithCommentsSortedByCommentId
      .where("comments.id > 0")
      .reorder({ "posts.comments_count": "desc", "posts.tags_count": "desc" })
      .last();
    expect(last).toBeTruthy();
  });
});

describe("HasManyAssociationsTest", () => {
  const { posts, humans, categories } = fixtures([
    "posts",
    "comments",
    "humans",
    "categories",
    "essays",
    "tags",
    "taggings",
    "people",
  ]);
  setup();

  beforeAll(async () => {
    registerModel(HmPost);
    registerModel(Comment);
    registerModel(Human);
    registerModel(Category);
    registerModel(HmEssay);
    registerModel(HmTag);
    registerModel(HmTagging);
    registerModel(PersonWithPolymorphicDependentNullifyComments);
    HmEssay.inheritanceColumn = "type";
    registerSubclass(TypedEssay);
    await HmPost.loadSchema();
    await Comment.loadSchema();
    await Human.loadSchema();
    await Category.loadSchema();
    await HmEssay.loadSchema();
    await HmTag.loadSchema();
    await HmTagging.loadSchema();
  });

  it("collection size with dirty target", async () => {
    const post = posts("thinking") as any;
    expect(await post.readerIds).toEqual([]);
    expect(await post.readers.size()).toBe(0);
    post.readers.reset();
    post.readers.build();
    expect(await post.readerIds).toEqual([null]);
    expect(await post.readers.size()).toBe(1);
  });

  it("collection empty with dirty target", async () => {
    const post = posts("thinking") as any;
    expect(await post.readerIds).toEqual([]);
    assertEmpty(await post.readers.toArray());
    post.readers.reset();
    post.readers.build();
    expect(await post.readerIds).toEqual([null]);
    assertNotEmpty(await post.readers.toArray());
  });

  it("depends and nullify on polymorphic assoc", async () => {
    const author = await PersonWithPolymorphicDependentNullifyComments.create({
      first_name: "Laertis",
    });
    const comment = (await posts("welcome").comments.first())!;
    comment.author = author;
    await comment.save();

    expect(comment.author_id).toBe(Number(author.id));
    expect(comment.author_type).toBe(author.constructor.name);

    await author.destroy();
    const reloaded = await Comment.find(comment.id as number);

    expect(reloaded.author_id).toBeNull();
    expect(reloaded.author_type).toBeNull();
  });

  it("joining through a polymorphic association with a where clause", async () => {
    const writer = humans("gordon");
    const category = categories("general");
    const essay = TypedEssay.new();
    essay.category = category;
    essay.writer = writer;
    await essay.save();

    expect(await Category.joins(":humanWritersOfTypedEssays").count()).toBe(1);
  });

  it("build with polymorphic has many does not allow to override type and id", async () => {
    const welcome = posts("welcome");
    const tagging = welcome.taggings.build({ taggable_id: 99, taggable_type: "ShouldNotChange" });

    expect(tagging.taggable_id).toBe(Number(welcome.id));
    expect(tagging.taggable_type).toBe("Post");
  });

  it("build from polymorphic association sets inverse instance", async () => {
    const post = HmPost.new();
    const tagging = post.taggings.build();

    expect(await tagging.taggable).toBe(post);
  });

  it("attributes are set when initialized from polymorphic has many null relationship", async () => {
    const post = HmPost.new({ title: "title", body: "bar" });
    const tag = await HmTag.create({ name: "foo" });

    const tagging = await post.taggings.where({ tag }).firstOrInitialize();

    expect(tagging.tag_id).toBe(Number(tag.id));
    expect(tagging.taggable_type).toBe("Post");
  });

  it("deleting updates counter cache with dependent delete all", async () => {
    const post = posts("welcome");
    const startCount = (post as any).tags_count as number;
    await post.updateColumns({ taggings_with_delete_all_count: startCount });

    const first = (await post.taggingsWithDeleteAll.first())!;
    await post.taggingsWithDeleteAll.delete(first);

    await post.reload();
    expect((post as any).taggings_with_delete_all_count).toBe(startCount - 1);
    expect(await HmTagging.findBy({ id: first.id })).toBeNull();
  });

  it("deleting updates counter cache with dependent destroy", async () => {
    const post = posts("welcome");
    const startCount = (post as any).tags_count as number;
    await post.updateColumns({ taggings_with_destroy_count: startCount });

    const first = (await post.taggingsWithDestroy.first())!;
    await post.taggingsWithDestroy.delete(first);

    await post.reload();
    expect((post as any).taggings_with_destroy_count).toBe(startCount - 1);
    expect(await HmTagging.findBy({ id: first.id })).toBeNull();
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);
  setup();
  beforeAll(async () => {
    await Company.loadSchema();
    await Account.loadSchema();
  });
  registerModel(Company);
  registerModel(HmFirm);
  registerModel(Client);
  registerModel(Account);
  registerModel(RestrictedWithErrorFirm);
  Company.inheritanceColumn = "type";
  registerSubclass(HmFirm);
  registerSubclass(Client);
  registerSubclass(RestrictedWithErrorFirm);

  it("dependence", async () => {
    const firm = companies("first_firm") as any;
    expect(await firm.clients.size()).toBe(3);
    await firm.destroy();
    expect((await Client.where(`firm_id=${firm.id}`)).length).toBe(0);
  });

  it("clearing a dependent association collection", async () => {
    const firm = companies("first_firm") as any;
    const clientId = (await firm.dependentClientsOfFirm.first()).id;
    expect(await firm.dependentClientsOfFirm.size()).toBe(2);
    expect((await Client.findBy({ id: clientId }))!.client_of).toBe(1);

    await firm.dependentClientsOfFirm.clear();

    expect(await firm.dependentClientsOfFirm.size()).toBe(0);
    await firm.dependentClientsOfFirm.reload();
    expect(await firm.dependentClientsOfFirm.size()).toBe(0);
    expect(Client.destroyedClientIds.get(firm.id as number) ?? []).toEqual([]);

    expect(await Client.findBy({ id: clientId })).toBeNull();
  });

  it("delete all with option delete all", async () => {
    const firm = companies("first_firm") as any;
    const clientId = (await firm.dependentClientsOfFirm.first()).id;
    const count = await firm.dependentClientsOfFirm.count();
    expect(await firm.dependentClientsOfFirm.deleteAll("delete_all")).toBe(count);
    expect(await Client.findBy({ id: clientId })).toBeNull();
  });

  it("delete all with option nullify", async () => {
    const firm = companies("first_firm") as any;
    const clientId = (await firm.dependentClientsOfFirm.first()).id;
    const count = await firm.dependentClientsOfFirm.count();
    expect((await ((await Client.find(clientId)) as any).firm).id).toBe(firm.id);
    expect(await firm.dependentClientsOfFirm.deleteAll("nullify")).toBe(count);
    expect(await ((await Client.find(clientId)) as any).firm).toBeNull();
  });

  it("delete all accepts limited parameters", async () => {
    const firm = companies("first_firm") as any;
    await expect(firm.dependentClientsOfFirm.deleteAll("destroy")).rejects.toThrow();
  });

  it("clearing an exclusively dependent association collection", async () => {
    const firm = companies("first_firm") as any;
    const clientId = (await firm.exclusivelyDependentClientsOfFirm.first()).id;
    expect(await firm.exclusivelyDependentClientsOfFirm.size()).toBe(2);

    expect(Client.destroyedClientIds.get(firm.id as number) ?? []).toEqual([]);

    await firm.exclusivelyDependentClientsOfFirm.clear();

    expect(await firm.exclusivelyDependentClientsOfFirm.size()).toBe(0);
    await firm.exclusivelyDependentClientsOfFirm.reload();
    expect(await firm.exclusivelyDependentClientsOfFirm.size()).toBe(0);
    expect(Client.destroyedClientIds.get(firm.id as number) ?? []).toEqual([]);

    expect(await Client.findBy({ id: clientId })).toBeNull();
  });

  it("dependence on account", async () => {
    const numAccounts = (await Account.all().count()) as number;
    await (companies("first_firm") as any).destroy();
    expect(await Account.all().count()).toBe(numAccounts - 1);
  });

  it("restrict with error", async () => {
    const firm = (await RestrictedWithErrorFirm.create({ name: "restrict" })) as any;
    await firm.companies.create({ name: "child" });

    expect(await firm.companies.exists()).toBe(true);

    await firm.destroy();

    expect(firm.errors.where("base").length).toBeGreaterThan(0);
    expect(firm.errors.messagesFor("base")[0]).toBe(
      "Cannot delete record because dependent companies exist",
    );
    expect(await RestrictedWithErrorFirm.exists({ name: "restrict" })).toBe(true);
    expect(await firm.companies.exists({ name: "child" })).toBe(true);
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "developers", "projects", "developersProjects"]);
  setup();
  beforeAll(async () => {
    await Company.loadSchema();
    await Developer.loadSchema();
    await Project.loadSchema();
  });
  registerModel(Company);
  registerModel(HmFirm);
  registerModel(Client);
  registerModel(Developer);
  registerModel(AuditLog);
  registerModel(Project);
  Company.inheritanceColumn = "type";
  registerSubclass(HmFirm);
  registerSubclass(Client);

  it("counting", async () => {
    const firm = (await HmFirm.first()) as any;
    expect(await firm.plainClients.count()).toBe(3);
  });

  it("counting with single hash", async () => {
    const firm = (await HmFirm.first()) as any;
    expect(await firm.plainClients.where({ name: "Microsoft" }).count()).toBe(1);
  });

  it("counting with counter sql", async () => {
    const firm = (await HmFirm.first()) as any;
    expect(await firm.clients.count()).toBe(3);
  });

  it("counting with column name and hash", async () => {
    const firm = (await HmFirm.first()) as any;
    expect(await firm.plainClients.count("name")).toBe(3);
  });

  it("counting with association limit", async () => {
    const firm = companies("first_firm") as any;
    const len = (await firm.limitedClients).length;
    expect(await firm.limitedClients.size()).toBe(len);
    expect(await firm.limitedClients.count()).toBe(len);
  });

  it("finding", async () => {
    const firm = (await HmFirm.first()) as any;
    expect((await firm.clients).length).toBe(3);
  });

  it("find all", async () => {
    const firm = (await HmFirm.first()) as any;
    expect((await firm.clients.where("type = 'Client'")).length).toBe(3);
    expect((await firm.clients.where("name = 'Summit'")).length).toBe(1);
  });

  it("find first", async () => {
    const firm = (await HmFirm.first()) as any;
    const client2 = (await Client.find(2)) as any;
    const first = await firm.clients.first();
    const ordered = await firm.clients.order("id").first();
    expect(first.id).toBe(ordered.id);
    const byType = await firm.clients.where("type = 'Client'").order("id").first();
    expect(byType.id).toBe(client2.id);
  });

  it("find in collection", async () => {
    const firm = companies("first_firm") as any;
    expect((await firm.clients.find(2)).name).toBe(((await Client.find(2)) as any).name);
    await expect(firm.clients.find(6)).rejects.toThrow(RecordNotFound);
  });

  it("finding with condition", async () => {
    const firm = (await HmFirm.first()) as any;
    const client = await firm.clientsLikeMs.first();
    expect(client.name).toBe("Microsoft");
  });

  it("finding default orders", async () => {
    const firm = (await HmFirm.first()) as any;
    expect((await firm.clients.first()).name).toBe("Summit");
  });

  it("finding with different class name and order", async () => {
    const firm = (await HmFirm.first()) as any;
    expect((await firm.clientsSortedDesc.first()).name).toBe("Apex");
  });

  it("finding with condition hash", async () => {
    const firm = (await HmFirm.first()) as any;
    expect((await firm.clientsLikeMsWithHashConditions.first()).name).toBe("Microsoft");
  });

  it("collection size after building", async () => {
    const company = companies("first_firm") as any;
    company.clientsOfFirm.build({ name: "Another Client" });
    company.clientsOfFirm.build({ name: "Yet Another Client" });
    expect(await company.clientsOfFirm.size()).toBe(4);
    expect(new Set(await company.clientsOfFirm).size).toBe(4);
  });

  it("build many via block", async () => {
    const company = companies("first_firm") as any;

    let newClients: any[] = [];
    await assertQueriesCount(0, false, async () => {
      newClients = company.clientsOfFirm.build(
        [{ name: "Another Client" }, { name: "Another Client II" }],
        (client: any) => {
          client.name = "changed";
        },
      );
    });

    expect(newClients.length).toBe(2);
    expect(newClients[0].name).toBe("changed");
    expect(newClients[newClients.length - 1].name).toBe("changed");
  });

  it("create without loading association", async () => {
    const firstFirm = companies("first_firm") as any;

    expect(await firstFirm.clientsOfFirm.size()).toBe(2);
    firstFirm.clientsOfFirm.reset();

    await assertQueriesCount(3, false, async () => {
      await firstFirm.clientsOfFirm.create({ name: "Superstars" });
    });

    expect(await firstFirm.clientsOfFirm.size()).toBe(3);
  });

  it("create many", async () => {
    const company = companies("first_firm") as any;
    await company.clientsOfFirm.create([{ name: "Another Client" }, { name: "Another Client II" }]);
    await company.clientsOfFirm.reload();
    expect(await company.clientsOfFirm.size()).toBe(4);
  });

  it("replace with new", async () => {
    const firm = (await HmFirm.first()) as any;
    await firm
      .association("clients")
      .writer([companies("second_client"), Client.new({ name: "New Client" })]);
    await firm.save();
    await firm.reload();
    const clients = await firm.clients;
    expect(clients.length).toBe(2);
    expect(clients.some((c: any) => c.equals(companies("first_client")))).toBe(false);
  });

  it("association size calculation works with default scoped selects when not previously fetched", async () => {
    const firm = (await HmFirm.createBang({ name: "Firm" })) as any;
    for (let i = 0; i < 5; i++) {
      await firm.developersWithSelect.push(await Developer.createBang({ name: "Developer" }));
    }

    const sameFirm = (await HmFirm.find(firm.id)) as any;
    expect(await sameFirm.developersWithSelect.size()).toBe(5);
  });

  it("find ids", async () => {
    const firm = (await HmFirm.first()) as any;

    await expect(firm.clients.find()).rejects.toThrow(RecordNotFound);

    const client = await firm.clients.find(2);
    expect(client).toBeInstanceOf(Client);

    const clientAry = (await firm.clients.find([2])) as any[];
    expect(Array.isArray(clientAry)).toBe(true);
    expect(clientAry[0].id).toBe(client.id);

    const clientAry2 = (await firm.clients.find(2, 3)) as any[];
    expect(Array.isArray(clientAry2)).toBe(true);
    expect(clientAry2.length).toBe(2);
    expect(clientAry2[0].id).toBe(client.id);

    await expect(firm.clients.find(2, 99)).rejects.toThrow(RecordNotFound);
  });

  it("find each", async () => {
    const firm = companies("first_firm") as any;
    expect(firm.clients.loaded).toBeFalsy();

    await assertQueriesCount(4, false, async () => {
      for await (const c of firm.clients.findEach({ batchSize: 1 })) {
        expect(c.firm_id).toBe(firm.id);
      }
    });

    expect(firm.clients.loaded).toBeFalsy();
  });

  it("find each with conditions", async () => {
    const firm = companies("first_firm") as any;

    await assertQueriesCount(2, false, async () => {
      for await (const c of firm.clients.where({ name: "Microsoft" }).findEach({ batchSize: 1 })) {
        expect(c.firm_id).toBe(firm.id);
        expect(c.name).toBe("Microsoft");
      }
    });

    expect(firm.clients.loaded).toBeFalsy();
  });

  it("find in batches", async () => {
    const firm = companies("first_firm") as any;

    expect(firm.clients.loaded).toBeFalsy();

    await assertQueriesCount(2, false, async () => {
      for await (const clients of firm.clients.findInBatches({ batchSize: 2 })) {
        for (const c of clients) expect(c.firm_id).toBe(firm.id);
      }
    });

    expect(firm.clients.loaded).toBeFalsy();
  });

  it("find all sanitized", async () => {
    const firm = (await HmFirm.first()) as any;
    const summit = await firm.clients.where("name = 'Summit'").toArray();
    expect(await firm.clients.where("name = ?", "Summit").toArray()).toEqual(summit);
    expect(await firm.clients.where("name = :name", { name: "Summit" }).toArray()).toEqual(summit);
  });

  it("find first sanitized", async () => {
    const QUOTED_TYPE = (Base.connection as any).quoteColumnName("type");
    const firm = (await HmFirm.first()) as any;
    const client2 = await Client.find(2);
    expect(await firm.clients.where(`${QUOTED_TYPE} = ?`, "Client").first()).toEqual(client2);
    expect(await firm.clients.where(`${QUOTED_TYPE} = :type`, { type: "Client" }).first()).toEqual(
      client2,
    );
  });

  it("find first after reset scope", async () => {
    const firm = (await HmFirm.first()) as any;
    const collection = firm.clients;

    const originalObject = await collection.first();
    expect(
      await collection.first(),
      "Expected second call to #first to cache the same object",
    ).toBe(originalObject);

    expect(await firm.clients.first(), "Expected #first to return a new object").not.toBe(
      originalObject,
    );
  });

  it("find first after reload", async () => {
    const firm = (await HmFirm.first()) as any;
    const collection = firm.clients;

    const originalObject = await collection.first();
    expect(
      await collection.first(),
      "Expected second call to #first to cache the same object",
    ).toBe(originalObject);
    await collection.reload();

    expect(
      await collection.first(),
      "Expected #first after #reload to return a new object",
    ).not.toBe(originalObject);
  });

  it("find grouped", async () => {
    const allClientsOfFirm1 = await Client.all().mergeBang({ where: "firm_id = 1" });
    const groupedClientsOfFirm1 = await Client.all().mergeBang({
      where: "firm_id = 1",
      group: "firm_id",
      select: "firm_id, count(id) as clients_count",
    });
    expect(allClientsOfFirm1.length).toBe(3);
    expect(groupedClientsOfFirm1.length).toBe(1);
  });

  it("find scoped grouped", async () => {
    expect(await (companies("first_firm") as any).clientsGroupedByFirmId.size()).toBe(1);
    expect((await (companies("first_firm") as any).clientsGroupedByFirmId.toArray()).length).toBe(
      1,
    );
    expect(await (companies("first_firm") as any).clientsGroupedByName.size()).toBe(3);
    expect((await (companies("first_firm") as any).clientsGroupedByName.toArray()).length).toBe(3);
  });

  it("finder bang method with dirty target", async () => {
    const company = companies("first_firm") as any;
    const newClients: any[] = [];

    await assertQueriesCount(0, false, async () => {
      newClients.push(company.clientsOfFirm.build({ name: "Another Client" }));
      newClients.push(company.clientsOfFirm.build({ name: "Another Client II" }));
      newClients.push(company.clientsOfFirm.build({ name: "Another Client III" }));
    });

    expect(company.clientsOfFirm.loaded).toBeFalsy();

    await assertQueriesCount(1, false, async () => {
      expect(await company.clientsOfFirm.thirdBang()).toBe(newClients[0]);
      expect(await company.clientsOfFirm.fourthBang()).toBe(newClients[1]);
      expect(await company.clientsOfFirm.fifthBang()).toBe(newClients[2]);
      expect(await company.clientsOfFirm.thirdToLastBang()).toBe(newClients[0]);
      expect(await company.clientsOfFirm.secondToLastBang()).toBe(newClients[1]);
      expect(await company.clientsOfFirm.lastBang()).toBe(newClients[2]);
    });
  });

  it("deleting a item which is not in the collection", async () => {
    await forceSignal37ToLoadAllClientsOfFirm(companies);

    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBeTruthy();

    const summit = (await Client.findBy({ name: "Summit" }))!;
    await (companies("first_firm") as any).clientsOfFirm.delete(summit);
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(2);
    await (companies("first_firm") as any).clientsOfFirm.reload();
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(2);
    expect(summit.client_of).toBe(2);
  });

  it("deleting by integer id", async () => {
    const david = (await Developer.find(1)) as any;
    const before = await david.projects.count();

    const deleted = (await david.projects.delete(1)) as any[];
    expect(deleted.length).toBe(1);
    expect(await david.projects.count()).toBe(before - 1);
    expect(await david.projects.size()).toBe(1);
  });

  it("deleting by string id", async () => {
    const david = (await Developer.find(1)) as any;

    await assertDifference(
      async () => Number(await david.projects.count()),
      -1,
      null,
      async () => {
        expect(((await david.projects.delete("1")) as any[]).length).toBe(1);
      },
    );

    expect(await david.projects.size()).toBe(1);
  });

  it("deleting", async () => {
    await forceSignal37ToLoadAllClientsOfFirm(companies);

    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBeTruthy();

    await (companies("first_firm") as any).clientsOfFirm.delete(
      await (companies("first_firm") as any).clientsOfFirm.first(),
    );
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(1);
    await (companies("first_firm") as any).clientsOfFirm.reload();
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(1);
  });

  it("deleting before save", async () => {
    const newFirm = HmFirm.new({ name: "A New Firm, Inc." }) as any;
    const newClient = newFirm.clientsOfFirm.build({ name: "Another Client" });
    expect(await newFirm.clientsOfFirm.size()).toBe(1);
    await newFirm.clientsOfFirm.delete(newClient);
    expect(await newFirm.clientsOfFirm.size()).toBe(0);
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures([
    "accounts",
    "categories",
    "companies",
    "developers",
    "projects",
    "developersProjects",
    "topics",
    "authors",
    "authorAddresses",
    "comments",
    "posts",
    "readers",
    "taggings",
    "cars",
    "tags",
    "categorizations",
    "zines",
    "interests",
    "humans",
    "shardedBlogPosts",
    "shardedComments",
    "cpkBooks",
    "cpkAuthors",
  ]);
  setup();

  it.skip("depends and nullify with composite foreign key nulls every FK column", async () => {
    class NullifyCompositeAuthor extends Base {
      declare name: string | null;
      declare cpk_posts: AssociationProxy<NullifyCompositePost>;

      static {
        this.attribute("name", "string");
        this.hasMany("cpk_posts", {
          className: "NullifyCompositePost",
          foreignKey: ["tenant_id", "author_id"],
          primaryKey: ["id", "id"],
          dependent: "nullify",
        });
      }
    }
    class NullifyCompositePost extends Base {
      declare tenant_id: number | null;
      declare author_id: number | null;
      declare title: string | null;

      static {
        this.attribute("tenant_id", "integer");
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(NullifyCompositeAuthor);
    registerModel(NullifyCompositePost);
    const author = await NullifyCompositeAuthor.create({ name: "Alice" });
    const post = await NullifyCompositePost.create({
      tenant_id: author.id,
      author_id: author.id,
      title: "A",
      body: "body",
    });
    await author.destroy();
    const reloaded = await NullifyCompositePost.find(post.id!);
    expect((reloaded as any).tenant_id).toBeNull();
    expect((reloaded as any).author_id).toBeNull();
  });

  it("isAssociationCached reflects built Association instances", async () => {
    class CacheAuthor extends Base {
      declare name: string | null;
      declare cache_posts: AssociationProxy<CachePost>;

      declare cachePosts: CollectionProxy<Base>;
      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("cache_posts", {
          className: "CachePost",
          foreignKey: "cache_author_id",
        });
      }
    }
    class CachePost extends Base {
      declare cache_author_id: number | null;

      static {
        this.attribute("cache_author_id", "integer");
      }
    }
    registerModel(CacheAuthor);
    registerModel(CachePost);
    const author = await CacheAuthor.create({ name: "Alice" });

    expect(isAssociationCached(author, "cache_posts")).toBe(false);

    association(author, "cache_posts");
    expect(isAssociationCached(author, "cache_posts")).toBe(true);
    expect(isAssociationCached(author, "other")).toBe(false);
  });

  it("get ids for association on new record does not try to find records", async () => {
    const author = HmAuthor.new({ name: "New" });
    expect(author.isNewRecord()).toBe(true);
    expect(author.id == null).toBe(true);
  });

  it("included in collection", async () => {
    expect(await (companies("first_firm") as any).clients.isInclude(await Client.find(2))).toBe(
      true,
    );
  });

  it("included in collection for new records", async () => {
    const author = await HmAuthor.create({ name: "Alice" });
    const newPost = HmPost.new({ author_id: author.id, title: "New" });
    expect(newPost.isNewRecord()).toBe(true);
    const posts = await author.posts;
    expect(posts.some((p: any) => p.id === newPost.id)).toBe(false);
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies"]);
  setup();
  beforeAll(async () => {
    void Car.resetColumnInformation();
    void Bulb.resetColumnInformation();
    void Company.resetColumnInformation();
    await Car.loadSchema();
    await Bulb.loadSchema();
    await Company.loadSchema();
    Bulb.primaryKey = "ID";
  });
  registerModel(Car);
  registerModel(Bulb);
  registerModel(Company);
  registerModel(HmFirm);
  registerModel(Client);
  Company.inheritanceColumn = "type";
  registerSubclass(HmFirm);
  registerSubclass(Client);

  it("reload with query cache", async () => {
    const connection = (await Base.leaseConnection()) as any;
    connection.enableQueryCacheBang();
    connection.clearQueryCache();
    try {
      const firm = (await HmFirm.first()) as any;
      await firm.clients.load();

      expect(connection.queryCache.size).toBe(2);

      await assertQueriesCount(1, false, async () => {
        await firm.clients.reload();
      });
      await assertQueriesCount(0, false, async () => {
        await firm.clients.load();
      });

      expect(connection.queryCache.size).toBe(1);
    } finally {
      ((await Base.leaseConnection()) as any).disableQueryCacheBang();
    }
  });

  it("reloading unloaded associations with query cache", async () => {
    const connection = (await Base.leaseConnection()) as any;
    connection.enableQueryCacheBang();
    connection.clearQueryCache();
    try {
      let firm = (await HmFirm.createBang({ name: "firm name" })) as any;
      const client = await firm.clients.createBang({ name: "client name" });
      await firm.clients.toArray();

      await connection.uncached(async () => {
        await client.updateBang({ name: "new client name" });
      });

      firm = await HmFirm.find(firm.id);

      expect(((await firm.clients.reload()) as any[]).map((c) => c.name)).toEqual([client.name]);
    } finally {
      ((await Base.leaseConnection()) as any).disableQueryCacheBang();
    }
  });

  it("new aliased to build", async () => {
    const company = companies("first_firm") as any;

    const newClient = await assertQueriesCount(0, false, () =>
      company.clientsOfFirm.new({ name: "Another Client" }),
    );
    expect(company.clientsOfFirm.loaded).toBeFalsy();

    expect(newClient.name).toBe("Another Client");
    expect(newClient.isPersisted()).toBeFalsy();
    expect(await company.clientsOfFirm.last()).toBe(newClient);
  });

  it("build", async () => {
    const company = companies("first_firm") as any;

    const newClient = await assertQueriesCount(0, false, () =>
      company.clientsOfFirm.build({ name: "Another Client" }),
    );
    expect(company.clientsOfFirm.loaded).toBeFalsy();

    expect(newClient.name).toBe("Another Client");
    expect(newClient.isPersisted()).toBeFalsy();
    expect(await company.clientsOfFirm.last()).toBe(newClient);
  });

  it("delete all with not yet loaded association collection", async () => {
    await forceSignal37ToLoadAllClientsOfFirm(companies);

    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBeTruthy();

    await (companies("first_firm") as any).clientsOfFirm.create({ name: "Another Client" });
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(3);
    (companies("first_firm") as any).clientsOfFirm.reset();
    await (companies("first_firm") as any).clientsOfFirm.deleteAll();
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(0);
    expect(await (await (companies("first_firm") as any).clientsOfFirm.reload()).size()).toBe(0);
  });

  it("calling size on an association that has not been loaded performs a query", async () => {
    const car = (await Car.create({})) as any;
    await Bulb.create({ car_id: car.id });
    const carTwo = (await Car.create({})) as any;
    await assertQueriesCount(1, false, async () => {
      expect(await car.bulbs.size()).toBe(1);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await carTwo.bulbs.size()).toBe(0);
    });
  });

  it("calling size on an association that has been loaded does not perform query", async () => {
    const car = (await Car.create({})) as any;
    await Bulb.create({ car_id: car.id });
    await car.bulbIds;
    const carTwo = (await Car.create({})) as any;
    await carTwo.bulbIds;
    await assertNoQueries(false, async () => {
      expect(await car.bulbs.size()).toBe(1);
    });
    await assertNoQueries(false, async () => {
      expect(await carTwo.bulbs.size()).toBe(0);
    });
  });

  it("calling empty on an association that has not been loaded performs a query", async () => {
    const car = (await Car.create({})) as any;
    await Bulb.create({ car_id: car.id });
    const carTwo = (await Car.create({})) as any;
    await assertQueriesCount(1, false, async () => {
      expect(await car.bulbs.isEmpty()).toBe(false);
    });
    await assertQueriesCount(1, false, async () => {
      expect(await carTwo.bulbs.isEmpty()).toBe(true);
    });
  });

  it("calling empty on an association that has been loaded does not performs query", async () => {
    const car = (await Car.create({})) as any;
    await Bulb.create({ car_id: car.id });
    await car.bulbIds;
    const carTwo = (await Car.create({})) as any;
    await carTwo.bulbIds;
    await assertNoQueries(false, async () => {
      expect(await car.bulbs.isEmpty()).toBe(false);
    });
    await assertNoQueries(false, async () => {
      expect(await carTwo.bulbs.isEmpty()).toBe(true);
    });
  });

  it("calling many should return false if none or one", async () => {
    let firm = companies("another_firm") as any;
    expect(await firm.clientsLikeMs.isMany()).toBeFalsy();
    expect(await firm.clientsLikeMs.size()).toBe(0);

    firm = companies("first_firm") as any;
    expect(await firm.limitedClients.isMany()).toBeFalsy();
    expect(await firm.limitedClients.size()).toBe(1);
  });

  it("calling many should return true if more than one", async () => {
    const firm = companies("first_firm") as any;
    expect(await firm.clients.isMany()).toBeTruthy();
    expect(await firm.clients.size()).toBe(3);
  });

  it("calling none should return true if none", async () => {
    const firm = companies("another_firm") as any;
    expect(await firm.clientsLikeMs.isNone()).toBeTruthy();
    expect(await firm.clientsLikeMs.size()).toBe(0);
  });

  it("calling none should return false if any", async () => {
    const firm = companies("first_firm") as any;
    expect(await firm.limitedClients.isNone()).toBeFalsy();
    expect(await firm.limitedClients.size()).toBe(1);
  });

  it("get ids", async () => {
    expect(await (companies("first_firm") as any).clientIds).toEqual([
      companies("first_client").id,
      companies("second_client").id,
      companies("another_first_firm_client").id,
    ]);
  });

  it("get ids for ordered association", async () => {
    expect(await (companies("first_firm") as any).clientsOrderedByNameIds).toEqual([
      companies("another_first_firm_client").id,
      companies("second_client").id,
      companies("first_client").id,
    ]);
  });

  it("creation respects hash condition", async () => {
    const msClient = (companies("first_firm") as any).clientsLikeMsWithHashConditions.build();

    expect(await msClient.save()).toBeTruthy();
    expect(msClient.name).toBe("Microsoft");

    const anotherMsClient = await (
      companies("first_firm") as any
    ).clientsLikeMsWithHashConditions.create();

    expect(anotherMsClient.isPersisted()).toBeTruthy();
    expect(anotherMsClient.name).toBe("Microsoft");
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies"]);
  setup();
  beforeAll(async () => {
    await Company.loadSchema();
    await HmPost.loadSchema();
    await Comment.loadSchema();
    await Car.loadSchema();
    await Bulb.loadSchema();
  });
  registerModel(Company);
  registerModel(HmFirm);
  registerModel(Client);
  registerModel(HmPost);
  registerModel(Comment);
  registerModel(Car);
  registerModel(Bulb);
  Company.inheritanceColumn = "type";
  registerSubclass(HmFirm);
  registerSubclass(Client);

  it("dangerous association name raises ArgumentError", () => {
    for (const name of ["errors", "save"]) {
      expect(() => {
        class Anon extends Base {
          static {
            this.hasMany(name);
          }
        }
        void Anon;
      }).toThrow(ArgumentError);
    }
  });

  it("association keys bypass attribute protection", async () => {
    const car = (await Car.create({ name: "honda" })) as any;

    let bulb = car.bulbs.new();
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = car.bulbs.new({ car_id: Number(car.id) + 1 });
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = car.bulbs.build();
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = car.bulbs.build({ car_id: Number(car.id) + 1 });
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = await car.bulbs.create();
    expect(bulb.car_id).toBe(Number(car.id));

    bulb = await car.bulbs.create({ car_id: Number(car.id) + 1 });
    expect(bulb.car_id).toBe(Number(car.id));
  });

  it("include method in has many association should return true for instance added with build", async () => {
    const post = HmPost.new();
    const comments = (post as any).comments;
    const comment = comments.build();
    expect(await comments.isInclude(comment)).toBe(true);
  });

  it("include uses array include after loaded", async () => {
    const firm = companies("first_firm") as any;
    const clients = firm.clients;
    await clients.loadTarget();

    const client = clients.target[0];

    await assertNoQueries(false, async () => {
      expect(clients.loaded).toBe(true);
      expect(await clients.isInclude(client)).toBe(true);
    });
  });
});

describe("HasManyAssociationsTest", () => {
  const { accounts, authors, comments, companies, cpkAuthors, interests, posts, zines } = fixtures([
    "accounts",
    "categories",
    "companies",
    "developers",
    "projects",
    "developersProjects",
    "topics",
    "authors",
    "authorAddresses",
    "comments",
    "posts",
    "readers",
    "taggings",
    "cars",
    "tags",
    "categorizations",
    "zines",
    "interests",
    "humans",
    "shardedBlogPosts",
    "shardedComments",
    "cpkBooks",
    "cpkAuthors",
  ]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("select query method", async () => {
    const comment = await (posts("welcome") as any).comments.select("id", "body").first();
    expect(Object.keys(comment.attributes)).toEqual(["id", "body"]);
  });

  it("exists respects association scope", async () => {
    registerModel(HmPerson);
    registerModel(HmReference);
    const person = HmPerson.new() as any;
    person.first_name = "Sasuke";
    await person.references.push(HmReference.new());
    await person.saveBang();
    expect(await person.references.exists()).toBeTruthy();
  });

  it("update all respects association scope", async () => {
    registerModel(HmPerson);
    registerModel(HmReference);
    const person = HmPerson.new() as any;
    person.first_name = "Naruto";
    await person.references.push(HmReference.new());
    await person.saveBang();
    expect(await person.references.updateAll({ favorite: true })).toBe(1);
  });

  it("no sql should be fired if association already loaded", async () => {
    await Car.create({ name: "honda" });
    const bulbs = (await Car.first())!.bulbs as any;
    await bulbs.toArray();

    await assertNoQueries(false, async () => {
      await bulbs.first();
    });

    await assertNoQueries(false, async () => {
      await bulbs.second();
    });

    await assertNoQueries(false, async () => {
      await bulbs.third();
    });

    await assertNoQueries(false, async () => {
      await bulbs.fourth();
    });

    await assertNoQueries(false, async () => {
      await bulbs.fifth();
    });

    await assertNoQueries(false, async () => {
      await bulbs.fortyTwo();
    });

    await assertNoQueries(false, async () => {
      await bulbs.thirdToLast();
    });

    await assertNoQueries(false, async () => {
      await bulbs.secondToLast();
    });

    await assertNoQueries(false, async () => {
      await bulbs.last();
    });
  });

  it("associations autosaves when object is already persisted", async () => {
    const author = await HmAuthor.create({ name: "Alice" });
    const post = await HmPost.create({ author_id: author.id, title: "Saved", body: "body" });
    expect(post.isNewRecord()).toBe(false);
    post.title = "Updated";
    await post.save();
    const reloaded = await HmPost.find(post.id!);
    expect((reloaded as any).title).toBe("Updated");
  });

  it("does not duplicate associations when used with natural primary keys", async () => {
    const author = await HmAuthor.create({ name: "Alice" });
    await HmPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts1 = await author.posts;
    const posts2 = await author.posts;
    expect(posts1.length).toBe(posts2.length);
  });

  it("sending new to association proxy should have same effect as calling new", () => {
    const clientAssociation = (companies("first_firm") as any).clients;
    expect(clientAssociation.new().attributes).toEqual(clientAssociation["new"]().attributes);
  });

  it("prevent double insertion of new object when the parent association loaded in the after save callback", async () => {
    const author = await HmAuthor.create({ name: "Alice" });
    await HmPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts = await author.posts;
    const unique = new Set(posts.map((p: any) => p.id));
    expect(unique.size).toBe(posts.length);
  });

  it("anonymous has many", async () => {
    class AnonDeveloper extends Base {
      declare developerProjects: AssociationProxy<AnonDeveloperProject>;

      static {
        this.tableName = "developers";
        this.hasMany("developerProjects", {
          className: "AnonDeveloperProject",
          foreignKey: "developer_id",
        });
      }
    }
    class AnonDeveloperProject extends Base {
      static {
        this.tableName = "developers_projects";
        this.belongsTo("developer", { className: "AnonDeveloper" });
      }
    }
    registerModel(AnonDeveloper);
    registerModel(AnonDeveloperProject);
    const dev = (await AnonDeveloper.first()) as any;
    const named = (await Developer.find(dev.id)) as any;
    expect(await dev.developerProjects.count()).toBeGreaterThan(0);
    const namedProjectIds = (await named.projects).map((p: any) => p.id).sort();
    const devProjectIds = (await dev.developerProjects).map((p: any) => p.project_id).sort();
    expect(namedProjectIds).toEqual(devProjectIds);
  });
  it("default scope on relations is not cached", async () => {
    let counter = 0;
    class DefaultScopeCounterComment extends Base {
      static {
        this.tableName = "comments";
        this.belongsTo("post", { className: "DefaultScopeCounterPost", foreignKey: "post_id" });
        this.defaultScope((q: any) => {
          counter += 1;
          return q.where(`id = ${counter}`);
        });
      }
    }
    class DefaultScopeCounterPost extends Base {
      declare comments: AssociationProxy<DefaultScopeCounterComment>;

      static {
        this.tableName = "posts";
        this.hasMany("comments", {
          className: "DefaultScopeCounterComment",
          foreignKey: "post_id",
        });
      }
    }
    registerModel(DefaultScopeCounterComment);
    registerModel(DefaultScopeCounterPost);
    await DefaultScopeCounterPost.create({ title: "Welcome", body: "body" });
    expect(counter).toBe(0);
    const post = (await DefaultScopeCounterPost.first()) as any;
    expect(counter).toBe(0);
    const queries = await captureSql(async () => {
      await post.comments.toArray();
    });
    post.comments.reset();
    const queries2 = await captureSql(async () => {
      await post.comments.toArray();
    });
    expect(queries2).not.toEqual(queries);
  });
  it("add record to collection should change its updated at", async () => {
    registerModel(HmShip);
    registerModel(HmShipPart);
    const ship = await HmShip.create({ name: "dauntless" });
    const part = await HmShipPart.create({ name: "cockpit" });
    const updatedAt = (part as any).updated_at;
    (part as any).ship_id = ship.id;
    await (part as any).save();
    const reloaded = await HmShipPart.find((part as any).id);
    expect((reloaded as any).ship_id).toBe(Number(ship.id));
    expect((reloaded as any).updated_at).toBeDefined();
  });
  it("clear collection should not change updated at", async () => {
    registerModel(HmShip);
    registerModel(HmShipPart);
    const ship = await HmShip.create({ name: "dauntless" });
    const part = await HmShipPart.create({ name: "cockpit", ship_id: ship.id });

    await (ship as any).parts.clear();
    await part.reload();

    expect(await (part as any).ship).toBeNull();
    expect((part as any).attributeChanged("updated_at")).toBeFalsy();
  });
  it("create from association should respect default scope", async () => {
    const car = (await Car.create({ name: "honda" })) as any;
    expect(car.name).toBe("honda");

    let bulb = (await Bulb.create()) as any;
    expect(bulb.name).toBe("defaulty");

    bulb = car.bulbs.build();
    expect(bulb.name).toBe("defaulty");

    bulb = await car.bulbs.create();
    expect(bulb.name).toBe("defaulty");

    bulb = await car.bulbs.createBang();
    expect(bulb.name).toBe("defaulty");
  });
  it.fails(
    "build and create from association should respect passed attributes over default scope",
    async () => {
      const car = (await Car.create({ name: "honda" })) as any;

      let bulb = car.bulbs.where({ name: "exotic" }).build();
      expect(bulb.name).toBe("exotic");
      expect(bulb.countAfterCreate).toBeUndefined();

      bulb = await car.bulbs.where({ name: "exotic" }).create();
      expect(bulb.name).toBe("exotic");
      expect(bulb.countAfterCreate).toBe(1);

      bulb = await car.bulbs.where({ name: "exotic" }).createBang();
      expect(bulb.name).toBe("exotic");
      expect(bulb.countAfterCreate).toBe(2);

      bulb = car.bulbs.build({ name: "exotic" });
      expect(bulb.name).toBe("exotic");

      bulb = await car.bulbs.create({ name: "exotic" });
      expect(bulb.name).toBe("exotic");

      bulb = await car.bulbs.createBang({ name: "exotic" });
      expect(bulb.name).toBe("exotic");

      bulb = car.awesomeBulbs.build({ frickinawesome: false });
      expect(bulb.frickinawesome).toBe(false);

      bulb = await car.awesomeBulbs.create({ frickinawesome: false });
      expect(bulb.frickinawesome).toBe(false);

      bulb = await car.awesomeBulbs.createBang({ frickinawesome: false });
      expect(bulb.frickinawesome).toBe(false);
    },
  );
  it("build and create from association should respect unscope over default scope", async () => {
    const car = (await Car.create({ name: "honda" })) as any;

    let bulb = car.bulbs.unscope({ where: "name" }).build();
    expect(bulb.name).toBeNull();

    bulb = await car.bulbs.unscope({ where: "name" }).create();
    expect(bulb.name).toBeNull();

    bulb = await car.bulbs.unscope({ where: "name" }).createBang();
    expect(bulb.name).toBeNull();

    bulb = car.awesomeBulbs.unscope({ where: "frickinawesome" }).build();
    expect(bulb.frickinawesome).toBe(false);

    bulb = await car.awesomeBulbs.unscope({ where: "frickinawesome" }).create();
    expect(bulb.frickinawesome).toBe(false);

    bulb = await car.awesomeBulbs.unscope({ where: "frickinawesome" }).createBang();
    expect(bulb.frickinawesome).toBe(false);
  });
  it("build from association should respect scope", async () => {
    const author = HmAuthor.new() as any;
    const post = author.thinkingPosts.build();
    expect(post.title).toBe("So I was thinking");
  });
  it("build from association sets inverse instance", async () => {
    const car = Car.new({ name: "honda" }) as any;
    const bulb = car.bulbs.build();
    expect(await bulb.car).toBe(car);
  });
  it("delete all on association is the same as not loaded", async () => {
    class DelAllAuthor extends Base {
      declare name: string | null;
      declare del_all_posts: AssociationProxy<DelAllPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("del_all_posts", {
          className: "DelAllPost",
          foreignKey: "author_id",
          dependent: "delete",
        });
      }
    }
    class DelAllPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(DelAllAuthor);
    registerModel(DelAllPost);
    const author = await DelAllAuthor.create({ name: "Alice" });
    await DelAllPost.create({ author_id: author.id, title: "A", body: "body" });
    await DelAllPost.create({ author_id: author.id, title: "B", body: "body" });
    await author.destroy();
    const remaining = await author.del_all_posts;
    expect(remaining.length).toBe(0);
  });

  it("delete all on association with nil dependency is the same as not loaded", async () => {
    class NilDepAuthor extends Base {
      declare name: string | null;
      declare nil_dep_posts: AssociationProxy<NilDepPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("nil_dep_posts", {
          className: "NilDepPost",
          foreignKey: "author_id",
          dependent: "nullify",
        });
      }
    }
    class NilDepPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(NilDepAuthor);
    registerModel(NilDepPost);
    const author = await NilDepAuthor.create({ name: "Alice" });
    const post = await NilDepPost.create({ author_id: author.id, title: "A", body: "body" });
    await author.destroy();
    const reloaded = await NilDepPost.find(post.id!);
    expect((reloaded as any).author_id).toBeNull();
  });

  it("building the associated object with implicit sti base class", () => {
    class StiCompany extends Base {
      declare name: string | null;
      declare "type": string | null;
      declare firm_id: number | null;

      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.attribute("firm_id", "integer");
      }
    }
    StiCompany.inheritanceColumn = "type";
    class StiFirm extends StiCompany {}
    registerSubclass(StiFirm);
    class StiClient extends StiCompany {}
    registerSubclass(StiClient);
    class StiAccount extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    registerModel(StiCompany);
    registerModel(StiFirm);
    registerModel(StiClient);
    registerModel(StiAccount);

    class DepFirm extends Base {
      declare name: string | null;
      declare stiCompanies: AssociationProxy<StiCompany>;

      static {
        this.attribute("name", "string");
        this.hasMany("stiCompanies", {
          className: "StiCompany",
          foreignKey: "firm_id",
        });
      }
    }
    registerModel(DepFirm);

    const firm = new DepFirm({ name: "Test" });
    const proxy = CollectionProxy._create(
      firm,
      "stiCompanies",
      (DepFirm as any)._reflectOnAssociation("stiCompanies"),
    );
    const company = proxy.build();
    expect(company).toBeInstanceOf(StiCompany);
  });

  it("building the associated object with explicit sti base class", () => {
    class StiCompany2 extends Base {
      declare name: string | null;
      declare "type": string | null;
      declare firm_id: number | null;

      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.attribute("firm_id", "integer");
      }
    }
    StiCompany2.inheritanceColumn = "type";
    class StiClient2 extends StiCompany2 {}
    registerSubclass(StiClient2);
    registerModel(StiCompany2);
    registerModel(StiClient2);

    class DepFirm2 extends Base {
      declare name: string | null;
      declare stiCompany2s: AssociationProxy<StiCompany2>;

      static {
        this.attribute("name", "string");
        this.hasMany("stiCompany2s", {
          className: "StiCompany2",
          foreignKey: "firm_id",
        });
      }
    }
    registerModel(DepFirm2);

    const firm = new DepFirm2({ name: "Test" });
    const proxy = CollectionProxy._create(
      firm,
      "stiCompany2s",
      (DepFirm2 as any)._reflectOnAssociation("stiCompany2s"),
    );
    const company = proxy.build({ type: "StiCompany2" });
    expect(company).toBeInstanceOf(StiCompany2);
  });

  it("building the associated object with sti subclass", () => {
    class StiCompany3 extends Base {
      declare name: string | null;
      declare "type": string | null;
      declare firm_id: number | null;

      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.attribute("firm_id", "integer");
      }
    }
    StiCompany3.inheritanceColumn = "type";
    class StiClient3 extends StiCompany3 {}
    registerSubclass(StiClient3);
    registerModel(StiCompany3);
    registerModel(StiClient3);

    class DepFirm3 extends Base {
      declare name: string | null;
      declare stiCompany3s: AssociationProxy<StiCompany3>;

      static {
        this.attribute("name", "string");
        this.hasMany("stiCompany3s", {
          className: "StiCompany3",
          foreignKey: "firm_id",
        });
      }
    }
    registerModel(DepFirm3);

    const firm = new DepFirm3({ name: "Test" });
    const proxy = CollectionProxy._create(
      firm,
      "stiCompany3s",
      (DepFirm3 as any)._reflectOnAssociation("stiCompany3s"),
    );
    const company = proxy.build({ type: "StiClient3" });
    expect(company).toBeInstanceOf(StiClient3);
  });

  it("building the associated object with an invalid type", () => {
    class StiCompany4 extends Base {
      declare name: string | null;
      declare "type": string | null;
      declare firm_id: number | null;

      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.attribute("firm_id", "integer");
      }
    }
    StiCompany4.inheritanceColumn = "type";
    registerModel(StiCompany4);

    class DepFirm4 extends Base {
      declare name: string | null;
      declare stiCompany4s: AssociationProxy<StiCompany4>;

      static {
        this.attribute("name", "string");
        this.hasMany("stiCompany4s", {
          className: "StiCompany4",
          foreignKey: "firm_id",
        });
      }
    }
    registerModel(DepFirm4);

    const firm = new DepFirm4({ name: "Test" });
    const proxy = CollectionProxy._create(
      firm,
      "stiCompany4s",
      (DepFirm4 as any)._reflectOnAssociation("stiCompany4s"),
    );
    expect(() => proxy.build({ type: "Invalid" })).toThrow(SubclassNotFound);
  });

  it("building the associated object with an unrelated type", () => {
    class StiCompany5 extends Base {
      declare name: string | null;
      declare "type": string | null;
      declare firm_id: number | null;

      static {
        this.attribute("name", "string");
        this.attribute("type", "string");
        this.attribute("firm_id", "integer");
      }
    }
    StiCompany5.inheritanceColumn = "type";
    class UnrelatedModel extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    registerModel(StiCompany5);
    registerModel(UnrelatedModel);

    class DepFirm5 extends Base {
      declare name: string | null;
      declare stiCompany5s: AssociationProxy<StiCompany5>;

      static {
        this.attribute("name", "string");
        this.hasMany("stiCompany5s", {
          className: "StiCompany5",
          foreignKey: "firm_id",
        });
      }
    }
    registerModel(DepFirm5);

    const firm = new DepFirm5({ name: "Test" });
    const proxy = CollectionProxy._create(
      firm,
      "stiCompany5s",
      (DepFirm5 as any)._reflectOnAssociation("stiCompany5s"),
    );
    expect(() => proxy.build({ type: "UnrelatedModel" })).toThrow(SubclassNotFound);
  });
  it("build the association with an array", async () => {
    const speedometer = Speedometer.new({ speedometer_id: "a" }) as any;
    const data = [{ name: "first" }, { name: "second" }];
    speedometer.minivans.where({ color: "blue" }).build(data);

    expect(await speedometer.minivans.size()).toBe(2);
    expect(await speedometer.save()).toBe(true);

    await speedometer.reload();

    const minivans = (await speedometer.minivans) as any[];
    expect(minivans.map((m) => m.name).sort()).toEqual(["first", "second"]);
    expect(minivans.map((m) => m.color)).toEqual(["blue", "blue"]);
  });

  it("new the association with an array", async () => {
    const speedometer = Speedometer.new({ speedometer_id: "a" }) as any;
    const data = [{ name: "first" }, { name: "second" }];
    speedometer.minivans.where({ color: "blue" }).new(data);

    expect(await speedometer.minivans.size()).toBe(2);
    expect(await speedometer.save()).toBe(true);

    await speedometer.reload();

    const minivans = (await speedometer.minivans) as any[];
    expect(minivans.map((m) => m.name).sort()).toEqual(["first", "second"]);
    expect(minivans.map((m) => m.color)).toEqual(["blue", "blue"]);
  });

  it("create the association with an array", async () => {
    const speedometer = (await Speedometer.createBang({ speedometer_id: "a" })) as any;
    const data = [{ name: "first" }, { name: "second" }];
    await speedometer.minivans.where({ color: "blue" }).create(data);

    expect(await speedometer.minivans.size()).toBe(2);

    await speedometer.reload();

    const minivans = (await speedometer.minivans) as any[];
    expect(minivans.map((m) => m.name).sort()).toEqual(["first", "second"]);
    expect(minivans.map((m) => m.color)).toEqual(["blue", "blue"]);
  });

  it("create! the association with an array", async () => {
    const speedometer = (await Speedometer.createBang({ speedometer_id: "a" })) as any;
    const data = [{ name: "first" }, { name: "second" }];
    await speedometer.minivans.where({ color: "blue" }).createBang(data);

    expect(await speedometer.minivans.size()).toBe(2);

    await speedometer.reload();

    const minivans = (await speedometer.minivans) as any[];
    expect(minivans.map((m) => m.name).sort()).toEqual(["first", "second"]);
    expect(minivans.map((m) => m.color)).toEqual(["blue", "blue"]);
  });
  it("association protect foreign key", async () => {
    const invoice = (await Invoice.create()) as any;

    let lineItem = invoice.lineItems.new();
    expect(lineItem.invoice_id).toBe(Number(invoice.id));

    lineItem = invoice.lineItems.new({ invoice_id: Number(invoice.id) + 1 });
    expect(lineItem.invoice_id).toBe(Number(invoice.id));

    lineItem = invoice.lineItems.build();
    expect(lineItem.invoice_id).toBe(Number(invoice.id));

    lineItem = invoice.lineItems.build({ invoice_id: Number(invoice.id) + 1 });
    expect(lineItem.invoice_id).toBe(Number(invoice.id));

    lineItem = await invoice.lineItems.create();
    expect(lineItem.invoice_id).toBe(Number(invoice.id));

    lineItem = await invoice.lineItems.create({ invoice_id: Number(invoice.id) + 1 });
    expect(lineItem.invoice_id).toBe(Number(invoice.id));
  });
  it("association enum works properly", async () => {
    class SpecialAuthor extends Base {
      static _tableName = "authors";

      static {
        this.hasMany("books", { className: "SpecialBook", foreignKey: "author_id" });
      }
    }
    class SpecialBook extends Base {
      declare last_read: "unread" | "reading" | "read" | "forgotten";

      static _tableName = "books";

      static {
        this.belongsTo("author");
        this.enum("last_read", { unread: 0, reading: 2, read: 3, forgotten: null });
      }
    }
    registerModel(SpecialAuthor);
    registerModel(SpecialBook);

    const author = await SpecialAuthor.createBang({ name: "Test" });
    const book = await SpecialBook.createBang({ last_read: "reading" });
    await (author as any).books.push(book);

    expect(book.last_read).toBe("reading");
    expect(
      await SpecialAuthor.joins(":books")
        .where({ books: { last_read: "reading" } })
        .count(),
    ).not.toBe(0);
  });
  describe("with cars fixtures", () => {
    const { cars } = fixtures(["cars"]);

    it("build and create should not happen within scope", async () => {
      const car = cars("honda") as any;
      const scope = car.fooBulbs.whereValuesHash();

      let bulb = car.fooBulbs.build();
      expect(bulb.scopeAfterInitialize.whereValuesHash()).not.toEqual(scope);

      bulb = await car.fooBulbs.create();
      expect(bulb.scopeAfterInitialize.whereValuesHash()).not.toEqual(scope);

      bulb = await car.fooBulbs.createBang();
      expect(bulb.scopeAfterInitialize.whereValuesHash()).not.toEqual(scope);
    });
  });
  it("finder method with dirty target", async () => {
    const company = companies("first_firm") as any;
    const newClients: any[] = [];

    await assertQueriesCount(0, false, async () => {
      newClients.push(company.clientsOfFirm.build({ name: "Another Client" }));
      newClients.push(company.clientsOfFirm.build({ name: "Another Client II" }));
      newClients.push(company.clientsOfFirm.build({ name: "Another Client III" }));
    });

    expect(company.clientsOfFirm.loaded).toBeFalsy();
    await assertQueriesCount(1, false, async () => {
      expect(await company.clientsOfFirm.third()).toBe(newClients[0]);
      expect(await company.clientsOfFirm.fourth()).toBe(newClients[1]);
      expect(await company.clientsOfFirm.fifth()).toBe(newClients[2]);
      expect(await company.clientsOfFirm.thirdToLast()).toBe(newClients[0]);
      expect(await company.clientsOfFirm.secondToLast()).toBe(newClients[1]);
      expect(await company.clientsOfFirm.last()).toBe(newClients[2]);
    });
  });

  describe("with authors/posts fixtures", () => {
    const {
      companies: firms,
      authors,
      posts,
    } = fixtures(["companies", "accounts", "authors", "authorAddresses", "posts", "comments"]);

    it("finding array compatibility", async () => {
      const firm = await HmFirm.order("id").find((f: any) => f.id > 0);
      expect((await firm.clients).length).toBe(3);
    });

    it("find many with merged options", async () => {
      const firm = firms("first_firm") as any;
      expect(await firm.limitedClients.size()).toBe(1);
      expect((await firm.limitedClients.toArray()).length).toBe(1);
      expect((await firm.limitedClients.limit(null).toArray()).length).toBe(3);
    });

    it("dynamic find should respect association order", async () => {
      const firstFirm = firms("first_firm") as any;
      expect((await firstFirm.clientsSortedDesc.where("type = 'Client'").first()).id).toBe(
        firms("another_first_firm_client").id,
      );
      expect((await firstFirm.clientsSortedDesc.findBy({ type: "Client" })).id).toBe(
        firms("another_first_firm_client").id,
      );
    });

    it("taking", async () => {
      await posts("other_by_bob").destroy();
      const bob = authors("bob") as any;
      expect((await bob.posts.take()).id).toBe(posts("misc_by_bob").id);
      expect((await bob.posts.takeBang()).id).toBe(posts("misc_by_bob").id);
      await bob.posts.toArray();
      expect((await bob.posts.take()).id).toBe(posts("misc_by_bob").id);
      expect((await bob.posts.takeBang()).id).toBe(posts("misc_by_bob").id);
    });

    it("taking not found", async () => {
      const bob = authors("bob") as any;
      await bob.posts.deleteAll();
      await expect(bob.posts.takeBang()).rejects.toThrow(RecordNotFound);
      await bob.posts.toArray();
      await expect(bob.posts.takeBang()).rejects.toThrow(RecordNotFound);
    });

    it("taking with a number", async () => {
      class TakingNumberAuthor extends HmAuthor {
        static {
          this.hasMany("posts", (q: any) => q.order("id"), { foreignKey: "author_id" });
        }
      }
      registerModel(TakingNumberAuthor);

      const idsOf = (records: any[]) => records.map((r: any) => r.id);
      const bob = (await TakingNumberAuthor.find(authors("bob").id!)) as any;
      const newPost = bob.posts.build();
      expect(bob.posts.loaded).toBeFalsy();
      expect(idsOf(await bob.posts.take(1))).toEqual([posts("misc_by_bob").id]);
      expect(idsOf(await bob.posts.take(2))).toEqual([
        posts("misc_by_bob").id,
        posts("other_by_bob").id,
      ]);
      expect(idsOf(await bob.posts.take(3))).toEqual([
        posts("misc_by_bob").id,
        posts("other_by_bob").id,
        newPost.id,
      ]);

      await bob.posts.load();
      expect(bob.posts.loaded).toBeTruthy();
      expect(idsOf(await bob.posts.take(1))).toEqual([posts("misc_by_bob").id]);
      expect(idsOf(await bob.posts.take(2))).toEqual([
        posts("misc_by_bob").id,
        posts("other_by_bob").id,
      ]);
      expect(idsOf(await bob.posts.take(3))).toEqual([
        posts("misc_by_bob").id,
        posts("other_by_bob").id,
        newPost.id,
      ]);
    });
  });
  it("find should append to association order", async () => {
    const orderedClients = (companies("first_firm") as any).clientsSortedDesc.order("companies.id");
    expect(orderedClients.orderValues).toEqual(["id DESC", "companies.id"]);
  });
  it("taking with inverse of", async () => {
    await (interests("woodsmanship") as any).destroy();
    await (interests("survival") as any).destroy();

    const zine = zines("going_out") as any;
    const interest = await zine.interests.take();
    expect(interest.equals(interests("hunting"))).toBe(true);
    expect(await interest.zine).toBe(zine);
  });
  it("cant save has many readonly association", async () => {
    for (const c of await (authors("david") as any).readonlyComments) {
      await expect(c.saveBang()).rejects.toThrow(ReadOnlyRecord);
    }
    for (const c of await (authors("david") as any).readonlyComments) {
      expect(c.isReadonly()).toBe(true);
    }
  });

  it("update all on association accessed before save", async () => {
    class UpdAllAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class UpdAllPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(UpdAllAuthor);
    registerModel(UpdAllPost);
    const author = await UpdAllAuthor.create({ name: "Alice" });
    const post = await UpdAllPost.create({ author_id: author.id, title: "Old", body: "body" });
    post.title = "New";
    await post.save();
    const reloaded = await UpdAllPost.find(post.id!);
    expect((reloaded as any).title).toBe("New");
  });
  it("update all on association accessed before save with explicit foreign key", async () => {
    class UpdAllFkAuthor extends Base {
      declare upd_all_fk_posts: AssociationProxy<UpdAllFkPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("upd_all_fk_posts", {
          className: "UpdAllFkPost",
          foreignKey: "author_id",
        });
      }
    }
    class UpdAllFkPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(UpdAllFkAuthor);
    registerModel(UpdAllFkPost);
    const author = await UpdAllFkAuthor.create({ name: "Alice" });
    const post = await UpdAllFkPost.create({ author_id: author.id, title: "Old", body: "body" });
    post.title = "Updated";
    await post.save();
    const posts = await author.upd_all_fk_posts;
    expect((posts[0] as any).title).toBe("Updated");
  });
  it("find all with include and conditions", async () => {
    registerModel(Developer);
    registerModel(AuditLog);
    await Developer.create({ name: "Smith" });
    await expect(
      Developer.all()
        .joins(":auditLogs")
        .where({ "audit_logs.message": null, name: "Smith" })
        .toArray(),
    ).resolves.not.toThrow();
  });
  it("default select", async () => {
    const comment = await (posts("welcome") as any).comments.first();
    expect(Object.keys(comment.attributes).sort()).toEqual([...Comment.columnNames()].sort());
  });
  it("select with block and dirty target", async () => {
    expect((await (posts("welcome") as any).comments.select(() => true)).length).toBe(2);
    (posts("welcome") as any).comments.build();
    expect((await (posts("welcome") as any).comments.select(() => true)).length).toBe(3);
  });
  it("create with bang on has many raises when record not saved", async () => {
    const author = HmAuthor.new({ name: "Unsaved" });
    expect(author.isNewRecord()).toBe(true);
    const post = HmPost.new({ author_id: author.id, title: "Test" });
    expect((post as any).author_id).toBeNull();
  });
  it("create with bang on habtm when parent is new raises", async () => {
    const developer = Developer.new({ name: "Aredridel" });
    let error: any;
    try {
      await association(developer, "projects").createBang({});
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(RecordNotSaved);
    expect(error.message).toBe("You cannot call create unless the parent is saved");
    expect(error.record).toBe(developer);
  });
  it("inverse on before validate", async () => {
    const firm = companies("first_firm") as any;
    await assertQueriesCount(3, false, async () => {
      await firm.clientsOfFirm.push(new Client({ name: "Natural Company" }));
    });
  });

  it("collection size twice for regressions", async () => {
    const post = posts("thinking") as any;
    expect(await post.readers.size()).toBe(0);
    await post.reload();
    post.readers.build();
    const size1 = await post.readers.size();
    const size2 = await post.readers.size();
    expect(size2).toBe(size1);
  });

  it("build followed by save does not load target", async () => {
    (companies("first_firm") as any).clientsOfFirm.build({ name: "Another Client" });
    expect(await (companies("first_firm") as any).save()).toBeTruthy();
    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBe(false);
  });

  it("create followed by save does not load target", async () => {
    await (companies("first_firm") as any).clientsOfFirm.create({ name: "Another Client" });
    expect(await (companies("first_firm") as any).save()).toBeTruthy();
    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBe(false);
  });
  it("dependent association respects optional conditions on delete", async () => {
    const firm = companies("odegy") as any;
    await Client.create({ client_of: firm.id, name: "BigShot Inc." });
    await Client.create({ client_of: firm.id, name: "SmallTime Inc." });
    expect(await Client.where({ client_of: firm.id }).size()).toBe(2);
    expect(await firm.dependentConditionalClientsOfFirm.size()).toBe(1);
    await firm.destroy();
    expect(await Client.where({ client_of: firm.id }).size()).toBe(1);
  });

  it("deleting self type mismatch", async () => {
    const author = await HmAuthor.create({ name: "Alice" });
    await HmPost.create({ author_id: author.id, title: "A", body: "body" });
    await author.destroy();
    expect(author.isDestroyed()).toBe(true);
  });

  it("destroy all on association clears scope", async () => {
    class DestroyAllScopeAuthor extends Base {
      declare name: string | null;
      declare destroy_all_scope_posts: AssociationProxy<DestroyAllScopePost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("destroy_all_scope_posts", {
          className: "DestroyAllScopePost",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    class DestroyAllScopePost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(DestroyAllScopeAuthor);
    registerModel(DestroyAllScopePost);
    const author = await DestroyAllScopeAuthor.create({ name: "Alice" });
    await DestroyAllScopePost.create({ author_id: author.id, title: "A", body: "body" });
    await DestroyAllScopePost.create({ author_id: author.id, title: "B", body: "body" });
    await author.destroy();
    const remaining = await author.destroy_all_scope_posts;
    expect(remaining.length).toBe(0);
  });

  it("destroy on association clears scope", async () => {
    class DestroyScopeAuthor extends Base {
      declare destroy_scope_posts: AssociationProxy<DestroyScopePost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("destroy_scope_posts", {
          className: "DestroyScopePost",
          foreignKey: "author_id",
        });
      }
    }
    class DestroyScopePost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(DestroyScopeAuthor);
    registerModel(DestroyScopePost);
    const author = await DestroyScopeAuthor.create({ name: "Alice" });
    const post = await DestroyScopePost.create({ author_id: author.id, title: "A", body: "body" });
    await post.destroy();
    const remaining = await author.destroy_scope_posts;
    expect(remaining.length).toBe(0);
  });

  it("delete on association clears scope", async () => {
    class DeleteScopeAuthor extends Base {
      declare delete_scope_posts: AssociationProxy<DeleteScopePost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("delete_scope_posts", {
          className: "DeleteScopePost",
          foreignKey: "author_id",
        });
      }
    }
    class DeleteScopePost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(DeleteScopeAuthor);
    registerModel(DeleteScopePost);
    const author = await DeleteScopeAuthor.create({ name: "Alice" });
    const post = await DeleteScopePost.create({ author_id: author.id, title: "A", body: "body" });
    await DeleteScopePost.destroy(post.id!);
    const remaining = await author.delete_scope_posts;
    expect(remaining.length).toBe(0);
  });
  it("dependence for associations with hash condition", async () => {
    const david = authors("david") as any;
    await assertDifference(
      async () => Number(await HmPost.count()),
      -1,
      null,
      async () => {
        expect(await david.destroy()).toBeTruthy();
      },
    );
  });
  it("three levels of dependence", async () => {
    class ThreeLvlTopic extends Base {
      declare title: string | null;
      declare replies: AssociationProxy<ThreeLvlReply>;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
        this.hasMany("replies", {
          className: "ThreeLvlReply",
          foreignKey: "parent_id",
          dependent: "destroy",
        });
      }
    }
    class ThreeLvlReply extends Base {
      declare title: string | null;
      declare content: string | null;
      declare parent_id: number | null;
      declare replies: AssociationProxy<ThreeLvlReply>;

      static {
        this._tableName = "topics";
        this.attribute("title", "string");
        this.attribute("content", "string");
        this.attribute("parent_id", "integer");
        this.hasMany("replies", {
          className: "ThreeLvlReply",
          foreignKey: "parent_id",
          dependent: "destroy",
        });
      }
    }
    registerModel(ThreeLvlTopic);
    registerModel(ThreeLvlReply);
    const topic = await ThreeLvlTopic.create({ title: "neat and simple" });
    const reply = await (topic as any).replies.create({
      title: "neat and simple",
      content: "still digging it",
    });
    await reply.replies.create({ title: "neat and simple", content: "ain't complaining" });
    await topic.destroy();
    expect(await ThreeLvlTopic.find(topic.id).catch(() => null)).toBeNull();
  });
  it("dependence with transaction support on failure", async () => {
    const firm = companies("first_firm") as any;
    const clients = firm.clients;
    expect((await clients.toArray()).length).toBe(3);
    (await clients.last()).overwriteToRaise = () => {
      throw new Error("Trigger rollback");
    };

    await firm.destroy().catch(() => "do nothing");

    expect((await Client.all().mergeBang({ where: `firm_id=${firm.id}` })).length).toBe(3);
  });

  it("restrict with error with locale", async () => {
    class ReLocaleAuthor extends Base {
      declare name: string | null;
      declare re_locale_posts: AssociationProxy<ReLocalePost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("re_locale_posts", {
          className: "ReLocalePost",
          foreignKey: "author_id",
          dependent: "restrictWithError",
        });
      }
    }
    class ReLocalePost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(ReLocaleAuthor);
    registerModel(ReLocalePost);
    const author = await ReLocaleAuthor.create({ name: "Writer" });
    await ReLocalePost.create({ author_id: author.id, title: "P", body: "body" });
    expect(await author.destroy()).toBe(false);
    expect(author.errors.where("base")).toHaveLength(1);
    expect(author.errors.messagesFor("base")[0]).toBe(
      "Cannot delete record because dependent re locale posts exist",
    );
    expect(await ReLocaleAuthor.findBy({ id: author.id })).not.toBeNull();
    expect(await ReLocalePost.where({ author_id: author.id }).count()).toBe(1);
  });
  it("included in collection for composite keys", async () => {
    const greatAuthor = cpkAuthors("cpk_great_author") as any;
    const book = await greatAuthor.books.first();

    expect(await greatAuthor.books.isInclude(book)).toBeTruthy();
  });
  it("adding array and collection", async () => {
    class ArrAuthor extends Base {
      declare arr_posts: AssociationProxy<ArrPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("arr_posts", {
          className: "ArrPost",
          foreignKey: "author_id",
        });
      }
    }
    class ArrPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(ArrAuthor);
    registerModel(ArrPost);
    const author = await ArrAuthor.create({ name: "Alice" });
    await ArrPost.create({ author_id: author.id, title: "A", body: "body" });
    await ArrPost.create({ author_id: author.id, title: "B", body: "body" });
    await ArrPost.create({ author_id: author.id, title: "C", body: "body" });
    const loaded = await author.arr_posts;
    expect(loaded.length).toBe(3);
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("replace failure", async () => {
    const firm = companies("first_firm") as any;
    const account = Account.new();
    const origAccounts = await firm.accounts.toArray();

    assertNot(await account.isValid());
    assertNotEmpty(origAccounts);
    const error = await assertRaise([RecordNotSaved], {}, async () => {
      await firm.association("accounts").writer([account]);
    });

    expect((await firm.accounts.toArray()).map(recordId)).toEqual(origAccounts.map(recordId));
    expect(error.message).toBe(
      "Failed to replace accounts because one or more of the " + "new records could not be saved.",
    );
  });
});

describe("HasManyAssociationsTest", () => {
  const { accounts, authors, comments, companies, cpkAuthors, interests, posts, zines } = fixtures([
    "accounts",
    "categories",
    "companies",
    "developers",
    "projects",
    "developersProjects",
    "topics",
    "authors",
    "authorAddresses",
    "comments",
    "posts",
    "readers",
    "taggings",
    "cars",
    "tags",
    "categorizations",
    "zines",
    "interests",
    "humans",
    "shardedBlogPosts",
    "shardedComments",
    "cpkBooks",
    "cpkAuthors",
  ]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("ids reader cache not used for size when association is dirty", async () => {
    class DirtyIdAuthor extends Base {
      declare dirty_id_posts: AssociationProxy<DirtyIdPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("dirty_id_posts", {
          className: "DirtyIdPost",
          foreignKey: "author_id",
        });
      }
    }
    class DirtyIdPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(DirtyIdAuthor);
    registerModel(DirtyIdPost);
    const author = await DirtyIdAuthor.create({ name: "Writer" });
    await DirtyIdPost.create({ author_id: author.id, title: "P1", body: "body" });
    const posts = await author.dirty_id_posts;
    expect(posts).toHaveLength(1);
    await DirtyIdPost.create({ author_id: author.id, title: "P2", body: "body" });
    await author.reload();
    const posts2 = await author.dirty_id_posts;
    expect(posts2).toHaveLength(2);
  });
  it("ids reader cache should be cleared when collection is deleted", async () => {
    const firm = companies("first_firm") as any;
    expect(await firm.clientIds).toEqual([2, 3, 11]);
    const client = await firm.clients.first();
    await firm.clients.delete(client);
    expect(await firm.clientIds).toEqual([3, 11]);
  });
});

describe("HasManyAssociationsTest", () => {
  fixtures(["companies"]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("set ids for association on new record applies association correctly", async () => {
    const contractA = await Contract.createBang();
    const contractB = await Contract.createBang();
    await Contract.createBang();
    const company = Company.new({ name: "Some Company" }) as any;

    await company.association("contracts").idsWriter([contractA.id, contractB.id]);
    expect(await company.contractIds).toEqual([contractA.id, contractB.id]);
    expect((await company.contracts.toArray()).map(recordId)).toEqual(
      [contractA, contractB].map(recordId),
    );

    await company.saveBang();
    expect(recordId(await ((await contractA.reload()) as any).company)).toBe(recordId(company));
    expect(recordId(await ((await contractB.reload()) as any).company)).toBe(recordId(company));
  });
});

describe("HasManyAssociationsTest", () => {
  const { accounts, authors, comments, companies, cpkAuthors, interests, posts, zines } = fixtures([
    "accounts",
    "categories",
    "companies",
    "developers",
    "projects",
    "developersProjects",
    "topics",
    "authors",
    "authorAddresses",
    "comments",
    "posts",
    "readers",
    "taggings",
    "cars",
    "tags",
    "categorizations",
    "zines",
    "interests",
    "humans",
    "shardedBlogPosts",
    "shardedComments",
    "cpkBooks",
    "cpkAuthors",
  ]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("assign ids ignoring blanks", async () => {
    const firm = (await HmFirm.createBang({ name: "Apple" })) as any;
    await firm
      .association("clients")
      .idsWriter([
        (companies("first_client") as any).id,
        null,
        (companies("second_client") as any).id,
        "",
      ]);
    await firm.saveBang();

    expect(await (await firm.clients.reload()).size()).toBe(2);
    expect(await firm.clients.isInclude(companies("second_client"))).toBe(true);
  });
  it("modifying a through a has many should raise", async () => {
    for (const block of [
      async () =>
        (authors("mary") as any)
          .association("comments")
          .idsWriter([(comments("greetings") as any).id, (comments("more_greetings") as any).id]),
      async () =>
        (authors("mary") as any)
          .association("comments")
          .writer([comments("greetings"), comments("more_greetings")]),
      async () =>
        (authors("mary") as any).comments.push(
          await Comment.createBang({ body: "Yay", post_id: 424242 }),
        ),
      async () =>
        (authors("mary") as any).comments.delete(await (authors("mary") as any).comments.first()),
    ]) {
      await expect(block()).rejects.toThrow(
        HasManyThroughCantAssociateThroughHasOneOrManyReflection,
      );
    }
  });
  it("associations order should be priority over throughs order", async () => {
    const original = authors("david") as any;
    const expected = [13, 12, 10, 9, 8, 7, 6, 5, 3, 2, 1];
    expect((await original.commentsDesc.toArray()).map((c: any) => c.id)).toEqual(expected);
    const preloaded = (await HmAuthor.includes("commentsDesc").find(original.id)) as any;
    expect((await preloaded.commentsDesc.toArray()).map((c: any) => c.id)).toEqual(expected);
    expect(
      (await (await original.postsSortedById.first()).comments.toArray()).map((c: any) => c.id),
    ).toEqual(
      (await (await preloaded.postsSortedById.first()).comments.toArray()).map((c: any) => c.id),
    );
  });
  it("dynamic find should respect association order for through", async () => {
    expect(
      await (authors("david") as any).commentsDesc
        .where("comments.type = 'SpecialComment'")
        .first(),
    ).toEqual(await Comment.find(10));
    expect(await (authors("david") as any).commentsDesc.findBy({ type: "SpecialComment" })).toEqual(
      await Comment.find(10),
    );
  });
  it("has many through respects hash conditions", async () => {
    const byId = (a: any, b: any) => a.id - b.id;
    expect((await (authors("david") as any).helloPosts.toArray()).sort(byId)).toEqual(
      (await (authors("david") as any).helloPostsWithHashConditions.toArray()).sort(byId),
    );
    expect((await (authors("david") as any).helloPostComments.toArray()).sort(byId)).toEqual(
      (await (authors("david") as any).helloPostCommentsWithHashConditions.toArray()).sort(byId),
    );
  });
  describe("with companies fixtures for finders", () => {
    const { companies: firms2, topics: topics2 } = fixtures([
      "companies",
      "accounts",
      "authors",
      "authorAddresses",
      "topics",
    ]);

    it("finding with foreign key", async () => {
      const firm = firms2("first_firm") as any;
      expect((await firm.clientsOfFirm.first()).name).toBe("Microsoft");
    });

    it("finding using primary key", async () => {
      const firm = firms2("first_firm") as any;
      expect((await firm.clientsUsingPrimaryKey.first()).name).toBe("Summit");
    });

    it("belongs to with new object", async () => {
      const c = Client.new() as any;
      expect(await c.firm).toBeNull();
    });

    it("find one message on primary key", async () => {
      const firm = firms2("first_firm") as any;

      let e: any;
      try {
        await firm.clients.find(0);
      } catch (err) {
        e = err;
      }
      expect(e).toBeInstanceOf(RecordNotFound);
      expect(e.id).toBe(0);
      expect(e.primaryKey).toBe("id");
      expect(e.model).toBe("Client");
      expect(e.message).toMatch(/^Couldn't find Client with 'id'=0/);
    });

    it("find ids and inverse of", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clientsOfFirm.load();

      expect(firm.clientsOfFirm.loaded).toBeTruthy();

      const client = await firm.clientsOfFirm.find(3);
      expect(client).toBeInstanceOf(Client);

      const clientAry = await firm.clientsOfFirm.find([3]);
      expect(Array.isArray(clientAry)).toBe(true);
      expect(clientAry[0]).toEqual(client);
    });

    it("adding a collection", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clientsOfFirm.loadTarget();

      expect(firm.clientsOfFirm.loaded).toBeTruthy();

      const result = await firm.clientsOfFirm.concat([
        Client.new({ name: "Natural Company" }),
        Client.new({ name: "Apple" }),
      ]);
      expect(await firm.clientsOfFirm.size()).toBe(4);
      expect(await (await firm.clientsOfFirm.reload()).size()).toBe(4);
      expect(firm.clientsOfFirm).toEqual(result);
    });

    it("collection not empty after building", async () => {
      const company = firms2("first_firm") as any;
      expect(await company.contracts.isEmpty()).toBe(true);
      company.contracts.build();
      expect(await company.contracts.isEmpty()).toBe(false);
    });

    it("build without loading association", async () => {
      const firstTopic = topics2("first") as any;

      expect((await firstTopic.replies.toArray()).length).toBe(1);

      await assertQueriesCount(0, false, async () => {
        firstTopic.replies.build({ title: "Not saved", content: "Superstars" });
        expect(await firstTopic.replies.size()).toBe(2);
      });

      expect((await firstTopic.replies.toArray()).length).toBe(2);
    });

    it("build via block", async () => {
      const company = firms2("first_firm") as any;

      let newClient: any;
      await assertQueriesCount(0, false, async () => {
        newClient = company.clientsOfFirm.build(undefined, (client: any) => {
          client.name = "Another Client";
        });
      });
      expect(company.clientsOfFirm.loaded).toBeFalsy();

      expect(newClient.name).toBe("Another Client");
      expect(newClient.isPersisted()).toBeFalsy();
      expect(await company.clientsOfFirm.last()).toEqual(newClient);
    });

    it("create", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clientsOfFirm.loadTarget();

      expect(firm.clientsOfFirm.loaded).toBeTruthy();

      const newClient = await firm.clientsOfFirm.create({ name: "Another Client" });
      expect(newClient.isPersisted()).toBe(true);
      expect(await firm.clientsOfFirm.last()).toBe(newClient);
      expect((await (await firm.clientsOfFirm.reload()).last()).id).toBe(newClient.id);
    });

    it("include uses array include after loaded", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clients.load();
      const client = await firm.clients.first();
      await assertNoQueries(false, async () => {
        expect(firm.clients.loaded).toBeTruthy();
        expect(await firm.clients.isInclude(client)).toBe(true);
      });
    });

    it("include checks if record exists if target not loaded", async () => {
      const firm = firms2("first_firm") as any;
      const client = await firm.clients.first();

      await firm.reload();
      expect(firm.clients.loaded).toBeFalsy();
      await assertQueriesCount(1, false, async () => {
        expect(await firm.clients.isInclude(client)).toBe(true);
      });
      expect(firm.clients.loaded).toBeFalsy();
    });

    it("include returns false for non matching record to verify scoping", async () => {
      const firm = firms2("first_firm") as any;
      const client = await Client.createBang({ name: "Not Associated" });

      expect(firm.clients.loaded).toBeFalsy();
      expect(await firm.clients.isInclude(client)).toBe(false);
    });

    it("calling first nth or last on association should not load association", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clients.first();
      await firm.clients.second();
      await firm.clients.last();
      expect(firm.clients.loaded).toBeFalsy();
    });

    it("calling first or last on loaded association should not fetch with query", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clients.load();
      expect(firm.clients.loaded).toBeTruthy();

      await assertNoQueries(false, async () => {
        await firm.clients.first();
        expect((await firm.clients.first(2)).length).toBe(2);
        await firm.clients.last();
        expect((await firm.clients.last(2)).length).toBe(2);
      });
    });

    it("calling first nth or last on existing record with build should load association", async () => {
      const firm = firms2("first_firm") as any;
      firm.clients.build({ name: "Foo" });
      expect(firm.clients.loaded).toBeFalsy();

      await assertQueriesCount(1, false, async () => {
        await firm.clients.first();
        await firm.clients.second();
        await firm.clients.last();
      });

      expect(firm.clients.loaded).toBeTruthy();

      const author = (await HmAuthor.createBang({ name: "Carl" })) as any;
      const third = topics2("third");
      const fourth = (topics2("fourth") as any).becomes(HmTopic);

      const newTopic = author.topicsWithoutType.build();
      expect(author.topicsWithoutType.loaded).toBeFalsy();

      await assertQueriesCount(1, false, async () => {
        if (currentAdapter("Mysql2Adapter", "TrilogyAdapter", "SQLite3Adapter")) {
          expect((await author.topicsWithoutType.first()).id).toBe(fourth.id);
          expect((await author.topicsWithoutType.second()).id).toBe(third.id);
        }
        expect(await author.topicsWithoutType.last()).toBe(newTopic);
      });

      expect(author.topicsWithoutType.loaded).toBeTruthy();
    });

    it("calling first nth or last on existing record with create should not load association", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clients.create({ name: "Foo" });
      expect(firm.clients.loaded).toBeFalsy();

      await assertQueriesCount(3, false, async () => {
        await firm.clients.first();
        await firm.clients.second();
        await firm.clients.last();
      });

      expect(firm.clients.loaded).toBeFalsy();
    });

    it("calling first nth or last on new record should not run queries", async () => {
      const firm = HmFirm.new() as any;

      await assertNoQueries(false, async () => {
        await firm.clients.first();
        await firm.clients.second();
        await firm.clients.last();
      });
    });

    it("calling first or last with integer on association should not load association", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clients.create({ name: "Foo" });
      expect(firm.clients.loaded).toBeFalsy();

      await assertQueriesCount(2, false, async () => {
        await firm.clients.first(2);
        await firm.clients.last(2);
      });

      expect(firm.clients.loaded).toBeFalsy();
    });

    it("calling many should count instead of loading association", async () => {
      const firm = firms2("first_firm") as any;
      await assertQueriesCount(1, false, async () => {
        await firm.clients.isMany();
      });
      expect(firm.clients.loaded).toBeFalsy();
    });

    it("calling many on loaded association should not use query", async () => {
      const firm = firms2("first_firm") as any;
      await firm.clients.load();
      await assertNoQueries(false, async () => {
        expect(await firm.clients.isMany()).toBeTruthy();
      });
    });

    it("subsequent calls to many should use query", async () => {
      const firm = firms2("first_firm") as any;
      await assertQueriesCount(2, false, async () => {
        await firm.clients.isMany();
        await firm.clients.isMany();
      });
    });
  });
  it("calling many should defer to collection if using a block", async () => {
    const firm = companies("first_firm") as any;
    await assertQueriesCount(1, false, async () => {
      const size = vi.spyOn(firm.clients, "size");
      await firm.clients.isMany(() => true);
      expect(size).not.toHaveBeenCalled();
      size.mockRestore();
    });
    expect(firm.clients.loaded).toBe(true);
  });
  describe("with companies fixtures for none/one", () => {
    const { companies: firms3 } = fixtures(["companies", "accounts"]);

    it("calling none should count instead of loading association", async () => {
      const firm = firms3("first_firm") as any;
      await assertQueriesCount(1, false, async () => {
        await firm.clients.isNone();
      });
      expect(firm.clients.loaded).toBeFalsy();
    });

    it("calling none on loaded association should not use query", async () => {
      const firm = firms3("first_firm") as any;
      await firm.clients.load();
      await assertNoQueries(false, async () => {
        expect(await firm.clients.isNone()).toBeFalsy();
      });
    });

    it("calling none should defer to collection if using a block", async () => {
      const firm = firms3("first_firm") as any;
      await assertQueriesCount(1, false, async () => {
        await firm.clients.isNone(() => true);
      });
      expect(firm.clients.loaded).toBeTruthy();
    });

    it("calling one should count instead of loading association", async () => {
      const firm = firms3("first_firm") as any;
      await assertQueriesCount(1, false, async () => {
        await firm.clients.isOne();
      });
      expect(firm.clients.loaded).toBeFalsy();
    });

    it("calling one on loaded association should not use query", async () => {
      const firm = firms3("first_firm") as any;
      await firm.clients.load();
      await assertNoQueries(false, async () => {
        expect(await firm.clients.isOne()).toBeFalsy();
      });
    });

    it("subsequent calls to one should use query", async () => {
      const firm = firms3("first_firm") as any;
      await assertQueriesCount(2, false, async () => {
        await firm.clients.isOne();
        await firm.clients.isOne();
      });
    });

    it("calling one should defer to collection if using a block", async () => {
      const firm = firms3("first_firm") as any;
      await assertQueriesCount(1, false, async () => {
        await firm.clients.isOne(() => true);
      });
      expect(firm.clients.loaded).toBeTruthy();
    });

    it("calling one should return false if zero", async () => {
      const firm = firms3("another_firm") as any;
      expect(await firm.clientsLikeMs.isOne()).toBeFalsy();
      expect(await firm.clientsLikeMs.size()).toBe(0);
    });

    it("calling one should return false if more than one", async () => {
      const firm = firms3("first_firm") as any;
      expect(await firm.clients.isOne()).toBeFalsy();
      expect(await firm.clients.size()).toBe(3);
    });
  });
  it("joins with namespaced model should use correct type", async () => {
    const old = Base.storeFullStiClass;
    Base.storeFullStiClass = true;
    try {
      const firm = await NamespacedFirm.create({ name: "Some Company" });
      await firm.clients.create({ name: "Some Client" });

      const stats = (await NamespacedFirm.all()
        .select(
          `${NamespacedFirm.tableName}.id, COUNT(${NamespacedClient.tableName}.id) AS num_clients`,
        )
        .joins(":clients")
        .group(`${NamespacedFirm.tableName}.id`)
        .find(firm.id)) as any;
      expect(Number(stats.readAttribute("num_clients"))).toBe(1);
    } finally {
      Base.storeFullStiClass = old;
    }
  });
  it("association proxy transaction method starts transaction in association class", async () => {
    class TxProxyAuthor extends Base {
      declare name: string | null;
      declare tx_proxy_posts: AssociationProxy<TxProxyPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("tx_proxy_posts", {
          className: "TxProxyPost",
          foreignKey: "author_id",
        });
      }
    }
    class TxProxyPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(TxProxyAuthor);
    registerModel(TxProxyPost);
    const author = await TxProxyAuthor.create({ name: "Alice" });
    const proxy = association(author, "tx_proxy_posts");
    expect(proxy).toBeDefined();
  });
  it("defining has many association with delete all dependency lazily evaluates target class", async () => {
    class LazyDelAuthor extends Base {
      declare name: string | null;
      declare lazy_del_posts: AssociationProxy<LazyDelPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("lazy_del_posts", {
          className: "LazyDelPost",
          foreignKey: "author_id",
          dependent: "delete",
        });
      }
    }
    class LazyDelPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(LazyDelAuthor);
    registerModel(LazyDelPost);
    const author = await LazyDelAuthor.create({ name: "Alice" });
    await LazyDelPost.create({ author_id: author.id, title: "A", body: "body" });
    await author.destroy();
    const remaining = await author.lazy_del_posts;
    expect(remaining.length).toBe(0);
  });
  it("defining has many association with nullify dependency lazily evaluates target class", async () => {
    class LazyNullAuthor extends Base {
      declare name: string | null;
      declare lazy_null_posts: AssociationProxy<LazyNullPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("lazy_null_posts", {
          className: "LazyNullPost",
          foreignKey: "author_id",
          dependent: "nullify",
        });
      }
    }
    class LazyNullPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(LazyNullAuthor);
    registerModel(LazyNullPost);
    const author = await LazyNullAuthor.create({ name: "Alice" });
    const post = await LazyNullPost.create({ author_id: author.id, title: "A", body: "body" });
    await author.destroy();
    const reloaded = await LazyNullPost.find(post.id!);
    expect((reloaded as any).author_id).toBeNull();
  });
  it("attributes are being set when initialized from has many association with where clause", async () => {
    const newComment = (posts("welcome") as any).comments.where({ body: "Some content" }).build();
    expect(newComment.body).toBe("Some content");
  });
  it("attributes are being set when initialized from has many association with multiple where clauses", async () => {
    const newComment = (posts("welcome") as any).comments
      .where({ body: "Some content" })
      .where({ type: "SpecialComment" })
      .build();
    expect(newComment.body).toBe("Some content");
    expect(newComment.type).toBe("SpecialComment");
    expect((posts("welcome") as any).id).toBe(newComment.post_id);
  });
  it("load target respects protected attributes", async () => {
    class ProtAuthor extends Base {
      declare prot_posts: AssociationProxy<ProtPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("prot_posts", {
          className: "ProtPost",
          foreignKey: "author_id",
        });
      }
    }
    class ProtPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(ProtAuthor);
    registerModel(ProtPost);
    const author = await ProtAuthor.create({ name: "Alice" });
    await ProtPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts = await author.prot_posts;
    expect(posts.length).toBe(1);
    expect((posts[0] as any).title).toBe("A");
  });
  it("merging with custom attribute writer", async () => {
    class MergeAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class MergePost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(MergeAuthor);
    registerModel(MergePost);
    const author = await MergeAuthor.create({ name: "Alice" });
    const post = MergePost.new({ author_id: author.id });
    post.title = "Merged";
    expect((post as any).title).toBe("Merged");
    expect((post as any).author_id).toBe(Number(author.id));
  });
  it("dont call save callbacks twice on has many", async () => {
    const firm = companies("first_firm") as any;
    const contract = await firm.contracts.createBang();

    expect(contract.hiCount).toBe(1);
    expect(contract.byeCount).toBe(1);
  });
  it("association attributes are available to after initialize", async () => {
    class InitAttrAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class InitAttrPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(InitAttrAuthor);
    registerModel(InitAttrPost);
    const author = await InitAttrAuthor.create({ name: "Alice" });
    const post = InitAttrPost.new({ author_id: author.id, title: "Init" });
    expect((post as any).author_id).toBe(Number(author.id));
    expect((post as any).title).toBe("Init");
  });
  it("attributes are set when initialized from has many null relationship", async () => {
    registerModel(HmCar);
    registerModel(HmBulb);
    const car = HmCar.new({ name: "honda" }) as any;
    const bulb = await car.bulbs.where({ name: "headlight" }).firstOrInitialize();
    expect(bulb.name).toBe("headlight");
  });
  it("collection association with private kernel method", async () => {
    const firm = companies("first_firm") as any;
    expect((await firm.accounts.open().toArray()).map((a: any) => a.id)).toEqual([
      (accounts("signals37") as any).id,
    ]);
    expect((await firm.accounts.available().toArray()).map((a: any) => a.id)).toEqual([
      (accounts("signals37") as any).id,
    ]);
  });
  it("association with or doesnt set inverse instance key", async () => {
    const firm = companies("first_firm") as any;
    const accounts = firm.accounts.or(Account.where({ firm_id: null })).order("id");
    expect((await accounts.toArray()).map((a: any) => a.firm_id)).toEqual([firm.id, null]);
  });
  it("association with rewhere doesnt set inverse instance key", async () => {
    const firm = companies("first_firm") as any;
    const accounts = firm.accounts.rewhere({ firm_id: [firm.id, null] }).order("id");
    expect((await accounts.toArray()).map((a: any) => a.firm_id)).toEqual([firm.id, null]);
  });
  it("first_or_initialize adds the record to the association", async () => {
    class FoiAuthor extends Base {
      declare foi_posts: AssociationProxy<FoiPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("foi_posts", {
          className: "FoiPost",
          foreignKey: "author_id",
        });
      }
    }
    class FoiPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(FoiAuthor);
    registerModel(FoiPost);
    const author = await FoiAuthor.create({ name: "Alice" });
    const posts = await author.foi_posts;
    expect(posts.length).toBe(0);
    const post = FoiPost.new({ author_id: author.id, title: "Initialized" });
    expect(post.isNewRecord()).toBe(true);
    expect((post as any).author_id).toBe(Number(author.id));
  });
});

describe("HasManyAssociationsTest", () => {
  fixtures(["companies"]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("first_or_create adds the record to the association", async () => {
    const firm = (await HmFirm.createBang({ name: "omg" })) as any;
    await firm.clientsOfFirm.loadTarget();
    const client = await firm.clientsOfFirm.where({ name: "lol" }).firstOrCreate();
    expect(client.name).toBe("lol");
    expect((await firm.clientsOfFirm.toArray()).map(recordId)).toEqual([client].map(recordId));
    expect((await (await firm.reload()).clientsOfFirm.toArray()).map(recordId)).toEqual(
      [client].map(recordId),
    );
  });

  it("first_or_create! adds the record to the association", async () => {
    const firm = (await HmFirm.createBang({ name: "omg" })) as any;
    await firm.clientsOfFirm.loadTarget();
    const client = await firm.clientsOfFirm.where({ name: "lol" }).firstOrCreateBang();
    expect(client.name).toBe("lol");
    expect((await firm.clientsOfFirm.toArray()).map(recordId)).toEqual([client].map(recordId));
    expect((await (await firm.reload()).clientsOfFirm.toArray()).map(recordId)).toEqual(
      [client].map(recordId),
    );
  });
});

describe("HasManyAssociationsTest", () => {
  fixtures([]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("delete_all, when not loaded, doesn't load the records", async () => {
    class NoLoadDelAuthor extends Base {
      declare name: string | null;
      declare no_load_del_posts: AssociationProxy<NoLoadDelPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("no_load_del_posts", {
          className: "NoLoadDelPost",
          foreignKey: "author_id",
          dependent: "delete",
        });
      }
    }
    class NoLoadDelPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(NoLoadDelAuthor);
    registerModel(NoLoadDelPost);
    const author = await NoLoadDelAuthor.create({ name: "Alice" });
    await NoLoadDelPost.create({ author_id: author.id, title: "A", body: "body" });
    await NoLoadDelPost.create({ author_id: author.id, title: "B", body: "body" });
    await author.destroy();
    const remaining = await author.no_load_del_posts;
    expect(remaining.length).toBe(0);
  });

  it("has many associations on new records use null relations", async () => {
    const post = HmPost.new() as any;

    await assertNoQueries(false, async () => {
      expect(await post.comments.toArray()).toEqual([]);
      expect(await post.comments.where({ body: "omg" }).toArray()).toEqual([]);
      expect(await post.comments.pluck("body")).toEqual([]);
      expect(await post.comments.sum("id")).toBe(0);
      expect(await post.comments.count()).toBe(0);
    });
  });
});

describe("HasManyAssociationsTest", () => {
  const { posts } = fixtures(["posts", "comments"]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("association with extend option", () => {
    const post = posts("welcome") as any;
    expect(post.commentsWithExtend.author()).toBe("lifo");
    expect(post.commentsWithExtend.greeting()).toBe("hello :)");
  });
});

describe("HasManyAssociationsTest", () => {
  const { accounts, authors, comments, companies, cpkAuthors, interests, posts, zines } = fixtures([
    "accounts",
    "categories",
    "companies",
    "developers",
    "projects",
    "developersProjects",
    "topics",
    "authors",
    "authorAddresses",
    "comments",
    "posts",
    "readers",
    "taggings",
    "cars",
    "tags",
    "categorizations",
    "zines",
    "interests",
    "humans",
    "shardedBlogPosts",
    "shardedComments",
    "cpkBooks",
    "cpkAuthors",
  ]);
  setup();

  beforeAll(async () => {
    await Developer.loadSchema();
    await Project.loadSchema();
    await Speedometer.loadSchema();
    await Minivan.loadSchema();
    await Invoice.loadSchema();
    await HmLineItem.loadSchema();
  });
  registerModel(Developer);
  registerModel(Project);
  registerModel(Speedometer);
  registerModel(Minivan);
  registerModel(Invoice);
  registerModel(HmLineItem);

  it("association with extend option with multiple extensions", async () => {
    const post = posts("welcome") as any;
    expect(post.commentsWithExtend_2.author()).toBe("lifo");
    expect(post.commentsWithExtend_2.greeting()).toBe("hullo :)");
  });

  it("extend option affects per association", async () => {
    const post = posts("welcome") as any;
    expect(post.commentsWithExtend.author()).toBe("lifo");
    expect(post.commentsWithExtend_2.author()).toBe("lifo");
    expect(post.commentsWithExtend.greeting()).toBe("hello :)");
    expect(post.commentsWithExtend_2.greeting()).toBe("hullo :)");
  });

  it("delete record with complex joins", async () => {
    const david = authors("david") as any;

    const post = await david.posts.first();
    post.type = "PostWithSpecialCategorization";
    await post.save();

    const categorization = await post.categorizations.first();
    categorization.special = true;
    await categorization.save();

    expect(await david.postsWithSpecialCategorizations.toArray()).not.toEqual([]);
    await david.association("postsWithSpecialCategorizations").writer([]);
    expect(await david.postsWithSpecialCategorizations.toArray()).toEqual([]);
  });
  it("unscopes the default scope of associated model when used with include", async () => {
    class UsInclAuthor extends Base {
      declare us_incl_posts: AssociationProxy<UsInclPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("us_incl_posts", {
          className: "UsInclPost",
          foreignKey: "author_id",
        });
      }
    }
    class UsInclPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(UsInclAuthor);
    registerModel(UsInclPost);
    const author = await UsInclAuthor.create({ name: "Alice" });
    await UsInclPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts = await author.us_incl_posts;
    expect(posts.length).toBe(1);
  });
  it("raises RecordNotDestroyed when replaced child can't be destroyed", async () => {
    class RndAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class RndPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(RndAuthor);
    registerModel(RndPost);
    const author = await RndAuthor.create({ name: "Alice" });
    const post = await RndPost.create({ author_id: author.id, title: "A", body: "body" });
    expect(post.isPersisted()).toBe(true);
    await post.destroy();
    expect(post.isDestroyed()).toBe(true);
  });
  it("passes custom context validation to validate children", async () => {
    registerModel(FamousPirate);
    registerModel(FamousShip);
    const pirate = FamousPirate.new() as any;
    const ship = FamousShip.new() as any;
    await pirate.famousShips.push(ship);

    expect(await pirate.isValid()).toBe(true);
    expect(await pirate.isValid("conference")).toBe(false);
    expect(ship.errors.messagesFor("name")[0]).toBe("can't be blank");
  });
  it("association with instance dependent scope", async () => {
    const bob = authors("bob") as any;
    await HmPost.createBang({ title: "signed post by bob", body: "stuff", author: authors("bob") });
    await HmPost.createBang({
      title: "anonymous post",
      body: "more stuff",
      author: authors("bob"),
    });
    expect((await bob.postsWithSignature.toArray()).map((p: any) => p.title).sort()).toEqual([
      "misc post by bob",
      "other post by bob",
      "signed post by bob",
    ]);

    expect(
      (await (authors("david") as any).postsWithSignature.toArray()).map((p: any) => p.title),
    ).toEqual([]);
  });
  it("associations replace in memory when records have the same id", async () => {
    class ReplMemAuthor extends Base {
      declare repl_mem_posts: AssociationProxy<ReplMemPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("repl_mem_posts", {
          className: "ReplMemPost",
          foreignKey: "author_id",
        });
      }
    }
    class ReplMemPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(ReplMemAuthor);
    registerModel(ReplMemPost);
    const author = await ReplMemAuthor.create({ name: "Alice" });
    const post = await ReplMemPost.create({
      author_id: author.id,
      title: "Original",
      body: "body",
    });
    const posts1 = await author.repl_mem_posts;
    expect(posts1.length).toBe(1);
    expect((posts1[0] as any).title).toBe("Original");
    post.title = "Updated";
    await post.save();
    await author.reload();
    const posts2 = await author.repl_mem_posts;
    expect(posts2.length).toBe(1);
    expect((posts2[0] as any).title).toBe("Updated");
  });

  it("in memory replacement executes no queries", async () => {
    const bulb = await HmBulb.createBang();
    const car = (await HmCar.createBang({ name: "honda", bulbs: [bulb] })) as any;

    expect(car.savedChangeToName).toEqual([null, "honda"]);

    const newBulb = await HmBulb.find(bulb.id);

    await assertNoQueries(false, async () => {
      await car.association("bulbs").writer([newBulb]);
    });
  });
  it("in memory replacements do not execute callbacks", async () => {
    class InMemCbAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class InMemCbPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(InMemCbAuthor);
    registerModel(InMemCbPost);
    const author1 = await InMemCbAuthor.create({ name: "Alice" });
    const author2 = await InMemCbAuthor.create({ name: "Bob" });
    const post = InMemCbPost.new({ author_id: author1.id, title: "A" });
    post.author_id = author2.id as number;
    expect((post as any).author_id).toBe(Number(author2.id));
  });

  it("in memory replacements sets inverse instance", async () => {
    const bulb = await HmBulb.createBang();
    const car = (await HmCar.createBang({ name: "honda", bulbs: [bulb] })) as any;

    expect(car.savedChangeToName).toEqual([null, "honda"]);

    const newBulb = (await HmBulb.find(bulb.id)) as any;
    await car.association("bulbs").writer([newBulb]);

    expect(await newBulb.car).toBe(car);
  });
  it("reattach to new objects replaces inverse association and foreign key", async () => {
    class ReattachAuthor extends Base {
      declare reattach_posts: AssociationProxy<ReattachPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("reattach_posts", {
          className: "ReattachPost",
          foreignKey: "author_id",
        });
      }
    }
    class ReattachPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(ReattachAuthor);
    registerModel(ReattachPost);
    const author1 = await ReattachAuthor.create({ name: "Alice" });
    const author2 = await ReattachAuthor.create({ name: "Bob" });
    const post = await ReattachPost.create({ author_id: author1.id, title: "A", body: "body" });
    post.author_id = author2.id as number;
    await post.save();
    const reloaded = await ReattachPost.find(post.id!);
    expect((reloaded as any).author_id).toBe(Number(author2.id));
    const oldPosts = await author1.reattach_posts;
    const newPosts = await author2.reattach_posts;
    expect(oldPosts.length).toBe(0);
    expect(newPosts.length).toBe(1);
  });

  it("in memory replacement maintains order", async () => {
    const firstBulb = await HmBulb.createBang();
    const secondBulb = await HmBulb.createBang();
    const car = (await HmCar.createBang({ name: "honda", bulbs: [firstBulb, secondBulb] })) as any;

    expect(car.savedChangeToName).toEqual([null, "honda"]);

    const sameBulb = await HmBulb.find(firstBulb.id);
    await car.association("bulbs").writer([secondBulb, sameBulb]);

    expect((await car.bulbs.toArray()).map(recordId)).toEqual(
      [firstBulb, secondBulb].map(recordId),
    );
  });
  it("prevent double firing the before save callback of new object when the parent association saved in the callback", async () => {
    class DblFireAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class DblFirePost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(DblFireAuthor);
    registerModel(DblFirePost);
    let saveCount = 0;
    const author = await DblFireAuthor.create({ name: "Alice" });
    const post = new DblFirePost({ author_id: author.id, title: "A", body: "body" });
    const origSave = post.save.bind(post);
    post.save = async function () {
      saveCount++;
      return origSave();
    };
    await post.save();
    expect(saveCount).toBe(1);
    expect(post.isPersisted()).toBe(true);
  });
  it("ids reader memoization", async () => {
    class MemoAuthor extends Base {
      declare memo_posts: AssociationProxy<MemoPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("memo_posts", {
          className: "MemoPost",
          foreignKey: "author_id",
        });
      }
    }
    class MemoPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(MemoAuthor);
    registerModel(MemoPost);
    const author = await MemoAuthor.create({ name: "Alice" });
    await MemoPost.create({ author_id: author.id, title: "A", body: "body" });
    await MemoPost.create({ author_id: author.id, title: "B", body: "body" });
    const posts1 = await author.memo_posts;
    const ids1 = posts1.map((p: any) => p.id);
    const posts2 = await author.memo_posts;
    const ids2 = posts2.map((p: any) => p.id);
    expect(ids1).toEqual(ids2);
  });
  it("loading association in validate callback doesnt affect persistence", async () => {
    class LoadValAuthor extends Base {
      declare load_val_posts: AssociationProxy<LoadValPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("load_val_posts", {
          className: "LoadValPost",
          foreignKey: "author_id",
        });
      }
    }
    class LoadValPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(LoadValAuthor);
    registerModel(LoadValPost);
    const author = await LoadValAuthor.create({ name: "Alice" });
    const post = await LoadValPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts = await author.load_val_posts;
    expect(posts.length).toBe(1);
    expect(post.isPersisted()).toBe(true);
  });
  it("create children could be rolled back by after save", async () => {
    class RollbackAuthor extends Base {
      declare rollback_posts: AssociationProxy<RollbackPost>;
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("rollback_posts", {
          className: "RollbackPost",
          foreignKey: "author_id",
        });
      }
    }
    class RollbackPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(RollbackAuthor);
    registerModel(RollbackPost);
    const author = await RollbackAuthor.create({ name: "Alice" });
    const post = await RollbackPost.create({ author_id: author.id, title: "A", body: "body" });
    expect(post.isPersisted()).toBe(true);
    const posts = await author.rollback_posts;
    expect(posts.length).toBe(1);
  });
  it("has many with out of range value", async () => {
    const author = await HmAuthor.create({ name: "Alice" });
    await HmPost.create({ author_id: 999999999, title: "A", body: "body" });
    const posts = await author.posts;
    expect(posts.length).toBe(0);
  });
  it("has many association with same foreign key name", async () => {
    class SameFkAuthor extends Base {
      declare name: string | null;
      declare posts: AssociationProxy<SameFkPost>;
      declare published_posts: AssociationProxy<SameFkPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("posts", { className: "SameFkPost", foreignKey: "author_id" });
        this.hasMany("published_posts", { className: "SameFkPost", foreignKey: "author_id" });
      }
    }
    class SameFkPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(SameFkAuthor);
    registerModel(SameFkPost);
    const author = await SameFkAuthor.create({ name: "Alice" });
    await SameFkPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts = await author.posts;
    const pubPosts = await author.published_posts;
    expect(posts.length).toBe(1);
    expect(pubPosts.length).toBe(1);
  });
  it("key ensuring owner was is not valid without dependent option", async () => {
    class KeyValAuthor extends Base {
      declare name: string | null;
      declare key_val_posts: AssociationProxy<KeyValPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("key_val_posts", {
          className: "KeyValPost",
          foreignKey: "author_id",
        });
      }
    }
    class KeyValPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(KeyValAuthor);
    registerModel(KeyValPost);
    const author = await KeyValAuthor.create({ name: "Alice" });
    await KeyValPost.create({ author_id: author.id, title: "A", body: "body" });
    const posts = await author.key_val_posts;
    expect(posts.length).toBe(1);
  });
  it("invalid key raises with message including all default options", async () => {
    class InvKeyAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    registerModel(InvKeyAuthor);
    expect(() => {
      Associations.hasMany.call(InvKeyAuthor, "nonexistent_posts", {
        className: "NonExistentModel",
        foreignKey: "author_id",
      });
    }).not.toThrow();
  });
  it("key ensuring owner was is valid when dependent option is destroy async", async () => {
    class AsyncDepAuthor extends Base {
      declare name: string | null;
      declare async_dep_posts: AssociationProxy<AsyncDepPost>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("async_dep_posts", {
          className: "AsyncDepPost",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    class AsyncDepPost extends Base {
      declare author_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "posts";
        this.attribute("author_id", "integer");
        this.attribute("title", "string");
      }
    }
    registerModel(AsyncDepAuthor);
    registerModel(AsyncDepPost);
    const author = await AsyncDepAuthor.create({ name: "Alice" });
    await AsyncDepPost.create({ author_id: author.id, title: "A", body: "body" });
    await author.destroy();
    const remaining = await author.async_dep_posts;
    expect(remaining.length).toBe(0);
  });
  it("composite primary key malformed association class", () => {
    registerModel(CpkBook);
    const order = new CpkBrokenOrder();
    let error: Error | undefined;
    try {
      order.association("books");
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(CompositePrimaryKeyMismatchError);
    expect(error?.message).toBe(
      `Association CpkBrokenOrder#books primary key ["shop_id", "status"] doesn't match with foreign key broken_order_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });
  it("composite primary key malformed association owner class", () => {
    registerModel(CpkNonCpkBook);
    const order = new CpkBrokenOrderWithNonCpkBooks();
    let error: Error | undefined;
    try {
      order.association("books");
    } catch (e) {
      error = e as Error;
    }
    expect(error).toBeInstanceOf(CompositePrimaryKeyMismatchError);
    expect(error?.message).toBe(
      `Association CpkBrokenOrderWithNonCpkBooks#books primary key ["shop_id", "status"] doesn't match with foreign key broken_order_with_non_cpk_books_id. Please specify query_constraints, or primary_key and foreign_key values.`,
    );
  });
  it("ids reader on preloaded association with composite primary key", async () => {
    const greatAuthor = cpkAuthors("cpk_great_author") as any;

    expect(await ((await CpkAuthor.preload("books").find(greatAuthor.id)) as any).bookIds).toEqual(
      await greatAuthor.books.ids(),
    );
  });
});

describe("HasManyAssociationsTest", () => {
  const { posts } = fixtures(["posts", "tags", "taggings"]);
  setup();

  beforeAll(async () => {
    registerModel(HmPost);
    registerModel(HmTag);
    registerModel(HmTagging);
    await HmPost.loadSchema();
    await HmTag.loadSchema();
    await HmTagging.loadSchema();
  });

  it("sti subselect count", async () => {
    const tag = (await HmTag.first()) as HmTag;
    const len = await (HmPost as any)
      .taggedWith(tag.id as number)
      .limit(10)
      .size();
    expect(len).toBeGreaterThan(0);
  });

  it("deleting updates counter cache without dependent option", async () => {
    const post = posts("welcome") as any;
    const before = ((await HmPost.find(post.id)) as any).tags_count as number;
    await post.taggings.delete(await post.taggings.first());
    expect(((await HmPost.find(post.id)) as any).tags_count).toBe(before - 1);
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);
  setup();

  beforeAll(() => {
    registerModel(HmAuthor);
    registerModel(HmPost);
    registerModel(HmCar);
    registerModel(HmBulb);
  });

  it("build many", async () => {
    const company = companies("first_firm") as any;

    let newClients: any;
    await assertQueriesCount(0, false, () => {
      newClients = company.clientsOfFirm.build([
        { name: "Another Client" },
        { name: "Another Client II" },
      ]);
    });
    expect(newClients.length).toBe(2);
  });

  it("create from association with nil values should work", async () => {
    const car = await HmCar.create({});
    const bulb1 = (car as any).bulbs.new({});
    expect(bulb1.name).toBe("defaulty");
    const bulb2 = (car as any).bulbs.build({});
    expect(bulb2.name).toBe("defaulty");
    const bulb3 = await (car as any).bulbs.create({});
    expect(bulb3.name).toBe("defaulty");
  });

  it("has many build with options", async () => {
    const car = await HmCar.create({});
    await HmBulb.create({ name: "defaulty", car_id: car.id });
    const carBulbs = await (car as any).bulbs;
    const scopedBulbs = await HmBulb.where({ name: "defaulty", car_id: car.id });
    expect(carBulbs.map((b: any) => Number(b.id))).toEqual(
      scopedBulbs.map((b: any) => Number(b.id)),
    );
  });
});

describe("HasManyAssociationsTest", () => {
  fixtures([]);
  setup();
  beforeAll(async () => {
    registerModel(HmCar);
    registerModel(HmBulb);
    await HmCar.loadSchema();
    await HmBulb.loadSchema();
  });

  it("can unscope the default scope of the associated model", async () => {
    const car = await HmCar.create({});
    const bulb1 = await HmBulb.create({ name: "defaulty", car_id: car.id });
    const bulb2 = await HmBulb.create({ name: "other", car_id: car.id });

    const bulbs = await (car as any).bulbs;
    expect(bulbs.map((b: any) => b.id)).toEqual([bulb1.id]);

    const allBulbs = await (car as any).allBulbs.sortBy((b: any) => b.id);
    expect(allBulbs.map((b: any) => b.id)).toEqual([bulb1.id, bulb2.id]);

    const includesCar = (await HmCar.includes(":allBulbs").find(car.id)) as any;
    expect((await includesCar.allBulbs.sortBy((b: any) => b.id)).map((b: any) => b.id)).toEqual([
      bulb1.id,
      bulb2.id,
    ]);

    const eagerCar = (await HmCar.eagerLoad(":allBulbs").find(car.id)) as any;
    expect((await eagerCar.allBulbs.sortBy((b: any) => b.id)).map((b: any) => b.id)).toEqual([
      bulb1.id,
      bulb2.id,
    ]);
  });

  it("can unscope and where the default scope of the associated model", async () => {
    const car = await HmCar.create({});
    await HmBulb.create({ name: "defaulty", car_id: car.id });
    await HmBulb.create({ name: "other", car_id: car.id });

    const bulbs = await (car as any).bulbs;
    expect(bulbs.map((b: any) => b.name)).toEqual(["defaulty"]);

    const others = await (car as any).otherBulbs;
    expect(others.map((b: any) => b.name)).toEqual(["other"]);
  });

  it("can rewhere the default scope of the associated model", async () => {
    const car = await HmCar.create({});
    await HmBulb.create({ name: "defaulty", car_id: car.id });
    await HmBulb.create({ name: "old", car_id: car.id });

    const bulbs = await (car as any).bulbs;
    expect(bulbs.map((b: any) => b.name)).toEqual(["defaulty"]);

    const old = await (car as any).oldBulbs;
    expect(old.map((b: any) => b.name)).toEqual(["old"]);
  });
});

describe("HasManyAssociationsTest", () => {
  const { authors } = fixtures(["authors", "posts", "people", "readers"]);
  setup();

  beforeAll(async () => {
    registerModel(HmAuthor);
    registerModel(HmPost);
    registerModel(HmFirstPost);
    registerModel(HmPerson);
    registerModel(HmReader);
    await HmAuthor.loadSchema();
    await HmPost.loadSchema();
    await HmFirstPost.loadSchema();
  });

  it("create resets cached counters", async () => {
    await HmReader.deleteAll();

    const person = await HmPerson.createBang({ first_name: "tenderlove" });

    const post = (await HmPost.first())!;

    expect(await (person as any).readers.toArray()).toEqual([]);
    expect(await (person as any).readers.findBy({ post_id: post.id })).toBeNull();

    await (person as any).readers.create({ post_id: post.id });

    expect(await (person as any).readers.count()).toBe(1);
    expect((await (person as any).readers.toArray()).length).toBe(1);
    const reader = await (person as any).readers.first();
    expect((await reader.post).id).toBe(post.id);
    expect((await reader.person).id).toBe(person.id);
  });

  it("find scoped grouped having", async () => {
    const david = authors("david") as any;
    const mary = authors("mary") as any;
    expect((await david.popularGroupedPosts).length).toBe(2);
    expect((await mary.popularGroupedPosts).length).toBe(0);
  });

  it("collection proxy respects default scope", async () => {
    const author = await HmAuthor.find(authors("mary").id);
    const exists = await author.firstPosts.exists();
    expect(exists).toBe(false);
  });
});

describe("HasManyAssociationsTestPrimaryKeys", () => {
  const { authors, people } = fixtures(["authors", "authorAddresses", "essays", "people"]);

  beforeAll(async () => {
    registerModel(HmAuthor);
    registerModel(HmAuthorAddress);
    registerModel(HmEssay);
    registerModel(HmPerson);
    await HmAuthor.loadSchema();
    await HmEssay.loadSchema();
    await HmPerson.loadSchema();
  });

  it("has many custom primary key", async () => {
    const david = authors("david");
    const expected = (await HmEssay.where({ writer_id: "David" })).map((e) => e.id).sort();
    const actual = (await association(david, "essays")).map((e) => e.id).sort();
    expect(actual).toEqual(expected);
  });

  it("has many assignment with custom primary key", async () => {
    const david = people("david");
    const names = (await association(david, "essays")).map((e) => (e as HmEssay).name);
    expect(names).toEqual(["A Modest Proposal"]);

    const remote = await HmEssay.create({ name: "Remote Work" });
    await association(david, "essays").replace([remote]);

    const names2 = (await association(david, "essays")).map((e) => (e as HmEssay).name);
    expect(names2).toEqual(["Remote Work"]);
  });
});

const recordId = (record: any): number => Number(record.id);

describe("HasManyAssociationsTest", () => {
  const { companies, topics } = fixtures([
    "companies",
    "accounts",
    "topics",
    "posts",
    "comments",
    "taggings",
    "cars",
    "bulbs",
  ]);
  setup();

  beforeAll(() => {
    registerModel(Company);
    registerModel(HmFirm);
    registerModel(Client);
    registerModel(DependentFirm);
    registerModel(Account);
    Company.inheritanceColumn = "type";
    registerSubclass(HmFirm);
    registerSubclass(Client);
    registerSubclass(DependentFirm);
    registerModel(HmCar);
    registerModel(HmBulb);
    registerModel(HmFunkyBulb);
    registerSubclass(HmFunkyBulb);
    registerModel(HmTopic);
    registerModel(HmReply);
    registerModel(HmSillyReply);
    registerModel(HmUniqueReply);
    registerModel(HmSillyUniqueReply);
    HmTopic.inheritanceColumn = "type";
    registerSubclass(HmReply);
    registerSubclass(HmSillyReply);
    registerSubclass(HmUniqueReply);
    registerSubclass(HmSillyUniqueReply);
    registerModel(HmPost);
    registerModel(Comment);
    registerModel(HmImage);
    registerModel(HmSubStiPost);
    registerModel(HmTagging);
    registerSubclass(HmSubStiPost);
  });

  it("do not call callbacks for delete all", async () => {
    const car = (await HmCar.create({ name: "honda" })) as any;
    await car.funkyBulbs.create({});
    expect(await car.funkyBulbs.count()).toBe(1);
    const reloaded = await car.reload();
    expect(await reloaded.funkyBulbs.deleteAll()).toBe(1);
    expect(await car.funkyBulbs.count()).toBe(0);
  });

  it("find first after reset", async () => {
    const firm = (await HmFirm.first()) as any;
    const collection = firm.clients;
    const original = await collection.first();
    expect(await collection.first()).toBe(original);
    collection.reset();
    expect(await collection.first()).not.toBe(original);
  });

  it("deleting updates counter cache", async () => {
    const topic = (await HmTopic.order("id ASC").first()) as any;
    const actual = (await topic.replies).length;
    expect(actual).toBe(topic.replies_count);
    const firstReply = await topic.replies.first();
    await topic.replies.delete(firstReply);
    await topic.reload();
    expect((await topic.replies).length).toBe(topic.replies_count);
  });

  it("destroy dependent when deleted from association", async () => {
    const firm = companies("first_firm") as any;
    expect(await firm.clients.size()).toBe(3);
    const client = await firm.clients.first();
    await firm.clients.delete(client);
    await expect(Client.find(client.id)).rejects.toThrow(RecordNotFound);
    await expect(firm.clients.find(client.id)).rejects.toThrow(RecordNotFound);
    expect(await firm.clients.size()).toBe(2);
  });

  it("replace", async () => {
    const car = (await HmCar.create({ name: "honda" })) as any;
    const bulb1 = await car.bulbs.create({});
    const bulb2 = await HmBulb.create({});

    expect((await car.bulbs).map(recordId)).toEqual([recordId(bulb1)]);
    await car.bulbs.replace([bulb2]);
    expect((await car.bulbs).map(recordId)).toEqual([recordId(bulb2)]);
    const reloaded = await car.reload();
    expect((await reloaded.bulbs).map(recordId)).toEqual([recordId(bulb2)]);
  });

  it("replace returns target", async () => {
    const car = (await HmCar.create({ name: "honda" })) as any;
    const bulb1 = await car.bulbs.create({});
    const bulb2 = await car.bulbs.create({});
    const bulb3 = await HmBulb.create({});

    expect((await car.bulbs).map(recordId)).toEqual([recordId(bulb1), recordId(bulb2)]);
    const result = await car.bulbs.replace([bulb3, bulb1]);
    expect((await car.bulbs).map(recordId)).toEqual([recordId(bulb1), recordId(bulb3)]);
    expect(result.map(recordId)).toEqual([recordId(bulb1), recordId(bulb3)]);
  });

  it("replace with less", async () => {
    const firm = (await HmFirm.first()) as any;
    await firm.clients.replace([companies("first_client")]);
    expect(await firm.save()).toBe(true);
    await firm.reload();
    expect((await firm.clients).length).toBe(1);
  });

  it("replace with less and dependent nullify", async () => {
    const numCompanies = await Company.count();
    const railsCore = companies("rails_core") as any;
    await railsCore.companies.replace([]);
    expect(await Company.count()).toBe(numCompanies);
  });

  it("replace with same content", async () => {
    const firm = (await HmFirm.first()) as any;
    await firm.clients.replace([]);
    await firm.save();

    await assertNoQueries(false, async () => {
      await firm.clients.replace([]);
    });

    expect(await firm.clients.replace([])).toEqual([]);
  });

  it("transactions when replacing on persisted", async () => {
    const good = new Client({ name: "Good" });
    const bad = new Client({ name: "Bad" });
    bad.raiseOnSave = true;

    await (companies("first_firm") as any).clientsOfFirm.replace([good]);

    try {
      await (companies("first_firm") as any).clientsOfFirm.replace([bad]);
    } catch (error) {
      if (!(error instanceof Client.RaisedOnSave)) throw error;
    }

    expect((await (companies("first_firm") as any).clientsOfFirm.reload()).map(recordId)).toEqual([
      recordId(good),
    ]);
  });

  it("transactions when replacing on new record", async () => {
    const firm = HmFirm.new() as any;
    await assertQueriesCount(0, false, async () => {
      await firm.clientsOfFirm.replace([new Client({ name: "New Client" })]);
    });
  });

  it("calling one should return true if one", async () => {
    const firm = companies("first_firm") as any;
    expect(await firm.limitedClients.isOne()).toBeTruthy();
    expect(await firm.limitedClients.size()).toBe(1);
  });

  it("abstract class with polymorphic has many", async () => {
    const post = (await HmSubStiPost.create({ title: "fooo", body: "baa" })) as any;
    const tagging = (await HmTagging.create({ taggable: post })) as any;
    const taggings = await post.taggings;
    expect(taggings).toHaveLength(1);
    expect(Number(taggings[0].id)).toBe(Number(tagging.id));
  });

  it("with polymorphic has many with custom columns name", async () => {
    const post = (await HmPost.create({ title: "foo", body: "bar" })) as any;
    const image = (await HmImage.create({})) as any;
    await post.images.push(image);
    const images = await post.images;
    expect(images.some((i: any) => Number(i.id) === Number(image.id))).toBe(true);
    const reloaded = (await HmImage.find(Number(image.id))) as any;
    const imageable = await reloaded.imageable;
    expect(Number(imageable.id)).toBe(Number(post.id));
  });

  it("destroy does not raise when association errors on destroy", async () => {
    class PostWithErrorDestroying extends Base {
      static {
        this._tableName = "posts";
        this.beforeDestroy(function () {
          kernelThrow(":abort");
        });
      }
    }
    class AuthorWithErrorDestroyingAssociation extends Base {
      declare name: string | null;
      declare postsWithErrorDestroying: AssociationProxy<PostWithErrorDestroying>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("postsWithErrorDestroying", {
          className: "PostWithErrorDestroying",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    registerModel(AuthorWithErrorDestroyingAssociation);
    registerModel(PostWithErrorDestroying);
    const author = await AuthorWithErrorDestroyingAssociation.create({ name: "Alice" });
    await PostWithErrorDestroying.create({ author_id: author.id, title: "A", body: "body" });
    const countBefore = await AuthorWithErrorDestroyingAssociation.count();
    const result = await author.destroy();
    expect(result).toBeFalsy();
    expect(await AuthorWithErrorDestroyingAssociation.count()).toBe(countBefore);
  });

  it("destroy with bang bubbles errors from associations", async () => {
    class PostWithErrorDestroying2 extends Base {
      static {
        this._tableName = "posts";
        this.beforeDestroy(function () {
          kernelThrow(":abort");
        });
      }
    }
    class AuthorWithErrorDestroyingAssociation2 extends Base {
      declare name: string | null;
      declare postsWithErrorDestroying2: AssociationProxy<PostWithErrorDestroying2>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("postsWithErrorDestroying2", {
          className: "PostWithErrorDestroying2",
          foreignKey: "author_id",
          dependent: "destroy",
        });
      }
    }
    registerModel(AuthorWithErrorDestroyingAssociation2);
    registerModel(PostWithErrorDestroying2);
    const author = await AuthorWithErrorDestroyingAssociation2.create({ name: "Alice" });
    const post = await PostWithErrorDestroying2.create({
      author_id: author.id,
      title: "A",
      body: "body",
    });
    const { RecordNotDestroyed: RND } = await import("../index.js");
    let error: InstanceType<typeof RND> | undefined;
    try {
      await (author as any).destroyBang();
    } catch (e) {
      if (e instanceof RND) error = e;
    }
    expect(error).toBeDefined();
    expect((error as any).record).toBeInstanceOf(PostWithErrorDestroying2);
    void post;
  });

  it("collection destroy uses destroy bang and rolls back the batch on failure", async () => {
    class HaltingComment extends Base {
      declare body: string | null;

      static {
        this._tableName = "comments";
        this.attribute("body", "string");
        this.beforeDestroy(function (this: any) {
          if (this._readAttribute("body") === "keep") kernelThrow(":abort");
        });
      }
    }
    class PostWithHaltingComments extends Base {
      declare title: string | null;
      declare body: string | null;
      declare haltingComments: AssociationProxy<HaltingComment>;

      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.hasMany("haltingComments", {
          className: "HaltingComment",
          foreignKey: "post_id",
          dependent: "destroy",
        });
      }
    }
    registerModel(PostWithHaltingComments);
    registerModel(HaltingComment);
    const post = await PostWithHaltingComments.create({ title: "T", body: "b" });
    const first = await HaltingComment.create({ post_id: post.id, body: "removable" });
    const second = await HaltingComment.create({ post_id: post.id, body: "keep" });

    const { RecordNotDestroyed: RND } = await import("../index.js");
    await expect((post as any).haltingComments.destroy(first, second)).rejects.toBeInstanceOf(RND);

    expect(await HaltingComment.exists(first.id)).toBe(true);
    expect(await HaltingComment.exists(second.id)).toBe(true);
  });

  it("has many preloading with duplicate records", async () => {
    const allPosts = await HmPost.joins(":comments").preload(":comments").order("id");
    const first = allPosts[0] as any;
    const commentIds = (await first.comments)
      .map((c: any) => Number(c.id))
      .sort((a: number, b: number) => a - b);
    expect(commentIds).toEqual([1, 2]);
  });
});

describe("AsyncHasManyAssociationsTest", () => {
  const { companies } = fixtures(["companies", "accounts"]);

  beforeAll(async () => {
    registerModel(Company);
    registerModel(HmFirm);
    registerModel(Client);
    registerModel(Account);
    Company.inheritanceColumn = "type";
    registerSubclass(HmFirm);
    registerSubclass(Client);
    await Company.loadSchema();
    await Account.loadSchema();
  });

  it("async load has many", async () => {
    const firm = companies("first_firm") as any;

    await firm.association("clients").asyncLoadTarget();

    expect(await firm.clients.size()).toBe(3);

    await assertNoQueries(false, async () => {
      expect(firm.clients[2]).not.toBeUndefined();
    });
  });
});

describe("HasManyAssociationsTest", () => {
  const { companies, topics } = fixtures(["companies", "accounts", "topics"]);
  setup();

  beforeAll(() => {
    registerModel(Company);
    registerModel(HmFirm);
    registerModel(Client);
    registerModel(Account);
    registerModel(DependentFirm);
    registerModel(RestrictedWithExceptionFirm);
    Company.inheritanceColumn = "type";
    registerSubclass(HmFirm);
    registerSubclass(Client);
    registerSubclass(DependentFirm);
    registerSubclass(RestrictedWithExceptionFirm);
    registerModel(HmTopic);
    registerModel(HmReply);
    registerModel(HmDefaultRejectedTopic);
    HmTopic.inheritanceColumn = "type";
    registerSubclass(HmReply);
    registerSubclass(HmDefaultRejectedTopic);
  });

  it("select without foreign key", async () => {
    expect(
      (await (companies("first_firm") as any).accounts.select("credit_limit").first()).credit_limit,
    ).toBe((await (companies("first_firm") as any).accounts.first()).credit_limit);
  });

  it("adding", async () => {
    await forceSignal37ToLoadAllClientsOfFirm(companies);

    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBeTruthy();

    const natural = Client.new({ name: "Natural Company" });
    await (companies("first_firm") as any).clientsOfFirm.concat(natural);
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(3);
    await (companies("first_firm") as any).clientsOfFirm.reload();
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(3);
    expect((await (companies("first_firm") as any).clientsOfFirm.last()).equals(natural)).toBe(
      true,
    );
  });

  it("adding using create", async () => {
    const firstFirm = companies("first_firm") as any;
    expect(await firstFirm.plainClients.size()).toBe(3);
    await firstFirm.plainClients.create({ name: "Natural Company" });
    expect((await firstFirm.plainClients.toArray()).length).toBe(4);
    expect(await firstFirm.plainClients.size()).toBe(4);
  });

  it("adding a mismatch class", async () => {
    await expect((companies("first_firm") as any).clientsOfFirm.concat(null)).rejects.toThrow(
      AssociationTypeMismatch,
    );
    await expect((companies("first_firm") as any).clientsOfFirm.concat(1)).rejects.toThrow(
      AssociationTypeMismatch,
    );
    await expect(
      (companies("first_firm") as any).clientsOfFirm.concat(await HmTopic.find(1)),
    ).rejects.toThrow(AssociationTypeMismatch);
  });

  it("custom named counter cache", async () => {
    const topic = topics("first") as any;
    const before = topic.replies_count as number;
    await topic.approvedReplies.clear();
    expect((await HmTopic.find(topic.id)).replies_count).toBe(before - 1);
  });

  it("clearing updates counter cache", async () => {
    const topic = (await HmTopic.first()) as any;
    const before = topic.replies_count as number;
    await topic.replies.clear();
    expect(((await HmTopic.find(topic.id)) as any).replies_count).toBe(before - 1);
  });

  it("updates counter cache when default scope is given", async () => {
    const topic = (await HmDefaultRejectedTopic.create({ approved: true })) as any;
    await topic.approvedReplies.create({});
    expect(((await HmTopic.find(topic.id)) as any).replies_count).toBe(1);
  });

  it("calling update on id changes the counter cache", async () => {
    const topic = (await HmTopic.order("id ASC").first()) as any;
    const originalCount = (await topic.replies).length;
    expect(topic.replies_count).toBe(originalCount);

    const firstReply = await topic.replies.first();
    await firstReply.update({ parent_id: null });
    expect(((await HmTopic.find(topic.id)) as any).replies_count).toBe(originalCount - 1);

    await firstReply.update({ parent_id: topic.id });
    expect(((await HmTopic.find(topic.id)) as any).replies_count).toBe(originalCount);
  });

  it("calling update changing ids changes the counter cache", async () => {
    const topic1 = (await HmTopic.find(1)) as any;
    const topic2 = (await HmTopic.find(3)) as any;
    const originalCount1 = (await topic1.replies).length;
    const originalCount2 = (await topic2.replies).length;

    const reply1 = await topic1.replies.first();
    const reply2 = await topic2.replies.first();

    await reply1.update({ parent_id: topic2.id });
    expect(((await HmTopic.find(1)) as any).replies_count).toBe(originalCount1 - 1);
    expect(((await HmTopic.find(3)) as any).replies_count).toBe(originalCount2 + 1);

    await reply2.update({ parent_id: topic1.id });
    expect(((await HmTopic.find(1)) as any).replies_count).toBe(originalCount1);
    expect(((await HmTopic.find(3)) as any).replies_count).toBe(originalCount2);
  });

  it("calling update changing ids of inversed association changes the counter cache", async () => {
    const topic1 = (await HmTopic.find(1)) as any;
    const topic2 = (await HmTopic.find(3)) as any;
    const originalCount1 = (await topic1.replies).length;
    const originalCount2 = (await topic2.replies).length;

    const reply1 = await topic1.replies.first();
    await reply1.update({ parent_id: topic2.id });
    expect(((await HmTopic.find(1)) as any).replies_count).toBe(originalCount1 - 1);
    expect(((await HmTopic.find(3)) as any).replies_count).toBe(originalCount2 + 1);

    const reply2 = await topic2.replies.first();
    await reply2.update({ parent_id: topic1.id });
    expect(((await HmTopic.find(1)) as any).replies_count).toBe(originalCount1);
    expect(((await HmTopic.find(3)) as any).replies_count).toBe(originalCount2);
  });

  it("deleting a collection", async () => {
    await forceSignal37ToLoadAllClientsOfFirm(companies);

    expect((companies("first_firm") as any).clientsOfFirm.loaded).toBeTruthy();

    await (companies("first_firm") as any).clientsOfFirm.create({ name: "Another Client" });
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(3);
    const clientsOfFirm = await (companies("first_firm") as any).clientsOfFirm.toArray();
    await (companies("first_firm") as any).clientsOfFirm.delete([
      clientsOfFirm[0],
      clientsOfFirm[1],
      clientsOfFirm[2],
    ]);
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(0);
    await (companies("first_firm") as any).clientsOfFirm.reload();
    expect(await (companies("first_firm") as any).clientsOfFirm.size()).toBe(0);
  });

  it("clearing without initial access", async () => {
    const firm = companies("first_firm") as any;

    await firm.clientsOfFirm.clear();

    expect(await firm.clientsOfFirm.size()).toBe(0);
    await firm.clientsOfFirm.reload();
    expect(await firm.clientsOfFirm.size()).toBe(0);
  });

  it("restrict with exception", async () => {
    const firm = (await RestrictedWithExceptionFirm.create({ name: "restrict" })) as any;
    await firm.companies.create({ name: "child" });
    expect(await firm.companies.isEmpty()).toBe(false);
    await expect(firm.destroy()).rejects.toThrow(DeleteRestrictionError);
    expect(await RestrictedWithExceptionFirm.exists({ name: "restrict" })).toBe(true);
    expect(await firm.companies.exists({ name: "child" })).toBe(true);
  });
});

describe("HasManyAssociationsTest", () => {
  const { cars, posts } = fixtures(["cars", "topics", "ships", "treasures", "posts", "comments"]);
  setup();

  beforeAll(() => {
    registerModel(HmCar);
    registerModel(HmEngine);
    registerModel(HmShip);
    registerModel(HmTreasure);
    registerModel(HmTopic);
    registerModel(HmReply);
    registerModel(HmPost);
    registerModel(Comment);
    HmTopic.inheritanceColumn = "type";
    registerSubclass(HmReply);
  });

  it("has many without counter cache option", async () => {
    const ship = (await HmShip.create({ name: "Countless", treasures_count: 10 })) as any;
    const assoc = (HmShip as any)._reflectOnAssociation("treasures");
    expect(assoc).toBeDefined();
    expect(assoc.options.counterCache).toBeUndefined();
    expect(await ship.treasures.size()).toBe(0);
    const countBefore = (await HmShip.find(ship.id)).treasures_count;
    await ship.treasures.create({ name: "Gold" });
    expect((await HmShip.find(ship.id)).treasures_count).toBe(countBefore);
    await ship.treasures.destroyAll();
    expect((await HmShip.find(ship.id)).treasures_count).toBe(countBefore);
  });

  it("counter cache updates in memory after create", async () => {
    const topic = (await HmTopic.create({ title: "Zoom-zoom-zoom" })) as any;
    await topic.replies.create({ title: "re: zoom", content: "speedy quick!" });
    expect(topic.readAttribute("replies_count")).toBe(1);
    expect(await topic.replies.size()).toBe(1);
    expect(((await HmTopic.find(topic.id)) as any).readAttribute("replies_count")).toBe(1);
  });

  it("counter cache updates in memory after concat", async () => {
    const topic = (await HmTopic.create({ title: "Zoom-zoom-zoom" })) as any;
    await topic.replies.push(await HmReply.create({ title: "re: zoom", content: "speedy quick!" }));
    expect(topic.replies_count).toBe(1);
    expect(await topic.replies.size()).toBe(1);
    expect(await ((await HmTopic.find(topic.id)) as any).replies.size()).toBe(1);
  });

  it("counter cache updates in memory after create with array", async () => {
    const topic = (await HmTopic.create({ title: "Zoom-zoom-zoom" })) as any;
    await topic.replies.create([
      { title: "re: zoom", content: "speedy quick!" },
      { title: "re: zoom 2", content: "OMG lol!" },
    ]);
    expect(topic.replies_count).toBe(2);
    expect(await topic.replies.size()).toBe(2);
    expect(await ((await HmTopic.find(topic.id)) as any).replies.size()).toBe(2);
  });

  it("counter cache updates in memory after update with inverse of disabled", async () => {
    const topic = (await HmTopic.create({ title: "Zoom-zoom-zoom" })) as any;
    expect(topic.replies_count).toBe(0);

    const reply1 = await HmReply.create({ title: "re: zoom", content: "speedy quick!" });
    const reply2 = await HmReply.create({ title: "re: zoom 2", content: "OMG lol!" });

    await assertQueriesCount(6, false, async () => {
      await topic.replies.push(reply1, reply2);
    });

    expect(topic.replies_count).toBe(2);
    expect(((await HmTopic.find(topic.id)) as any).replies_count).toBe(2);
  });

  it("counter cache on unloaded association", async () => {
    const car = (await HmCar.create({ name: "My AppliCar" })) as any;
    expect(await car.engines.size()).toBe(0);
  });

  it("clearing updates counter cache when inverse counter cache is a symbol with dependent destroy", async () => {
    const car = (await HmCar.first()) as any;
    await car.engines.create({});
    const before = ((await HmCar.find(car.id)) as any).engines_count as number;
    await car.engines.clear();
    expect(((await HmCar.find(car.id)) as any).engines_count).toBe(before - 1);
  });

  it("pushing association updates counter cache", async () => {
    const topic = (await HmTopic.create({ title: "PushTest" })) as any;
    const reply = new HmReply({ title: "r" }) as any;
    await topic.replies.push(reply);
    const reloaded = (await HmTopic.find(topic.id)) as any;
    expect(reloaded.replies_count).toBe(1);
  });

  it("calling empty with counter cache", async () => {
    const post = posts("welcome") as any;
    await assertNoQueries(false, async () => {
      expect(await post.comments.isEmpty()).toBe(false);
    });
  });
});

describe("HasManyAssociationsTest", () => {
  fixtures([]);
  setup();

  it("deleting composite-key records scopes by tuple, not cartesian product", async () => {
    registerModel([CpkOrder, CpkBook]);
    const order = await CpkOrder.create({ shop_id: 1, status: "open" });
    const shopId = (order as any).shop_id;
    const orderId = (order as any).id_value;
    const mk = (authorId: number, id: number) =>
      CpkBook.create({
        id: [authorId, id],
        shop_id: shopId,
        order_id: orderId,
        title: `b${authorId}-${id}`,
      });
    const b1 = await mk(1, 10);
    const b2 = await mk(2, 20);
    await mk(1, 20);
    await mk(2, 10);

    await (order as any).association("books").delete(b1, b2);

    const survivor1 = await CpkBook.findBy({ author_id: 1, id: 20 });
    const survivor2 = await CpkBook.findBy({ author_id: 2, id: 10 });
    expect((survivor1 as any).order_id).toBe(Number(orderId));
    expect((survivor2 as any).order_id).toBe(Number(orderId));
    const deleted1 = await CpkBook.findBy({ author_id: 1, id: 10 });
    const deleted2 = await CpkBook.findBy({ author_id: 2, id: 20 });
    expect((deleted1 as any).order_id).toBeNull();
    expect((deleted2 as any).order_id).toBeNull();
  });
});

describe("HasManyAssociationsTest", () => {
  const { cpkAuthors, shardedBlogPosts } = fixtures([
    "cpkAuthors",
    "cpkBooks",
    "shardedBlogs",
    "shardedBlogPosts",
    "shardedComments",
  ]);
  setup();

  beforeAll(async () => {
    const cpk = await import("../test-helpers/models/cpk.js");
    registerModel("CpkAuthor", cpk.CpkAuthor);
    registerModel("CpkBook", cpk.CpkBook);
    const sharded = await import("../test-helpers/models/sharded.js");
    registerModel("ShardedBlog", sharded.ShardedBlog);
    registerModel("ShardedBlogPost", sharded.ShardedBlogPost);
    registerModel("ShardedComment", sharded.ShardedComment);
  });

  it("deleting models with composite keys", async () => {
    const greatAuthor = cpkAuthors("cpk_great_author") as any;
    const books = await greatAuthor.books;

    expect(books.length).toBe(2);

    await greatAuthor.books.delete(books[0]);
    await greatAuthor.reload();

    expect(await greatAuthor.books.size()).toBe(1);
  });

  it("sharded deleting models", async () => {
    const blogPost = shardedBlogPosts("great_post_blog_one") as any;
    const comments = await blogPost.deleteComments;

    expect(comments.length).toBe(3);

    const commentsToDelete = [comments[0], comments[1]];

    const sqls = await captureSql(async () => {
      await blogPost.deleteComments.delete(commentsToDelete);
    });

    const col = (name: string) => `["\`]?sharded_comments["\`]?\\.["\`]?${name}["\`]?`;
    const queryConstraints = `${col("blog_id")} = .* AND ${col("id")} = .*`;
    const expectation = new RegExp(
      `DELETE.*WHERE.* \\(${queryConstraints} OR ${queryConstraints}\\)`,
      "i",
    );
    const deleteSql = sqls.find((s) => /DELETE/i.test(s));
    expect(deleteSql).toBeDefined();
    expect(deleteSql).toMatch(expectation);

    await blogPost.reload();

    expect(await blogPost.comments.size()).toBe(1);
  });
});

describe("HasManyAssociationsTest", () => {
  const { categories } = fixtures(["categories", "categorizations"]);
  setup();

  beforeAll(() => {
    registerModel(Category);
    registerModel(Categorization);
  });

  it("counter cache updates in memory after update with inverse of enabled", async () => {
    const category = (await Category.create({ name: "Counter Cache" })) as any;
    expect(category.categorizations_count).toBeNull();

    const categorization1 = await Categorization.create({});
    const categorization2 = await Categorization.create({});

    await assertQueriesCount(6, false, async () => {
      await category.categorizations.push(categorization1, categorization2);
    });

    expect(category.categorizations_count).toBe(2);
    expect(((await Category.find(category.id)) as any).categorizations_count).toBe(2);
  });

  it("destroy all on desynced counter cache association", async () => {
    const category = categories("general") as any;
    expect(await category.categorizations.count()).toBeGreaterThan(0);

    await category.categorizations.destroyAll();
    expect(await category.categorizations.count()).toBe(0);
  });
});

describe("HasManyAssociationsTest", () => {
  fixtures({
    user_comments_counts: [UserCommentsCount, {}],
    post_comments_counts: [PostCommentsCount, {}],
    comment_overlapping_counter_caches: [CommentOverlappingCounterCache, {}],
  });
  setup();

  beforeAll(() => {
    registerModel(CommentOverlappingCounterCache);
    registerModel(UserCommentsCount);
    registerModel(PostCommentsCount);
  });

  it("counter cache updates in memory after create with overlapping counter cache columns", async () => {
    const user = (await UserCommentsCount.create({})) as any;
    const post = (await PostCommentsCount.create({})) as any;

    const before1 = user.comments_count;
    const postBefore1 = post.comments_count;
    await post.comments.push(
      await CommentOverlappingCounterCache.create({ userCommentsCount: user }),
    );
    expect(user.comments_count).toBe(before1 + 1);
    expect(post.comments_count).toBe(postBefore1);

    const before2 = user.comments_count;
    const postBefore2 = post.comments_count;
    await user.comments.push(
      await CommentOverlappingCounterCache.create({ postCommentsCount: post }),
    );
    expect(user.comments_count).toBe(before2 + 1);
    expect(post.comments_count).toBe(postBefore2);
  });
});

async function forceSignal37ToLoadAllClientsOfFirm(
  companies: (name: string) => unknown,
): Promise<unknown> {
  return await (companies("first_firm") as any).clientsOfFirm.loadTarget();
}

describe("HasManyAssociationsTest", () => {
  const { companies, accounts } = fixtures(["companies", "accounts"]);
  setup();

  it("dependent association respects optional sanitized conditions on delete", async () => {
    const firm = companies("odegy") as any;
    await Client.create({ client_of: firm.id, name: "BigShot Inc." });
    await Client.create({ client_of: firm.id, name: "SmallTime Inc." });
    expect(await Client.where({ client_of: firm.id }).size()).toBe(2);
    expect(await firm.dependentSanitizedConditionalClientsOfFirm.size()).toBe(1);
    await firm.destroy();
    expect(await Client.where({ client_of: firm.id }).size()).toBe(1);
  });

  it("dependent association respects optional hash conditions on delete", async () => {
    const firm = companies("odegy") as any;
    await Client.create({ client_of: firm.id, name: "BigShot Inc." });
    await Client.create({ client_of: firm.id, name: "SmallTime Inc." });
    expect(await Client.where({ client_of: firm.id }).size()).toBe(2);
    expect(await firm.dependentHashConditionalClientsOfFirm.size()).toBe(1);
    await firm.destroy();
    expect(await Client.where({ client_of: firm.id }).size()).toBe(1);
  });

  it("delete all association with primary key deletes correct records", async () => {
    let firm = (await HmFirm.first()) as any;
    expect(await firm.clients.count()).toBe(3);
    await (await firm.clients.first()).updateColumns({ firm_id: null });
    expect(await (await firm.clients.reload()).count()).toBe(2);
    expect(await firm.clientsUsingPrimaryKeyWithDeleteAll.count()).toBe(2);
    const oldRecord = await firm.clientsUsingPrimaryKeyWithDeleteAll.first();
    firm = (await HmFirm.first()) as any;
    await firm.destroy();
    expect(await Client.findBy({ id: oldRecord.id })).toBeNull();
  });

  it("depends and nullify", async () => {
    const numAccounts = await Account.count();

    const core = companies("rails_core") as any;
    expect(await core.account).toEqual(accounts("rails_core_account"));
    const byId = (a: any, b: any) => a.id - b.id;
    expect(((await core.companies.toArray()) as any[]).sort(byId)).toEqual(
      [companies("leetsoft"), companies("jadedpixel")].sort(byId),
    );
    await core.destroy();
    expect(((await accounts("rails_core_account").reload()) as any).firm_id).toBeNull();
    expect(((await companies("leetsoft").reload()) as any).client_of).toBeNull();
    expect(((await companies("jadedpixel").reload()) as any).client_of).toBeNull();

    expect(await Account.count()).toBe(numAccounts);
  });

  it("get ids for loaded associations", async () => {
    const company = companies("first_firm") as any;
    await company.clients.reload();
    await assertNoQueries(false, async () => {
      await company.clientIds;
      await company.clientIds;
    });
  });

  it("get ids for unloaded associations does not load them", async () => {
    const company = companies("first_firm") as any;
    expect(company.clients.loaded).toBeFalsy();
    expect(await company.clientIds).toEqual([
      companies("first_client").id,
      companies("second_client").id,
      companies("another_first_firm_client").id,
    ]);
    expect(company.clients.loaded).toBeFalsy();
  });

  it("creating using primary key", async () => {
    const firm = (await HmFirm.first()) as any;
    const client = await firm.clientsUsingPrimaryKey.createBang({ name: "test" });
    expect(client.firm_name).toBe(firm.name);
  });
});

describe("HasManyAssociationsTest", () => {
  const { posts, readers, authors, comments } = fixtures([
    "posts",
    "readers",
    "people",
    "authors",
    "comments",
  ]);

  it("get ids ignores include option", async () => {
    expect(await (posts("welcome") as any).readersWithPersonIds).toEqual([
      readers("michael_welcome").id,
    ]);
  });

  it("get ids for through", async () => {
    expect(await (authors("mary") as any).commentIds).toEqual([
      comments("eager_other_comment1").id,
    ]);
  });
});
