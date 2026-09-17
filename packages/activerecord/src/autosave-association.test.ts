import { indexNestedAttributeErrors, setIndexNestedAttributeErrors } from "./active-record.js";
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { SingularAssociation } from "./associations/singular-association.js";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { I18n, Error as ModelError } from "@blazetrails/activemodel";
import { Base, registerModel, RecordInvalid } from "./index.js";
import { Associations, collectionProxyFor as association } from "./associations.js";

import {
  Agency,
  Company as CanonicalCompany,
  Firm,
  Client,
  NewlyContractedCompany,
} from "./test-helpers/models/company.js";
import { Reply, SillyUniqueReply } from "./test-helpers/models/reply.js";
import { Topic } from "./test-helpers/models/topic.js";
import { Contract, NewContract } from "./test-helpers/models/contract.js";
import { Project } from "./test-helpers/models/project.js";
import { Account } from "./test-helpers/models/account.js";
import { FamousPirate, Pirate as CanonicalPirate } from "./test-helpers/models/pirate.js";
import {
  FamousShip,
  Prisoner,
  Ship as CanonicalShip,
  ShipWithoutNestedAttributes,
} from "./test-helpers/models/ship.js";
import { AuditLog, Developer } from "./test-helpers/models/developer.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";
import { Mouse } from "./test-helpers/models/mouse.js";
import { Translation } from "./test-helpers/models/translation.js";
import { Attachment } from "./test-helpers/models/attachment.js";
import { Book, PublishedBook } from "./test-helpers/models/book.js";
import { Organization } from "./test-helpers/models/organization.js";
import { Member } from "./test-helpers/models/member.js";
import { MemberDetail } from "./test-helpers/models/member-detail.js";
import { CakeDesigner } from "./test-helpers/models/cake-designer.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { PriceEstimate } from "./test-helpers/models/price-estimate.js";
import { Author } from "./test-helpers/models/author.js";
import { Molecule } from "./test-helpers/models/molecule.js";
import { Electron } from "./test-helpers/models/electron.js";
import { Guitar } from "./test-helpers/models/guitar.js";
import { TuningPeg } from "./test-helpers/models/tuning-peg.js";
import { Squeak } from "./test-helpers/models/squeak.js";
import {
  CpkBook,
  CpkOrder,
  CpkOrderAgreement,
  CpkOrderWithPrimaryKeyAssociatedBook,
} from "./test-helpers/models/cpk.js";
import { ShipPart } from "./test-helpers/models/ship-part.js";
import { Parrot as CanonicalParrot } from "./test-helpers/models/parrot.js";
import { Bird as CanonicalBird } from "./test-helpers/models/bird.js";
import { Eye, Iris, IrisWithReadOnlyForeignKey } from "./test-helpers/models/eye.js";
import { Comment as CanonicalComment } from "./test-helpers/models/comment.js";
import { Category as CanonicalCategory } from "./test-helpers/models/category.js";
import {
  FirstPost,
  Post as CanonicalPost,
  PostWithAfterCreateCallback,
} from "./test-helpers/models/post.js";
import { Customer as CanonicalCustomer } from "./test-helpers/models/customer.js";
import { Order as CanonicalOrder } from "./test-helpers/models/order.js";
import { Invoice } from "./test-helpers/models/invoice.js";
import { LineItem } from "./test-helpers/models/line-item.js";
import { computePrimaryKey, addAutosaveAssociationCallbacks } from "./autosave-association.js";
import { fixtures } from "./test-fixtures.js";
import { assertNoQueries, assertQueriesCount } from "./testing/query-assertions.js";
import { DrinkDesigner } from "./test-helpers/models/drink-designer.js";
import { Chef, ChefWithPolymorphicInverseOf } from "./test-helpers/models/chef.js";
import {
  assert,
  assertEmpty,
  assertNot,
  assertNotEmpty,
  assertNoDifference,
  assertNotPredicate,
  assertNothingRaised,
  assertDifference,
  assertRaise,
  assertRaises,
  assertPredicate,
  assertRespondTo,
  assertNotRespondTo,
  deepDup,
  getCallbackChains,
  humanize,
  isPresent,
} from "@blazetrails/activesupport";
import { resetI18n } from "./test-helpers/i18n.js";

function setAssociationTarget(record: Base, name: string, value: unknown) {
  const association = record.association(name) as any;
  if (typeof association.isUpdated === "function") association.writer(value as any);
  else association.setTarget(value as any);
}

function cacheAssoc(record: Base, name: string, value: unknown) {
  setAssociationTarget(record, name, value);
}

fixtures([], { useTransactionalTests: false });

describe("TestDestroyAsPartOfAutosaveAssociation", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
    registerModel(Developer);
    registerModel(CanonicalBird);
    registerModel(ShipPart);
    registerModel(CanonicalParrot);
    registerModel(Treasure);
    registerModel(PriceEstimate);
    registerModel(CpkOrder);
    registerModel(CpkBook);
  });

  let pirate: any;
  let ship: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    ship = await pirate.createShip({ name: "Nights Dirty Lightning" });
  });

  afterEach(async () => {
    await CanonicalBird.deleteAll();
    await CanonicalParrot.deleteAll();
    await ship.delete();
    await pirate.delete();
    await CpkBook.deleteAll();
    await CpkOrder.deleteAll();
  });

  it("a marked for destruction record should not be be marked after reload", async () => {
    pirate.markForDestruction();
    (await pirate.ship).markForDestruction();

    assertNotPredicate(await pirate.reload(), (r: any) => r.markedForDestruction());
    assertNotPredicate(await (await pirate.ship).reload(), (r: any) => r.markedForDestruction());
  });

  it("should destroy a child association as part of the save transaction if it was marked for destruction", async () => {
    assertNotPredicate(await pirate.ship, (r: any) => r.markedForDestruction());

    (await pirate.ship).markForDestruction();
    const id = (await pirate.ship).id;

    assertPredicate(await pirate.ship, (r: any) => r.markedForDestruction());
    assert(await CanonicalShip.findBy({ id }));

    await pirate.save();
    expect(await (await pirate.reload()).ship).toBeNull();
    expect(await CanonicalShip.findBy({ id })).toBeNull();
  });

  it("should skip validation on a child association if marked for destruction", async () => {
    (await pirate.ship).name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);

    (await pirate.ship).markForDestruction();
    const isValid = vi.spyOn(await pirate.ship, "isValid");
    await assertDifference(
      async () => Number(await CanonicalShip.count()),
      -1,
      null,
      async () => {
        await pirate.saveBang();
      },
    );
    expect(isValid).not.toHaveBeenCalled();
  });

  it("a child marked for destruction should not be destroyed twice", async () => {
    (await pirate.ship).markForDestruction();
    assert(await pirate.save());
    (await pirate.ship).destroy = () => {
      throw new Error("Should not be called");
    };
    assert(await pirate.save());
  });

  it("should rollback destructions if an exception occurred while saving a child", async () => {
    const child = await pirate.ship;
    const save = child.save.bind(child);
    child.save = async (options?: any) => {
      await save(options);
      await child.destroy();
      throw new Error("Oh noes!");
    };

    (await ship.pirate).catchphrase = "Changed Catchphrase";
    ship.nameWillChange();

    await assertRaise([Error], {}, async () => assertNot(await pirate.save()));
    expect(await (await pirate.reload()).ship).not.toBeNull();
  });

  it("should save changed has one changed object if child is saved", async () => {
    (await pirate.ship).name = "NewName";
    assert(await pirate.save());
    expect((await (await pirate.ship).reload()).name).toEqual("NewName");
  });

  it("should not save changed has one unchanged object if child is saved", async () => {
    const save = vi.spyOn(await pirate.ship, "save");
    assert(await pirate.save());
    expect(save).not.toHaveBeenCalled();
  });

  it("should destroy a parent association as part of the save transaction if it was marked for destruction", async () => {
    assertNotPredicate(await ship.pirate, (r: any) => r.markedForDestruction());

    (await ship.pirate).markForDestruction();
    const id = (await ship.pirate).id;

    assertPredicate(await ship.pirate, (r: any) => r.markedForDestruction());
    assert(await CanonicalPirate.findBy({ id }));

    await ship.save();
    expect(await (await ship.reload()).pirate).toBeNull();
    expect(await CanonicalPirate.findBy({ id })).toBeNull();
  });

  it("autosave cpk association should destroy parent association when marked for destruction", async () => {
    const book = new CpkBook({ title: "Book", id: [1, 2] }) as any;
    await CpkOrder.createBang({ id: [3, 4], book });

    (await book.order).markForDestruction();

    assert(await book.save());
    expect(await (await book.reload()).order).toBeNull();
    expect(await CpkOrder.findBy({ id: 4, shop_id: 3 })).toBeNull();
  });

  it("should skip validation on a parent association if marked for destruction", async () => {
    (await ship.pirate).catchphrase = "";
    assertNotPredicate(await ship.isValid(), (v) => v);

    (await ship.pirate).markForDestruction();
    const isValid = vi.spyOn(await ship.pirate, "isValid");
    await assertDifference(
      async () => Number(await CanonicalPirate.count()),
      -1,
      null,
      async () => {
        await ship.saveBang();
      },
    );
    expect(isValid).not.toHaveBeenCalled();
  });

  it("a parent marked for destruction should not be destroyed twice", async () => {
    (await ship.pirate).markForDestruction();
    assert(await ship.save());
    Object.assign((await ship.pirate) ?? {}, {
      destroy() {
        throw new Error("Should not be called");
      },
    });
    assert(await ship.save());
  });

  it("should rollback destructions if an exception occurred while saving a parent", async () => {
    const parent = await ship.pirate;
    const save = parent.save.bind(parent);
    parent.save = async (options?: any) => {
      await save(options);
      await parent.destroy();
      throw new Error("Oh noes!");
    };

    (await ship.pirate).catchphrase = "Changed Catchphrase";

    await assertRaise([Error], {}, async () => assertNot(await ship.save()));
    expect(await (await ship.reload()).pirate).not.toBeNull();
  });

  it("should save changed child objects if parent is saved", async () => {
    pirate = await ship.createPirate({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const parrot = await pirate.parrots.createBang({ name: "Posideons Killer" });
    parrot.name = "NewName";
    await ship.save();

    expect((await parrot.reload()).name).toEqual("NewName");
  });

  it("should destroy has many as part of the save transaction if they were marked for destruction", async () => {
    for (let i = 0; i < 2; i++) await pirate.birds.createBang({ name: `birds_${i}` });

    assertNot((await pirate.birds).some((b: any) => b.markedForDestruction()));

    for (const bird of await pirate.birds) bird.markForDestruction();
    const klass = (await pirate.birds.first()).constructor;
    const ids = (await pirate.birds).map((b: any) => b.id);

    assert((await pirate.birds).every((b: any) => b.markedForDestruction()));
    for (const id of ids) assert(await klass.findBy({ id }));

    await pirate.save();
    assertEmpty(await (await pirate.reload()).birds);
    for (const id of ids) expect(await klass.findBy({ id })).toBeNull();
  });

  it("should not resave destroyed association", async () => {
    await pirate.birds.createBang({ name: "parrot" });
    await (await pirate.birds.first()).destroy();
    await pirate.saveBang();
    assertEmpty(await (await pirate.reload()).birds);
  });

  it("should skip validation on has many if marked for destruction", async () => {
    for (let i = 0; i < 2; i++) await pirate.birds.createBang({ name: `birds_${i}` });

    for (const bird of await pirate.birds) bird.name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);

    for (const bird of await pirate.birds) bird.markForDestruction();

    const firstIsValid = vi.spyOn(await pirate.birds.first(), "isValid");
    const lastIsValid = vi.spyOn(await pirate.birds.last(), "isValid");
    await assertDifference(
      async () => Number(await CanonicalBird.count()),
      -2,
      null,
      async () => {
        await pirate.saveBang();
      },
    );
    expect(lastIsValid).not.toHaveBeenCalled();
    expect(firstIsValid).not.toHaveBeenCalled();
  });

  it("should skip validation on has many if destroyed", async () => {
    await pirate.birds.createBang({ name: "birds_1" });

    for (const bird of await pirate.birds) bird.name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);

    for (const bird of await pirate.birds) await bird.destroy();
    assertPredicate(await pirate.isValid(), (v) => v);
  });

  it("a child marked for destruction should not be destroyed twice while saving has many", async () => {
    await pirate.birds.createBang({ name: "birds_1" });

    for (const bird of await pirate.birds) bird.markForDestruction();
    assert(await pirate.save());

    for (const bird of await pirate.birds) {
      const destroy = vi.spyOn(bird, "destroy");
      assert(await pirate.save());
      expect(destroy).not.toHaveBeenCalled();
    }
  });

  it("should rollback destructions if an exception occurred while saving has many", async () => {
    for (let i = 0; i < 2; i++) await pirate.birds.createBang({ name: `birds_${i}` });
    const before = (await pirate.birds).map((c: any) => {
      c.markForDestruction();
      return c;
    });

    const last = before[before.length - 1];
    const destroy = last.destroy.bind(last);
    last.destroy = async (...args: unknown[]) => {
      await destroy(...args);
      throw new Error("Oh noes!");
    };

    await assertRaise([Error], {}, async () => assertNot(await pirate.save()));
    expect((await (await pirate.reload()).birds).map((b: any) => b.id)).toEqual(
      before.map((b: any) => b.id),
    );
  });

  it("when new record a child marked for destruction should not affect other records from saving", async () => {
    pirate = ship.buildPirate({ catchphrase: "Arr' now I shall keep me eye on you matey!" });

    for (let i = 0; i < 3; i++) pirate.birds.build({ name: `birds_${i}` });
    (await pirate.birds)[1].markForDestruction();
    await pirate.saveBang();

    expect(await (await pirate.birds.reload()).length()).toEqual(2);
  });

  it("should save new record that has same value as existing record marked for destruction on field that has unique index", async () => {
    await (await CanonicalBird.leaseConnection()).addIndex("birds", "name", { unique: true });
    try {
      for (let i = 0; i < 3; i++) await pirate.birds.create({ name: `unique_birds_${i}` });

      (await pirate.birds)[0].markForDestruction();
      pirate.birds.build({ name: (await pirate.birds)[0].name });
      await pirate.saveBang();

      expect(await (await pirate.birds.reload()).length()).toEqual(3);
    } finally {
      await (await CanonicalBird.leaseConnection()).removeIndex("birds", { column: "name" });
    }
  });

  it("should run add callback methods for has many", async () => {
    const associationNameWithCallbacks = "birdsWithMethodCallbacks";

    const pirate = new CanonicalPirate({ catchphrase: "Arr" }) as any;
    pirate[associationNameWithCallbacks].build({ name: "Crowe the One-Eyed" });

    const expected = ["before_adding_method_bird_<new>", "after_adding_method_bird_<new>"];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should run remove callback methods for has many", async () => {
    const associationNameWithCallbacks = "birdsWithMethodCallbacks";

    await pirate[associationNameWithCallbacks].createBang({ name: "Crowe the One-Eyed" });
    for (const child of await pirate[associationNameWithCallbacks]) child.markForDestruction();
    const childId = (await pirate[associationNameWithCallbacks].first()).id;

    pirate.shipLog.splice(0);
    await pirate.save();

    const expected = [
      `before_removing_method_bird_${childId}`,
      `after_removing_method_bird_${childId}`,
    ];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should run add callback procs for has many", async () => {
    const associationNameWithCallbacks = "birdsWithProcCallbacks";

    const pirate = new CanonicalPirate({ catchphrase: "Arr" }) as any;
    pirate[associationNameWithCallbacks].build({ name: "Crowe the One-Eyed" });

    const expected = ["before_adding_proc_bird_<new>", "after_adding_proc_bird_<new>"];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should run remove callback procs for has many", async () => {
    const associationNameWithCallbacks = "birdsWithProcCallbacks";

    await pirate[associationNameWithCallbacks].createBang({ name: "Crowe the One-Eyed" });
    for (const child of await pirate[associationNameWithCallbacks]) child.markForDestruction();
    const childId = (await pirate[associationNameWithCallbacks].first()).id;

    pirate.shipLog.splice(0);
    await pirate.save();

    const expected = [
      `before_removing_proc_bird_${childId}`,
      `after_removing_proc_bird_${childId}`,
    ];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should destroy habtm as part of the save transaction if they were marked for destruction", async () => {
    for (let i = 0; i < 2; i++) await pirate.parrots.createBang({ name: `parrots_${i}` });

    assertNot((await pirate.parrots).some((p: any) => p.markedForDestruction()));
    for (const parrot of await pirate.parrots) parrot.markForDestruction();

    await assertNoDifference(
      async () => Number(await CanonicalParrot.count()),
      null,
      async () => {
        await pirate.save();
      },
    );

    assertEmpty(await (await pirate.reload()).parrots);

    const joinRecords = await (
      await CanonicalPirate.leaseConnection()
    ).selectAll(`SELECT * FROM parrots_pirates WHERE pirate_id = ${pirate.id}`);
    assertEmpty(joinRecords);
  });

  it("should skip validation on habtm if marked for destruction", async () => {
    for (let i = 0; i < 2; i++) await pirate.parrots.createBang({ name: `parrots_${i}` });

    for (const parrot of await pirate.parrots) parrot.name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);

    for (const parrot of await pirate.parrots) parrot.markForDestruction();

    const firstIsValid = vi.spyOn(await pirate.parrots.first(), "isValid");
    const lastIsValid = vi.spyOn(await pirate.parrots.last(), "isValid");
    await pirate.saveBang();
    expect(lastIsValid).not.toHaveBeenCalled();
    expect(firstIsValid).not.toHaveBeenCalled();

    assertEmpty(await (await pirate.reload()).parrots);
  });

  it("should skip validation on habtm if destroyed", async () => {
    await pirate.parrots.createBang({ name: "parrots_1" });

    for (const parrot of await pirate.parrots) parrot.name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);

    for (const parrot of await pirate.parrots) await parrot.destroy();
    assertPredicate(await pirate.isValid(), (v) => v);
  });

  it("should be valid on habtm if persisted and unchanged", async () => {
    const parrot = await pirate.parrots.createBang({ name: "parrots_1" });
    await parrot.updateColumn("name", "");
    await parrot.reload();
    assertNotPredicate(await parrot.isValid(), (v) => v);

    const newPirate = new CanonicalPirate({ catchphrase: "Arr" }) as any;
    await newPirate.parrots.replace(await pirate.parrots);
    await newPirate.saveBang();
  });

  it("should be invalid on habtm when any record in the association chain is invalid and was changed", async () => {
    const treasure = await pirate.treasures.createBang({ name: "gold" });
    const estimate = await treasure.priceEstimates.createBang({ price: 1 });
    await estimate.updateColumns({ price: "not a number" });

    assertNotPredicate(await estimate.isValid(), (v) => v);

    const treasures = await pirate.treasures.eagerLoad("priceEstimates").toArray();
    (await treasures[0].priceEstimates.first()).price = "not a price";
    const newPirate = new CanonicalPirate({ catchphrase: "Arr", treasures });

    await assertRaises([RecordInvalid], {}, () => newPirate.saveBang());
    expect(newPirate.errors.fullMessages).toEqual(["Treasures is invalid"]);
  });

  it("should be invalid on habtm when any record in the association chain is invalid and was changed with autosave", async () => {
    const superPirate = class extends CanonicalPirate {
      static {
        this.tableName = "pirates";
        this.hasMany("greatTreasures", {
          className: "Treasure",
          foreignKey: "looter_id",
          autosave: true,
        });
      }
    };
    Object.defineProperty(superPirate, "name", { value: "SuperPirate" });

    pirate = await superPirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const treasure = await pirate.greatTreasures.createBang({ name: "gold" });
    const estimate = await treasure.priceEstimates.createBang({ price: 1 });
    await estimate.updateColumns({ price: "not a number" });

    assertNotPredicate(await estimate.isValid(), (v) => v);

    const treasures = await pirate.greatTreasures.eagerLoad("priceEstimates").toArray();
    (await treasures[0].priceEstimates.first()).price = "not a price";
    const newPirate = new superPirate({ catchphrase: "Arr", greatTreasures: treasures });

    await assertRaises([RecordInvalid], {}, () => newPirate.saveBang());
    expect(newPirate.errors.fullMessages).toEqual([
      "Great treasures price estimates price is not a number",
    ]);
  });

  it("should be valid on habtm when any record in the association chain is invalid but was not changed", async () => {
    const treasure = await pirate.treasures.createBang({ name: "gold" });
    const estimate = await treasure.priceEstimates.createBang({ price: 1 });
    await estimate.updateColumns({ price: "not a number" });

    assertNotPredicate(await estimate.isValid(), (v) => v);

    const treasures = await pirate.treasures.eagerLoad("priceEstimates").toArray();
    const newPirate = new CanonicalPirate({ catchphrase: "Arr", treasures });

    await assertNothingRaised(() => newPirate.saveBang());
  });

  it("a child marked for destruction should not be destroyed twice while saving habtm", async () => {
    await pirate.parrots.createBang({ name: "parrots_1" });

    for (const parrot of await pirate.parrots) parrot.markForDestruction();
    assert(await pirate.save());

    await CanonicalPirate.transaction(async () => {
      await assertNoQueries(false, async () => {
        assert(await pirate.save());
      });
    });
  });

  it("should rollback destructions if an exception occurred while saving habtm", async () => {
    for (let i = 0; i < 2; i++) await pirate.parrots.createBang({ name: `parrots_${i}` });
    const before = (await pirate.parrots).map((c: any) => {
      c.markForDestruction();
      return c;
    });

    const assoc = pirate.association("parrots");
    const destroy = assoc.destroy.bind(assoc);
    assoc.destroy = async (...args: unknown[]) => {
      await destroy(...args);
      throw new Error("Oh noes!");
    };

    await assertRaise([Error], {}, async () => assertNot(await pirate.save()));
    expect((await (await pirate.reload()).parrots).map((p: any) => p.id)).toEqual(
      before.map((p: any) => p.id),
    );
  });

  it("should run add callback methods for habtm", async () => {
    const associationNameWithCallbacks = "parrotsWithMethodCallbacks";

    const pirate = CanonicalPirate.new({ catchphrase: "Arr" });
    await association(pirate, associationNameWithCallbacks).build({ name: "Crowe the One-Eyed" });

    const expected = ["before_adding_method_parrot_<new>", "after_adding_method_parrot_<new>"];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should run remove callback methods for habtm", async () => {
    const associationNameWithCallbacks = "parrotsWithMethodCallbacks";

    const pirate = await CanonicalPirate.create({ catchphrase: "Arr" });
    const proxy = association(pirate, associationNameWithCallbacks);
    await proxy.create({ name: "Crowe the One-Eyed" });
    for (const parrot of await proxy) parrot.markForDestruction();
    const childId = (await proxy)[0].id;

    pirate.shipLog.splice(0);
    await pirate.save();

    const expected = [
      `before_removing_method_parrot_${childId}`,
      `after_removing_method_parrot_${childId}`,
    ];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should run add callback procs for habtm", async () => {
    const associationNameWithCallbacks = "parrotsWithProcCallbacks";

    const pirate = CanonicalPirate.new({ catchphrase: "Arr" });
    await association(pirate, associationNameWithCallbacks).build({ name: "Crowe the One-Eyed" });

    const expected = ["before_adding_proc_parrot_<new>", "after_adding_proc_parrot_<new>"];

    expect(pirate.shipLog).toEqual(expected);
  });

  it("should run remove callback procs for habtm", async () => {
    const associationNameWithCallbacks = "parrotsWithProcCallbacks";

    const pirate = await CanonicalPirate.create({ catchphrase: "Arr" });
    const proxy = association(pirate, associationNameWithCallbacks);
    await proxy.create({ name: "Crowe the One-Eyed" });
    for (const parrot of await proxy) parrot.markForDestruction();
    const childId = (await proxy)[0].id;

    pirate.shipLog.splice(0);
    await pirate.save();

    const expected = [
      `before_removing_proc_parrot_${childId}`,
      `after_removing_proc_parrot_${childId}`,
    ];

    expect(pirate.shipLog).toEqual(expected);
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociation", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  const { companies, developers, cpkOrderAgreements, cpkOrders, cpkBooks } = fixtures([
    "companies",
    "developers",
    "cpkOrderAgreements",
    "cpkOrders",
    "cpkBooks",
  ]);
  beforeAll(() => {
    registerModel(CpkOrder);
    registerModel(CpkBook);
    registerModel(CpkOrderAgreement);
    registerModel(CpkOrderWithPrimaryKeyAssociatedBook);
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Client);
    registerModel(NewlyContractedCompany);
    registerModel(NewContract);
    registerModel(Contract);
    registerModel(Developer);
    registerModel(Topic);
    registerModel(Reply);
    registerModel(SillyUniqueReply);
  });

  it("invalid adding", async () => {
    const firm = await Firm.find(1);
    const c = new Client();
    assertNot(await firm.clientsOfFirm.push(c));
    assertNotPredicate(c, (r) => r.isPersisted());
    assertNotPredicate(await firm.isValid(), (v) => v);
    assertNot(await firm.save());
    assertNotPredicate(c, (r) => r.isPersisted());
  });

  it("invalid adding before save", async () => {
    const newFirm = new Firm({ name: "A New Firm, Inc" });
    const c = new Client();
    await newFirm.clientsOfFirm.concat(c, new Client({ name: "Apple" }));
    assertNotPredicate(c, (r) => r.isPersisted());
    assertNotPredicate(await c.isValid(), (v) => v);
    assertNotPredicate(await newFirm.isValid(), (v) => v);
    assertNot(await newFirm.save());
    assertNotPredicate(c, (r) => r.isPersisted());
    assertNotPredicate(newFirm, (r) => r.isPersisted());
  });

  it("adding unsavable association", async () => {
    const newFirm = new Firm({ name: "A New Firm, Inc" });
    const client = newFirm.clients.build({ name: "Apple" });
    client.throwOnSave = true;

    assertPredicate(await client.isValid(), (v) => v);
    assertPredicate(await newFirm.isValid(), (v) => v);
    assertNot(await newFirm.save());
    assertNotPredicate(newFirm, (r) => r.isPersisted());
    assertNotPredicate(client, (r) => r.isPersisted());
  });

  it("invalid adding with validate false", async () => {
    const firm = (await Firm.first())!;
    const client = new Client();
    await firm.unvalidatedClientsOfFirm.push(client);

    assertPredicate(await firm.isValid(), (v) => v);
    assertNotPredicate(await client.isValid(), (v) => v);
    assert(await firm.save());
    assertNotPredicate(client, (r) => r.isPersisted());
  });

  it("valid adding with validate false", async () => {
    const noOfClients = Number(await Client.count());

    const firm = (await Firm.first())!;
    const client = new Client({ name: "Apple" });

    assertPredicate(await firm.isValid(), (v) => v);
    assertPredicate(await client.isValid(), (v) => v);
    assertNotPredicate(client, (r) => r.isPersisted());

    await firm.unvalidatedClientsOfFirm.push(client);

    assert(await firm.save());
    assertPredicate(client, (r) => r.isPersisted());
    expect(Number(await Client.count())).toEqual(noOfClients + 1);
  });

  it("circular autosave does not validate children", async () => {
    const person = class extends Base {
      static {
        this.tableName = "readers";
      }

      shouldBeFunny(this: any) {
        if (this.catch_phrase !== "funny") {
          this.errors.add("base", "not funny");
        }
      }
    };
    person.validate(":shouldBeFunny");
    Object.defineProperty(person, "name", { value: "Reader" });

    person.attribute("catch_phrase", "string");
    person.attribute("reader_id");

    person.hasMany("children", { autosave: true, anonymousClass: person });
    person.belongsTo("parent", { autosave: true, anonymousClass: person });

    const c = new person({ catch_phrase: "boring" }) as any;
    await c.children.push(c);
    c.post_id = 0;
    c.person_id = 0;
    await c.save();

    assertNotPredicate(c, (r: any) => r.isPersisted());
    assertNotPredicate(await c.isValid(), (v) => v);
  });

  it("parent should save children record with foreign key validation set in before save callback", async () => {
    const company = new NewlyContractedCompany({ name: "test" });

    assert(await company.save());
    assertNotEmpty(await (await company.reload()).newContracts);
  });

  it("parent should not get saved with duplicate children records", async () => {
    await assertNoDifference(
      async () => Number(await Reply.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await SillyUniqueReply.count()),
          null,
          async () => {
            const reply = new Reply();
            reply.sillyUniqueReplies.build([
              { content: "Best content" },
              { content: "Best content" },
            ]);

            assertNot(await reply.save());
            expect(reply.errors.get("silly_unique_replies")).toEqual(["is invalid"]);
            assertEmpty((await reply.sillyUniqueReplies.first())!.errors);

            expect((await reply.sillyUniqueReplies.last())!.errors.get("content")).toEqual([
              "has already been taken",
            ]);
          },
        );
      },
    );
  });

  it("invalid build", async () => {
    const newClient = companies("first_firm").clientsOfFirm.build();
    assertNotPredicate(newClient, (r) => r.isPersisted());
    assertNotPredicate(await newClient.isValid(), (v) => v);
    expect(await companies("first_firm").clientsOfFirm.last()).toBe(newClient);
    assertNot(await companies("first_firm").save());
    assertNotPredicate(newClient, (r) => r.isPersisted());
    expect(await (await companies("first_firm").clientsOfFirm.reload()).size()).toEqual(2);
  });

  it("adding before save", async () => {
    const noOfFirms = Number(await Firm.count());
    const noOfClients = Number(await Client.count());

    const newFirm = new Firm({ name: "A New Firm, Inc" });
    const c = new Client({ name: "Apple" });

    await newFirm.clientsOfFirm.push(new Client({ name: "Natural Company" }));
    expect(await newFirm.clientsOfFirm.size()).toEqual(1);
    await newFirm.clientsOfFirm.push(c);
    expect(await newFirm.clientsOfFirm.size()).toEqual(2);

    expect(Number(await Firm.count())).toEqual(noOfFirms);
    expect(Number(await Client.count())).toEqual(noOfClients);
    assert(await newFirm.save());
    assertPredicate(newFirm, (r) => r.isPersisted());
    assertPredicate(c, (r) => r.isPersisted());
    expect((await c.firm)!.equals(newFirm)).toBe(true);
    expect(Number(await Firm.count())).toEqual(noOfFirms + 1);
    expect(Number(await Client.count())).toEqual(noOfClients + 2);

    expect(await newFirm.clientsOfFirm.size()).toEqual(2);
    expect(await (await newFirm.clientsOfFirm.reload()).size()).toEqual(2);
  });

  it("assign ids", async () => {
    const firm = new Firm({ name: "Apple" });
    await (firm as any)
      .association("clients")
      .idsWriter([companies("first_client").id, companies("second_client").id]);
    await firm.save();
    await firm.reload();
    expect((await firm.clients).length).toEqual(2);
    expect((await firm.clients).map((c) => c.id)).toContain(companies("second_client").id);
  });
  it("assign ids with belongs to cpk model", async () => {
    const orderAgreements = [
      cpkOrderAgreements("order_agreement_one").id,
      cpkOrderAgreements("order_agreement_two").id,
    ];
    const order = cpkOrders("cpk_groceries_order_1") as any;

    assertEmpty(await order.orderAgreements);

    await order.association("orderAgreements").idsWriter(orderAgreements);
    await order.save();
    await order.reload();

    expect(await order.orderAgreementIds).toEqual(orderAgreements);
    expect((await order.orderAgreements).length).toEqual(2);
    expect((await order.orderAgreements).map((a: any) => a.id)).toContain(
      cpkOrderAgreements("order_agreement_two").id,
    );
  });
  it("assign ids with cpk for two models", async () => {
    const bookIds = [
      cpkBooks("cpk_great_author_first_book").id,
      cpkBooks("cpk_great_author_second_book").id,
    ];
    const order = cpkOrders("cpk_groceries_order_1") as any;

    assertEmpty(await order.books);

    await order.association("books").idsWriter(bookIds);
    await order.save();
    await order.reload();

    expect(await order.bookIds).toEqual(bookIds);
    expect((await order.books).length).toEqual(2);
    expect((await order.books).map((b: any) => b.id)).toContainEqual(
      cpkBooks("cpk_great_author_first_book").id,
    );
    expect((await order.books).map((b: any) => b.id)).toContainEqual(
      cpkBooks("cpk_great_author_second_book").id,
    );
  });
  it("has one cpk has one autosave with id", async () => {
    const book = await CpkBook.createBang({ id: [1, 3], shop_id: 2 });
    const order = await CpkOrderWithPrimaryKeyAssociatedBook.createBang({ book, shop_id: 2 });

    expect((await (book as any).order).id).toEqual(order.id);
  });
  it("assign ids for through a belongs to", async () => {
    const firm = new Firm({ name: "Apple" });
    await (firm as any)
      .association("developers")
      .idsWriter([developers("david").id, developers("jamis").id]);
    await firm.save();
    await firm.reload();
    expect((await firm.developers).length).toEqual(2);
    expect((await firm.developers).map((d) => d.id)).toContain(developers("david").id);
  });

  it("build before save", async () => {
    const company = companies("first_firm");

    let newClient!: Client;
    await assertQueriesCount(0, false, () => {
      newClient = company.clientsOfFirm.build({ name: "Another Client" });
    });
    assertNotPredicate(company.clientsOfFirm, (p) => p.loaded);

    company.name += "-changed";
    await assertQueriesCount(4, false, async () => {
      assert(await company.save());
    });
    assertPredicate(newClient, (r) => r.isPersisted());
    expect(await (await company.clientsOfFirm.reload()).size()).toEqual(3);
  });

  it("build many before save", async () => {
    const company = companies("first_firm");

    await assertQueriesCount(0, false, () => {
      company.clientsOfFirm.build([{ name: "Another Client" }, { name: "Another Client II" }]);
    });

    company.name += "-changed";
    await assertQueriesCount(5, false, async () => {
      assert(await company.save());
    });
    expect(await (await company.clientsOfFirm.reload()).size()).toEqual(4);
  });

  it("build via block before save", async () => {
    const company = companies("first_firm");

    let newClient!: Client;
    await assertQueriesCount(0, false, () => {
      newClient = company.clientsOfFirm.build({}, (client: any) => {
        client.name = "Another Client";
      });
    });
    assertNotPredicate(company.clientsOfFirm, (p) => p.loaded);

    company.name += "-changed";
    await assertQueriesCount(4, false, async () => {
      assert(await company.save());
    });
    assertPredicate(newClient, (r) => r.isPersisted());
    expect(await (await company.clientsOfFirm.reload()).size()).toEqual(3);
  });

  it("build many via block before save", async () => {
    const company = companies("first_firm");

    await assertQueriesCount(0, false, () => {
      company.clientsOfFirm.build(
        [{ name: "Another Client" }, { name: "Another Client II" }],
        (client: any) => {
          client.name = "changed";
        },
      );
    });

    company.name += "-changed";
    await assertQueriesCount(5, false, async () => {
      assert(await company.save());
    });
    expect(await (await company.clientsOfFirm.reload()).size()).toEqual(4);
  });

  it("replace on new object", async () => {
    const firm = new Firm({ name: "New Firm" });
    await firm.clients.replace([companies("second_client"), new Client({ name: "New Client" })]);
    assert(await firm.save());
    await firm.reload();
    expect((await firm.clients).length).toEqual(2);
    expect((await firm.clients).map((c) => c.id)).toContain(
      (await Client.findBy({ name: "New Client" }))!.id,
    );
  });

  it("replace on duplicated object", async () => {
    const firm = (await Firm.createBang({ name: "New Firm" })).dup();
    await firm.clients.replace([companies("second_client"), new Client({ name: "New Client" })]);
    assert(await firm.save());
    await firm.reload();
    expect((await firm.clients).length).toEqual(2);
    expect((await firm.clients).map((c) => c.id)).toContain(
      (await Client.findBy({ name: "New Client" }))!.id,
    );
  });

  it("should not load the associated model", async () => {
    const firm = await Firm.find(companies("first_firm").id);
    firm.clients.reset();
    await assertNoQueries(false, async () => {
      await firm.saveBang();
    });
  });
});

describe("TestDefaultAutosaveAssociationOnAHasOneAssociation", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  fixtures(["companies", "accounts"]);
  beforeAll(() => {
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Account);
    registerModel(DrinkDesigner);
    registerModel(Chef);
    registerModel(ChefWithPolymorphicInverseOf);
    registerModel(Eye);
    registerModel(Iris);
    registerModel(IrisWithReadOnlyForeignKey);
  });

  function makeModels() {
    return { Firm: Firm, Account };
  }

  it("should save parent but not invalid child", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" }) as any;
    assertPredicate(await firm.isValid(), (v) => v);

    await firm.buildAccountUsingPrimaryKey();
    assertNotPredicate(await (await firm.buildAccountUsingPrimaryKey()).isValid(), (v) => v);

    assert(await firm.save());
    assertNotPredicate(await firm.accountUsingPrimaryKey, (a: any) => a.isPersisted());
  });

  it("save fails for invalid has one", async () => {
    const firm = (await Firm.first()) as any;
    assertPredicate(await firm.isValid(), (v) => v);

    await firm.buildAccount();

    assertNotPredicate(await (await firm.account).isValid(), (v) => v);
    assertNotPredicate(await firm.isValid(), (v) => v);
    assertNot(await firm.save());
    expect(firm.errors.get("account")).toEqual(["is invalid"]);
  });

  it("save succeeds for invalid has one with validate false", async () => {
    const firm = (await Firm.first()) as any;
    assertPredicate(await firm.isValid(), (v) => v);

    await firm.buildUnvalidatedAccount();

    assertNotPredicate(await (await firm.unvalidatedAccount).isValid(), (v) => v);
    assertPredicate(await firm.isValid(), (v) => v);
    assert(await firm.save());
  });

  it("build before child saved", async () => {
    const firm = (await Firm.find(1)) as any;

    const account = await firm.buildAccount({ credit_limit: 1000 });
    expect(await firm.account).toBe(account);
    assertNotPredicate(account, (a: any) => a.isPersisted());
    assert(await firm.save());
    expect(await firm.account).toBe(account);
    assertPredicate(account, (a: any) => a.isPersisted());
  });

  it("build before either saved", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" }) as any;

    const account = new Account({ credit_limit: 1000 });
    await firm.setAccount(account);
    expect(await firm.account).toBe(account);
    assertNotPredicate(account, (a) => a.isPersisted());
    assert(await firm.save());
    expect(await firm.account).toBe(account);
    assertPredicate(account, (a) => a.isPersisted());
  });

  it("assignment before parent saved", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" }) as any;
    const a = await Account.find(1);
    await firm.setAccount(a);
    assertNotPredicate(firm, (f: any) => f.isPersisted());
    expect(await firm.account).toBe(a);
    assert(await firm.save());
    expect(await firm.account).toBe(a);
    await firm.association("account").reload();
    expect((await firm.account).equals(a)).toBe(true);
  });

  it("assignment before either saved", async () => {
    const firm = new Firm({ name: "GlobalMegaCorp" }) as any;
    const a = new Account({ credit_limit: 1000 });
    await firm.setAccount(a);
    assertNotPredicate(firm, (f: any) => f.isPersisted());
    assertNotPredicate(a, (r) => r.isPersisted());
    expect(await firm.account).toBe(a);
    assert(await firm.save());
    assertPredicate(firm, (f: any) => f.isPersisted());
    assertPredicate(a, (r) => r.isPersisted());
    expect(await firm.account).toBe(a);
    await firm.association("account").reload();
    expect((await firm.account).equals(a)).toBe(true);
  });

  it("not resaved when unchanged", async () => {
    let firm = (await Firm.all().merge({ includes: "account" }).first()) as any;
    firm.name += "-changed";
    await assertQueriesCount(3, false, async () => {
      await firm.saveBang();
    });

    firm = await Firm.first();
    await firm.setAccount(await Account.first());
    await assertQueriesCount(Firm.partialUpdates ? 0 : 1, false, async () => {
      await firm.saveBang();
    });

    firm = (await Firm.first())!.dup();
    await firm.setAccount(await Account.first());
    await assertQueriesCount(4, false, async () => {
      await firm.saveBang();
    });

    firm = (await Firm.first())!.dup();
    await firm.setAccount((await Account.first())!.dup());
    await assertQueriesCount(4, false, async () => {
      await firm.saveBang();
    });
  });

  it("should not load the associated model", async () => {
    const firm = (await Firm.find(1)) as any;
    firm.resetUnvalidatedAccount();
    await assertNoQueries(false, async () => {
      await firm.saveBang();
    });
  });

  it("callbacks firing order on create", async () => {
    const eye = await Eye.create({ irisAttributes: { color: "honey" } });
    expect(eye.afterCreateCallbacksStack).toEqual([true, false]);
  });

  it("callbacks firing order on update", async () => {
    const eye = await Eye.create({ irisAttributes: { color: "honey" } });
    await eye.update({ irisAttributes: { color: "green" } });
    expect(eye.afterUpdateCallbacksStack).toEqual([true, false]);
  });

  it("callbacks firing order on save", async () => {
    const eye = await Eye.create({ irisAttributes: { color: "honey" } });
    expect(eye.afterSaveCallbacksStack).toEqual([false, false]);

    await eye.update({ irisAttributes: { color: "blue" } });
    expect(eye.afterSaveCallbacksStack).toEqual([false, false, false, false]);
  });

  it("callbacks on child when parent autosaves child", async () => {
    const eye = await Eye.createBang({ iris: new Iris() });
    const iris = await eye.iris;
    expect(iris?.beforeValidationCallbacksCounter).toBe(1);
    expect(iris?.beforeCreateCallbacksCounter).toBe(1);
    expect(iris?.beforeSaveCallbacksCounter).toBe(1);
    expect(iris?.afterValidationCallbacksCounter).toBe(1);
    expect(iris?.afterCreateCallbacksCounter).toBe(1);
    expect(iris?.afterSaveCallbacksCounter).toBe(1);
  });
  it("callbacks on child when parent autosaves child twice", async () => {
    const eye = new Eye();
    cacheAssoc(eye, "iris", new Iris());
    await eye.saveBang();
    const iris2 = new Iris();
    cacheAssoc(eye, "iris", iris2);
    await eye.saveBang();
    expect(iris2.beforeValidationCallbacksCounter).toBe(1);
    expect(iris2.beforeCreateCallbacksCounter).toBe(1);
    expect(iris2.beforeSaveCallbacksCounter).toBe(1);
    expect(iris2.afterValidationCallbacksCounter).toBe(1);
    expect(iris2.afterCreateCallbacksCounter).toBe(1);
    expect(iris2.afterSaveCallbacksCounter).toBe(1);
  });
  it("callbacks on child when parent autosaves polymorphic child with inverse of", async () => {
    const drinkDesigner = (await DrinkDesigner.createBang({
      chef: new ChefWithPolymorphicInverseOf(),
    })) as any;
    const chef = await drinkDesigner.chef;
    expect(chef.beforeValidationCallbacksCounter).toEqual(1);
    expect(chef.beforeCreateCallbacksCounter).toEqual(1);
    expect(chef.beforeSaveCallbacksCounter).toEqual(1);
    expect(chef.afterValidationCallbacksCounter).toEqual(1);
    expect(chef.afterCreateCallbacksCounter).toEqual(1);
    expect(chef.afterSaveCallbacksCounter).toEqual(1);
  });
  it("callbacks on child when child autosaves parent", async () => {
    const iris = await Iris.createBang({ eye: new Eye() });
    expect(iris.beforeValidationCallbacksCounter).toEqual(1);
    expect(iris.beforeCreateCallbacksCounter).toEqual(1);
    expect(iris.beforeSaveCallbacksCounter).toEqual(1);
    expect(iris.afterValidationCallbacksCounter).toEqual(1);
    expect(iris.afterCreateCallbacksCounter).toEqual(1);
    expect(iris.afterSaveCallbacksCounter).toEqual(1);
  });
  it("callbacks on child when child autosaves parent twice", async () => {
    const iris = new Iris();
    cacheAssoc(iris, "eye", new Eye());
    await iris.saveBang();
    const eye2 = new Eye();
    cacheAssoc(iris, "eye", eye2);
    await iris.saveBang();
    expect(iris.beforeValidationCallbacksCounter).toBe(2);
    expect(iris.beforeCreateCallbacksCounter).toBe(1);
    expect(iris.beforeSaveCallbacksCounter).toBe(2);
    expect(iris.afterValidationCallbacksCounter).toBe(2);
    expect(iris.afterCreateCallbacksCounter).toBe(1);
    expect(iris.afterSaveCallbacksCounter).toBe(2);
  });
  it("callbacks on child when polymorphic child with inverse of autosaves parent", async () => {
    const chef = await ChefWithPolymorphicInverseOf.createBang({
      employable: new DrinkDesigner(),
    });
    expect(chef.beforeValidationCallbacksCounter).toEqual(1);
    expect(chef.beforeCreateCallbacksCounter).toEqual(1);
    expect(chef.beforeSaveCallbacksCounter).toEqual(1);
    expect(chef.afterValidationCallbacksCounter).toEqual(1);
    expect(chef.afterCreateCallbacksCounter).toEqual(1);
    expect(chef.afterSaveCallbacksCounter).toEqual(1);
  });

  it("foreign key attribute is not set unless changed", async () => {
    const eye = await Eye.createBang({
      irisWithReadOnlyForeignKeyAttributes: { color: "honey" },
    });
    await assertNothingRaised(() => {
      eye.overrideIrisWithReadOnlyForeignKeyColor = true;
      return eye.saveBang();
    });
  });
});

describe("TestAutosaveAssociationOnAHasOneAssociation", () => {
  const { chefs, cakeDesigners, drinkDesigners } = fixtures([
    "chefs",
    "cakeDesigners",
    "drinkDesigners",
  ]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
    registerModel(ShipPart);
    registerModel(ShipWithoutNestedAttributes);
    registerModel(CanonicalParrot);
    registerModel(Chef);
    registerModel(CakeDesigner);
    registerModel(DrinkDesigner);
    registerModel(Developer);
  });

  let pirate: any;
  let ship: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    ship = await pirate.createShip({ name: "Nights Dirty Lightning" });
  });

  it("should still work without an associated model", async () => {
    await ship.destroy();
    (await pirate.reload()).catchphrase = "Arr";
    await pirate.save();
    expect((await pirate.reload()).catchphrase).toEqual("Arr");
  });

  it("should automatically save the associated model", async () => {
    (await pirate.ship).name = "The Vile Serpent";
    await pirate.save();
    expect((await (await pirate.reload()).ship).name).toEqual("The Vile Serpent");
  });

  it("changed for autosave should handle cycles", async () => {
    ship.pirate = pirate;
    await assertNoQueries(false, async () => {
      await ship.saveBang();
    });

    const parrot = await pirate.parrots.create({ name: "some_name" });
    parrot.name = "changed_name";
    await assertQueriesCount(3, false, async () => {
      await ship.saveBang();
    });
    await assertNoQueries(false, async () => {
      await ship.saveBang();
    });
  });

  it("should automatically save bang the associated model", async () => {
    (await pirate.ship).name = "The Vile Serpent";
    await pirate.saveBang();
    expect((await (await pirate.reload()).ship).name).toEqual("The Vile Serpent");
  });

  it("should automatically save bang the associated model if it sets the inverse record", async () => {
    const pirate = new CanonicalPirate({ catchphrase: "Savvy?" }) as any;
    const ship = new CanonicalShip({ name: "Black Pearl" }) as any;
    ship.pirate = pirate;
    await pirate.saveBang();
    expect((await (await pirate.reload()).ship).name).toEqual("Black Pearl");
  });

  it("should automatically validate the associated model", async () => {
    (await pirate.ship).name = "";
    assertPredicate(await pirate.isInvalid(), (v) => v);
    assertPredicate(pirate.errors.get("ship.name"), (e: string[]) => e.length > 0);
  });

  it("should merge errors on the associated models onto the parent even if it is not valid", async () => {
    (await pirate.ship).name = null;
    pirate.catchphrase = null;
    assertPredicate(await pirate.isInvalid(), (v) => v);
    assertPredicate(pirate.errors.get("ship.name"), (e: string[]) => e.length > 0);
    assertPredicate(pirate.errors.get("catchphrase"), (e: string[]) => e.length > 0);
  });

  it("should not ignore different error messages on the same attribute", async () => {
    const oldValidators = deepDup(CanonicalShip._validators);
    const validateChain = getCallbackChains(CanonicalShip.prototype).get("validate")!;
    const oldCallbacks = [...validateChain.entries];
    try {
      CanonicalShip.validatesFormatOf("name", { with: /\w/ });
      (await pirate.ship).name = "";
      pirate.catchphrase = null;
      assertPredicate(await pirate.isInvalid(), (v) => v);
      expect(pirate.errors.get("ship.name")).toEqual(["can't be blank", "is invalid"]);
    } finally {
      CanonicalShip._validators = oldValidators;
      validateChain.clear();
      validateChain.append(...oldCallbacks);
    }
  });

  it("should still allow to bypass validations on the associated model", async () => {
    pirate.catchphrase = "";
    (await pirate.ship).name = "";
    await pirate.save({ validate: false });
    expect([(await pirate.reload()).catchphrase, (await pirate.ship).name]).toEqual(["", ""]);
  });

  it("should allow to bypass validations on associated models at any depth", async () => {
    for (let i = 0; i < 2; i++) await (await pirate.ship).parts.createBang({ name: `part ${i}` });

    pirate.catchphrase = "";
    (await pirate.ship).name = "";
    for (const part of await (await pirate.ship).parts) part.name = "";
    await pirate.save({ validate: false });

    const values = [
      (await pirate.reload()).catchphrase,
      (await pirate.ship).name,
      ...(await (await pirate.ship).parts).map((part: any) => part.name),
    ];
    expect(values).toEqual(["", "", "", ""]);
  });

  it("should still raise an ActiveRecordRecord Invalid exception if we want that", async () => {
    (await pirate.ship).name = "";
    await assertRaise([RecordInvalid], {}, () => pirate.saveBang());
  });

  it("should not save and return false if a callback cancelled saving", async () => {
    const pirate = new CanonicalPirate({ catchphrase: "Arr" }) as any;
    const ship = await pirate.buildShip({ name: "The Vile Serpent" });
    ship.cancelSaveFromCallback = true;

    await assertNoDifference(
      async () => Number(await CanonicalPirate.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await CanonicalShip.count()),
          null,
          async () => {
            assertNot(await pirate.save());
          },
        );
      },
    );
  });

  it("should rollback any changes if an exception occurred while saving", async () => {
    const before = [pirate.catchphrase, (await pirate.ship).name];

    pirate.catchphrase = "Arr";
    (await pirate.ship).name = "The Vile Serpent";

    const child = await pirate.ship;
    const save = child.save.bind(child);
    child.save = async (options?: any) => {
      await save(options);
      throw new Error("Oh noes!");
    };

    await assertRaise([Error], {}, async () => assertNot(await pirate.save()));
    expect([(await pirate.reload()).catchphrase, (await pirate.ship).name]).toEqual(before);
  });

  it("should not load the associated model", async () => {
    await assertQueriesCount(3, false, async () => {
      pirate.catchphrase = "Arr";
      await pirate.saveBang();
    });
  });

  it("mark for destruction is ignored without autosave true", async () => {
    const ship = new ShipWithoutNestedAttributes({ name: "The Black Flag" });
    ship.parts.build().markForDestruction();

    assertNotPredicate(await ship.isValid(), (v) => v);
  });

  it("recognises inverse polymorphic association changes with same foreign key", async () => {
    const chefA = chefs("gordon_ramsay");
    const chefB = chefs("marco_pierre_white");

    const cakeDesignerA = cakeDesigners("flora") as any;
    await cakeDesignerA.updateBang({ chef: chefA });
    const cakeDesignerB = cakeDesigners("frosty") as any;
    await cakeDesignerB.updateBang({ chef: chefB });

    const drinkDesignerA = drinkDesigners("turner") as any;
    const drinkDesignerB = drinkDesigners("sparrow") as any;

    await swapChefs(cakeDesignerB, drinkDesignerB);
    assertPredicate(await (await cakeDesignerB.reload()).chef, isPresent);
    assertNotPredicate(await (await drinkDesignerB.reload()).chef, isPresent);

    await swapChefs(cakeDesignerA, drinkDesignerA);
    assertPredicate(await (await cakeDesignerA.reload()).chef, isPresent);
    assertNotPredicate(await (await drinkDesignerA.reload()).chef, isPresent);
  });

  async function swapChefs(cakeDesigner: any, drinkDesigner: any) {
    await drinkDesigner.setChef(await cakeDesigner.chef);
    await drinkDesigner.saveBang();
    await cakeDesigner.saveBang();
  }
});

describe("TestDefaultAutosaveAssociationOnABelongsToAssociation", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  const { tags, posts, taggings } = fixtures(["companies", "posts", "tags", "taggings"]);
  beforeAll(() => {
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Client);
    registerModel(AuditLog);
    registerModel(Developer);
    registerModel(CanonicalOrder);
    registerModel(CanonicalCustomer);
    registerModel(Tag);
    registerModel(Tagging);
    registerModel(CanonicalPost);
    registerModel(Mouse);
    registerModel(Squeak);
    registerModel(CpkOrder);
    registerModel(CpkBook);
  });

  function makeModels() {
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    class Post extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("BelongsToAutosaveAuthor", Author);
    registerModel("BelongsToAutosavePost", Post);
    Associations.belongsTo.call(Post, "author", {
      autosave: true,
      className: "BelongsToAutosaveAuthor",
    });
    return { Author, Post };
  }

  function makeOrderModels() {
    registerModel(CanonicalCustomer);
    registerModel(CanonicalOrder);
    return { Customer: CanonicalCustomer, Order: CanonicalOrder };
  }

  async function setBilling(order: Base, customer: Base) {
    await (order.association("billing") as SingularAssociation).writer(customer);
  }
  async function setShipping(order: Base, customer: Base) {
    await (order.association("shipping") as SingularAssociation).writer(customer);
  }

  it("should save parent but not invalid child", async () => {
    const client = new Client({ name: "Joe (the Plumber)" }) as any;
    assertPredicate(await client.isValid(), (v) => v);

    client.buildFirm();
    assertNotPredicate(await (await client.firm).isValid(), (v) => v);

    assert(await client.save());
    assertNotPredicate(await client.firm, (f: any) => f.isPersisted());
  });

  it("save fails for invalid belongs to", async () => {
    const log = (await AuditLog.create({ developer_id: 0, message: " " })) as any;
    assert(log);

    log.developer = new Developer();
    assertNotPredicate(await (await log.developer).isValid(), (v) => v);
    assertNotPredicate(await log.isValid(), (v) => v);
    assertNot(await log.save());
    expect(log.errors.get("developer")).toEqual(["is invalid"]);
  });

  it("save succeeds for invalid belongs to with validate false", async () => {
    const log = (await AuditLog.create({ developer_id: 0, message: " " })) as any;
    assert(log);

    log.unvalidatedDeveloper = new Developer();
    assertNotPredicate(await (await log.unvalidatedDeveloper).isValid(), (v) => v);
    assertPredicate(await log.isValid(), (v) => v);
    assert(await log.save());
  });

  it("assignment before parent saved", async () => {
    const client = (await Client.first()) as any;
    const apple = new Firm({ name: "Apple" });
    client.firm = apple;
    expect((await client.firm).equals(apple)).toBe(true);
    assertNotPredicate(apple, (a) => a.isPersisted());
    assert(await client.save());
    assert(await apple.save());
    assertPredicate(apple, (a) => a.isPersisted());
    expect((await client.firm).equals(apple)).toBe(true);
    await client.association("firm").reload();
    expect((await client.firm).equals(apple)).toBe(true);
  });

  it("assignment before either saved", async () => {
    const finalCut = new Client({ name: "Final Cut" }) as any;
    const apple = new Firm({ name: "Apple" });
    finalCut.firm = apple;
    assertNotPredicate(finalCut, (c: any) => c.isPersisted());
    assertNotPredicate(apple, (a) => a.isPersisted());
    assert(await finalCut.save());
    assertPredicate(finalCut, (c: any) => c.isPersisted());
    assertPredicate(apple, (a) => a.isPersisted());
    expect((await finalCut.firm).equals(apple)).toBe(true);
    await finalCut.association("firm").reload();
    expect((await finalCut.firm).equals(apple)).toBe(true);
  });

  it("store two association with one save", async () => {
    const numOrders = Number(await CanonicalOrder.count());
    const numCustomers = Number(await CanonicalCustomer.count());
    const order = new CanonicalOrder() as any;

    const customer1 = (order.billing = new CanonicalCustomer());
    const customer2 = (order.shipping = new CanonicalCustomer());
    assert(await order.save());
    expect((await order.billing).equals(customer1)).toBe(true);
    expect((await order.shipping).equals(customer2)).toBe(true);

    await order.reload();

    expect((await order.billing).equals(customer1)).toBe(true);
    expect((await order.shipping).equals(customer2)).toBe(true);

    expect(Number(await CanonicalOrder.count())).toEqual(numOrders + 1);
    expect(Number(await CanonicalCustomer.count())).toEqual(numCustomers + 2);
  });

  it("store association in two relations with one save", async () => {
    const numOrders = Number(await CanonicalOrder.count());
    const numCustomers = Number(await CanonicalCustomer.count());
    const order = new CanonicalOrder() as any;

    const customer = (order.billing = order.shipping = new CanonicalCustomer());
    assert(await order.save());
    expect((await order.billing).equals(customer)).toBe(true);
    expect((await order.shipping).equals(customer)).toBe(true);

    await order.reload();

    expect((await order.billing).equals(customer)).toBe(true);
    expect((await order.shipping).equals(customer)).toBe(true);

    expect(Number(await CanonicalOrder.count())).toEqual(numOrders + 1);
    expect(Number(await CanonicalCustomer.count())).toEqual(numCustomers + 1);
  });
  it("store association in two relations with one save in existing object", async () => {
    const numOrders = Number(await CanonicalOrder.count());
    const numCustomers = Number(await CanonicalCustomer.count());
    const order = (await CanonicalOrder.create()) as any;

    const customer = (order.billing = order.shipping = new CanonicalCustomer());
    assert(await order.save());
    expect((await order.billing).equals(customer)).toBe(true);
    expect((await order.shipping).equals(customer)).toBe(true);

    await order.reload();

    expect((await order.billing).equals(customer)).toBe(true);
    expect((await order.shipping).equals(customer)).toBe(true);

    expect(Number(await CanonicalOrder.count())).toEqual(numOrders + 1);
    expect(Number(await CanonicalCustomer.count())).toEqual(numCustomers + 1);
  });
  it("store association in two relations with one save in existing object with values", async () => {
    const numOrders = Number(await CanonicalOrder.count());
    const numCustomers = Number(await CanonicalCustomer.count());
    const order = (await CanonicalOrder.create()) as any;

    let customer = (order.billing = order.shipping = new CanonicalCustomer());
    assert(await order.save());
    expect((await order.billing).equals(customer)).toBe(true);
    expect((await order.shipping).equals(customer)).toBe(true);

    await order.reload();

    customer = order.billing = order.shipping = new CanonicalCustomer();

    assert(await order.save());
    await order.reload();

    expect((await order.billing).equals(customer)).toBe(true);
    expect((await order.shipping).equals(customer)).toBe(true);

    expect(Number(await CanonicalOrder.count())).toEqual(numOrders + 1);
    expect(Number(await CanonicalCustomer.count())).toEqual(numCustomers + 2);
  });

  it("store association with a polymorphic relationship", async () => {
    const numTagging = Number(await Tagging.count());
    await (tags("misc") as any).createTagging({ taggable: posts("thinking") });
    expect(Number(await Tagging.count())).toEqual(numTagging + 1);
  });

  it("build and then save parent should not reload target", async () => {
    const client = (await Client.first()) as any;
    const apple = client.buildFirm({ name: "Apple" });
    await client.saveBang();
    await assertNoQueries(false, async () => {
      expect((await client.firm).equals(apple)).toBe(true);
    });
  });

  it("validation does not validate stale association target", async () => {
    const validDeveloper = await Developer.createBang({ name: "Dude", salary: 50_000 });
    const invalidDeveloper = new Developer();

    const auditlog = new AuditLog({ message: "foo" }) as any;
    auditlog.developer = invalidDeveloper;
    auditlog.developer_id = validDeveloper.id;

    assertPredicate(await auditlog.isValid(), (v) => v);
  });

  it("validation does not validate non dirty association target", async () => {
    const mouse = (await Mouse.createBang({ name: "Will" })) as any;
    await Squeak.createBang({ mouse });

    mouse.name = null;
    await mouse.saveBang({ validate: false });

    const squeak = (await Squeak.last()) as any;

    expect(await squeak.isValid()).toEqual(true);
    expect(isPresent(await squeak.mouse)).toEqual(true);
    expect(await squeak.isValid()).toEqual(true);
  });

  it("composite primary key autosave", async () => {
    await assertNothingRaised(() =>
      CpkOrder.createBang({ id: [1, 2], book: new CpkBook({ title: "Book", id: [3, 4] }) }),
    );
  });

  it("should not load the associated model", async () => {
    const tagging = taggings("welcome_general") as any;
    tagging.resetTag();
    await assertNoQueries(false, async () => {
      await tagging.saveBang();
    });
  });
});

describe("TestAutosaveAssociationOnABelongsToAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
    registerModel(ShipPart);
    registerModel(Developer);
    registerModel(CanonicalPost);
    registerModel(CanonicalComment);
    registerModel(Author);
  });

  let ship: any;
  let pirate: any;

  beforeEach(async () => {
    ship = await CanonicalShip.create({ name: "Nights Dirty Lightning" });
    pirate = await ship.createPirate({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
  });

  it("should still work without an associated model", async () => {
    await pirate.destroy();
    (await ship.reload()).name = "The Vile Serpent";
    await ship.save();
    expect((await ship.reload()).name).toEqual("The Vile Serpent");
  });

  it("should automatically save the associated model", async () => {
    (await ship.pirate).catchphrase = "Arr";
    await ship.save();
    expect((await (await ship.reload()).pirate).catchphrase).toEqual("Arr");
  });

  it("should automatically save bang the associated model", async () => {
    (await ship.pirate).catchphrase = "Arr";
    await ship.saveBang();
    expect((await (await ship.reload()).pirate).catchphrase).toEqual("Arr");
  });

  it("should automatically validate the associated model", async () => {
    (await ship.pirate).catchphrase = "";
    assertPredicate(await ship.isInvalid(), (v) => v);
    assertPredicate(ship.errors.get("pirate.catchphrase"), (e: string[]) => e.length > 0);
  });

  it("should merge errors on the associated model onto the parent even if it is not valid", async () => {
    ship.name = null;
    (await ship.pirate).catchphrase = null;
    assertPredicate(await ship.isInvalid(), (v) => v);
    assertPredicate(ship.errors.get("name"), (e: string[]) => e.length > 0);
    assertPredicate(ship.errors.get("pirate.catchphrase"), (e: string[]) => e.length > 0);
  });

  it("should still allow to bypass validations on the associated model", async () => {
    (await ship.pirate).catchphrase = "";
    ship.name = "";
    await ship.save({ validate: false });
    expect([(await ship.reload()).name, (await ship.pirate).catchphrase]).toEqual(["", ""]);
  });

  it("should still raise an ActiveRecordRecord Invalid exception if we want that", async () => {
    (await ship.pirate).catchphrase = "";
    await assertRaise([RecordInvalid], {}, () => ship.saveBang());
  });

  it("should not save and return false if a callback cancelled saving", async () => {
    const ship = new CanonicalShip({ name: "The Vile Serpent" }) as any;
    const pirate = ship.buildPirate({ catchphrase: "Arr" });
    pirate.cancelSaveFromCallback = true;

    await assertNoDifference(
      async () => Number(await CanonicalShip.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await CanonicalPirate.count()),
          null,
          async () => {
            assertNot(await ship.save());
          },
        );
      },
    );
  });

  it("should rollback any changes if an exception occurred while saving", async () => {
    const before = [(await ship.pirate).catchphrase, ship.name];

    (await ship.pirate).catchphrase = "Arr";
    ship.name = "The Vile Serpent";

    const parent = await ship.pirate;
    const save = parent.save.bind(parent);
    parent.save = async (options?: any) => {
      await save(options);
      throw new Error("Oh noes!");
    };

    await assertRaise([Error], {}, async () => assertNot(await ship.save()));
    expect([(await (await ship.pirate).reload()).catchphrase, (await ship.reload()).name]).toEqual(
      before,
    );
  });

  it("should not load the associated model", async () => {
    await assertQueriesCount(3, false, async () => {
      ship.name = "The Vile Serpent";
      await ship.saveBang();
    });
  });

  it("should save with non nullable foreign keys", async () => {
    const parent = new CanonicalPost({ title: "foo", body: "..." }) as any;
    const child = parent.comments.build({ body: "..." });
    await child.saveBang();
    expect((await (await child.reload()).post).equals(await parent.reload())).toBe(true);
  });

  it("should save if previously saved", async () => {
    const ship = (await CanonicalShip.create({
      name: "Nights Dirty Lightning",
      pirate: new CanonicalPirate({ catchphrase: "Arrrr" }),
    })) as any;
    await ship.createPirate({ catchphrase: "Savvy?" });
    expect((await (await ship.reload()).pirate).catchphrase).toEqual("Savvy?");
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociationWithAcceptsNestedAttributes", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  fixtures([]);
  beforeAll(() => {
    registerModel(Molecule);
    registerModel(Electron);
    registerModel(Guitar);
    registerModel(TuningPeg);
  });

  function makeModels() {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    return { Pirate: CanonicalPirate, Bird: CanonicalBird };
  }

  it("valid adding with nested attributes", async () => {
    const molecule = new Molecule();
    const validElectron = new Electron({ name: "electron" });

    await molecule.electrons.replace([validElectron]);
    await molecule.save();

    assertPredicate(await validElectron.isValid(), (v) => v);
    assertPredicate(molecule, (m) => m.isPersisted());
    expect(await molecule.electrons.count()).toEqual(1);
  });

  it("invalid adding with nested attributes", async () => {
    const molecule = new Molecule();
    const validElectron = new Electron({ name: "electron" });
    const invalidElectron = new Electron();

    await molecule.electrons.replace([validElectron, invalidElectron]);
    await molecule.save();

    assertNotPredicate(await invalidElectron.isValid(), (v) => v);
    assertPredicate(await validElectron.isValid(), (v) => v);
    assertNot(
      molecule.isPersisted(),
      "Molecule should not be persisted when its electrons are invalid",
    );
  });

  it("errors details should be set", async () => {
    const molecule = new Molecule();
    const validElectron = new Electron({ name: "electron" });
    const invalidElectron = new Electron();

    await molecule.electrons.replace([validElectron, invalidElectron]);

    assertNotPredicate(await invalidElectron.isValid(), (v) => v);
    assertPredicate(await validElectron.isValid(), (v) => v);
    assertNotPredicate(await molecule.isValid(), (v) => v);
    expect(molecule.errors.details.get("electrons.name")).toEqual([{ error: ":blank" }]);
  });

  it("errors should be indexed when passed as array", async () => {
    const guitar = new Guitar();
    const tuningPegValid = new TuningPeg() as any;
    tuningPegValid.pitch = 440.0;
    const tuningPegInvalid = new TuningPeg();

    await guitar.tuningPegs.replace([tuningPegValid, tuningPegInvalid]);

    assertNotPredicate(await tuningPegInvalid.isValid(), (v) => v);
    assertPredicate(await tuningPegValid.isValid(), (v) => v);
    assertNotPredicate(await guitar.isValid(), (v) => v);
    expect(guitar.errors.get("tuning_pegs[1].pitch")).toEqual(["is not a number"]);
    expect(guitar.errors.get("tuning_pegs.pitch")).not.toEqual(["is not a number"]);
  });

  function makeIndexedHasMany(opts: { indexErrors?: boolean } = {}) {
    const seed = `Idx${Math.random().toString(36).slice(2, 8)}`;
    class Parent extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Base {
      declare name: string | null;
      declare parent_id: number | null;

      static {
        this.attribute("name", "string");
        this.attribute("parent_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    registerModel(`${seed}Parent`, Parent);
    registerModel(`${seed}Child`, Child);
    Associations.hasMany.call(Parent, "children", {
      autosave: true,
      className: `${seed}Child`,
      ...(opts.indexErrors ? { indexErrors: true as const } : {}),
    });
    return { Parent, Child };
  }
  it("errors should be indexed when global flag is set", async () => {
    const oldAttributeConfig = indexNestedAttributeErrors();
    setIndexNestedAttributeErrors(true);
    try {
      const molecule = new Molecule();
      const validElectron = new Electron({ name: "electron" });
      const invalidElectron = new Electron();

      await molecule.electrons.replace([validElectron, invalidElectron]);

      assertNotPredicate(await invalidElectron.isValid(), (v) => v);
      assertPredicate(await validElectron.isValid(), (v) => v);
      assertNotPredicate(await molecule.isValid(), (v) => v);
      expect(molecule.errors.get("electrons[1].name")).toEqual(["can't be blank"]);
      expect(molecule.errors.get("electrons.name")).not.toEqual(["can't be blank"]);
    } finally {
      setIndexNestedAttributeErrors(oldAttributeConfig);
    }
  });
  it("errors details should be indexed when passed as array", async () => {
    const guitar = new Guitar();
    const tuningPegValid = new TuningPeg() as any;
    tuningPegValid.pitch = 440.0;
    const tuningPegInvalid = new TuningPeg();

    await guitar.tuningPegs.replace([tuningPegValid, tuningPegInvalid]);

    assertNotPredicate(await tuningPegInvalid.isValid(), (v) => v);
    assertPredicate(await tuningPegValid.isValid(), (v) => v);
    assertNotPredicate(await guitar.isValid(), (v) => v);
    expect(guitar.errors.details.get("tuning_pegs[1].pitch")).toEqual([
      { error: ":not_a_number", value: null },
    ]);
    expect(guitar.errors.details.get("tuning_pegs.pitch") ?? []).toEqual([]);
  });
  it("errors details with error on base should be indexed when passed as array", async () => {
    const reference = class extends Base {
      static {
        this.tableName = "references";
      }

      shouldBeFavorite(this: any) {
        if (!this.favorite) this.errors.add("base", "should be favorite");
      }
    };
    Object.defineProperty(reference, "name", { value: "Reference" });
    reference.validate(":shouldBeFavorite");

    const person = class extends Base {
      static {
        this.tableName = "people";
      }
    };
    person.hasMany("references", { autosave: true, indexErrors: true, anonymousClass: reference });
    Object.defineProperty(person, "name", { value: "Person" });

    const p = new person() as any;
    const referenceValid = new reference({ favorite: true });
    const referenceInvalid = new reference({ favorite: false });
    await p.references.replace([referenceValid, referenceInvalid]);

    assertPredicate(await referenceValid.isValid(), (v) => v);
    assertNotPredicate(await referenceInvalid.isValid(), (v) => v);
    assertNotPredicate(await p.isValid(), (v) => v);
    expect(p.errors.details.get("references[1].base")).toEqual([{ error: "should be favorite" }]);
    expect(p.errors.get("references[1].base")[0]).toEqual("should be favorite");
    expect(p.errors.fullMessages).toEqual(["References[1] should be favorite"]);
  });
  it("indexed errors should be properly translated", async () => {
    const oldI18nCustomizeFullMessage = ModelError.i18nCustomizeFullMessage;
    ModelError.i18nCustomizeFullMessage = true;
    try {
      I18n.backend().storeTranslations("en", {
        activerecord: {
          errors: {
            models: {
              "person/references": {
                format: "%{message}",
              },
            },
          },
        },
      });
      const reference = class extends Base {
        static {
          this.tableName = "references";
        }

        shouldBeFavorite(this: any) {
          if (!this.favorite) this.errors.add("base", "should be favorite");
        }
      };
      Object.defineProperty(reference, "name", { value: "Reference" });
      reference.validate(":shouldBeFavorite");
      reference.validatesPresenceOf("job_id");

      const person = class extends Base {
        static {
          this.tableName = "people";
        }
      };
      person.hasMany("references", {
        autosave: true,
        indexErrors: true,
        anonymousClass: reference,
      });
      Object.defineProperty(person, "name", { value: "Person" });

      const p = new person() as any;
      const referenceValid = new reference({ favorite: true, job_id: 1 });
      const referenceInvalid = new reference({ favorite: false });
      await p.references.replace([referenceValid, referenceInvalid]);

      assertPredicate(await referenceValid.isValid(), (v) => v);
      assertNotPredicate(await referenceInvalid.isValid(), (v) => v);
      assertNotPredicate(await p.isValid(), (v) => v);
      expect(p.errors.fullMessages).toEqual(["should be favorite", "can't be blank"]);
    } finally {
      ModelError.i18nCustomizeFullMessage = oldI18nCustomizeFullMessage;
      resetI18n();
    }
  });
  it("indexed errors on base attribute should be properly translated", async () => {
    try {
      I18n.backend().storeTranslations("en", {
        activerecord: {
          attributes: {
            person: {
              reference: "Super reference",
            },
            reference: {
              base: "",
            },
          },
        },
      });
      const reference = class extends Base {
        static {
          this.tableName = "references";
        }

        shouldBeFavorite(this: any) {
          if (!this.favorite) this.errors.add("base", "should be favorite");
        }
      };
      Object.defineProperty(reference, "name", { value: "Reference" });
      reference.validate(":shouldBeFavorite");
      reference.validatesPresenceOf("job_id");

      const person = class extends Base {
        static {
          this.tableName = "people";
        }
      };
      Object.defineProperty(person, "name", { value: "Person" });
      person.hasOne("reference", { autosave: true, anonymousClass: reference });
      person.validates("reference", { presence: true });

      const p = new person() as any;
      assertNotPredicate(await p.isValid(), (v) => v);
      expect(p.errors.fullMessages).toEqual(["Super reference can't be blank"]);

      const referenceInvalid = new reference({ favorite: false });
      await p.setReference(referenceInvalid);

      assertNotPredicate(await referenceInvalid.isValid(), (v) => v);
      assertNotPredicate(await p.isValid(), (v) => v);
      expect(p.errors.fullMessages).toEqual([
        " should be favorite",
        "Reference job can't be blank",
      ]);
    } finally {
      resetI18n();
    }
  });
  it("errors details should be indexed when global flag is set", async () => {
    const oldAttributeConfig = indexNestedAttributeErrors();
    setIndexNestedAttributeErrors(true);
    try {
      const molecule = new Molecule();
      const validElectron = new Electron({ name: "electron" });
      const invalidElectron = new Electron();

      await molecule.electrons.replace([validElectron, invalidElectron]);

      assertNotPredicate(await invalidElectron.isValid(), (v) => v);
      assertPredicate(await validElectron.isValid(), (v) => v);
      assertNotPredicate(await molecule.isValid(), (v) => v);
      expect(molecule.errors.details.get("electrons[1].name")).toEqual([{ error: ":blank" }]);
      expect(molecule.errors.details.get("electrons.name") ?? []).toEqual([]);
    } finally {
      setIndexNestedAttributeErrors(oldAttributeConfig);
    }
  });
});

describe("TestAutosaveAssociationsInGeneral", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(CanonicalShip);
    registerModel(CanonicalPirate);
    registerModel(ShipPart);
    registerModel(Prisoner);
    registerModel(CanonicalBird);
    registerModel(CanonicalParrot);
  });

  it("autosave works even when other callbacks update the parent model", async () => {
    const reference = class extends Base {
      static {
        this.tableName = "references";
      }
    };
    Object.defineProperty(reference, "name", { value: "Reference" });

    const person = class extends Base {
      static {
        this.tableName = "people";
      }
    };
    Object.defineProperty(person, "name", { value: "Person" });
    person.afterCreate(async function (this: any) {
      await this.update({ first_name: "first name" });
    });
    person.hasMany("references", { autosave: true, anonymousClass: reference });

    const referenceInstance = (await reference.createBang()) as any;
    const personInstance = (await person.createBang({
      first_name: "foo",
      references: [referenceInstance],
    })) as any;

    await referenceInstance.reload();
    expect(referenceInstance.person_id).toEqual(personInstance.id);
    expect(personInstance.first_name).toEqual("first name");
  });

  it("autosave does not pass through non custom validation contexts", async () => {
    const person = class extends Base {
      static {
        this.tableName = "people";
      }

      shouldBeCool(this: any) {
        if (this.first_name !== "cool") {
          this.errors.add("first_name", "not cool");
        }
      }
    };
    person.validate(":shouldBeCool", { on: "create" });
    Object.defineProperty(person, "name", { value: "Person" });
    const reference = class extends Base {
      static {
        this.tableName = "references";
      }
    };
    Object.defineProperty(reference, "name", { value: "Reference" });
    reference.belongsTo("person", { autosave: true, anonymousClass: person });

    const u = (await person.createBang({ first_name: "cool" })) as any;
    u.first_name = "nah";

    assertPredicate(await u.isValid(), (v) => v);
    const r = new reference({ person: u });
    assertPredicate(await r.isValid(), (v) => v);
  });

  it("autosave collection association callbacks get called once", async () => {
    const shipWithSavingStack = class extends CanonicalShip {
      count?: number;

      saveCollectionAssociation(reflection: any) {
        this.count ??= 0;
        if (reflection.name === "parts") this.count += 1;
        return super.saveCollectionAssociation(reflection);
      }
    };

    const ship = new shipWithSavingStack({ name: "Nights Dirty Lightning" });
    ship.parts.build({ name: "part" });
    await ship.saveBang();
    expect(ship.count).toEqual(1);
  });

  it("autosave has one association callbacks get called once", async () => {
    assert(CanonicalShip.reflectOnAssociation("pirate")!.options.autosave);
    assert(CanonicalPirate.reflectOnAssociation("ship")!.options.autosave);

    const pirateWithSavingStack = class extends CanonicalPirate {
      count?: number;

      saveHasOneAssociation(reflection: any) {
        this.count ??= 0;
        if (reflection.name === "ship") this.count += 1;
        return super.saveHasOneAssociation(reflection);
      }
    };

    const pirate = new pirateWithSavingStack({ catchphrase: "Aye" });
    (pirate as any).buildShip({ name: "Nights Dirty Lightning" });
    await pirate.saveBang();
    expect(pirate.count).toEqual(1);
  });

  it("autosave belongs to association callbacks get called once", async () => {
    const shipWithSavingStack = class extends CanonicalShip {
      count?: number;

      saveBelongsToAssociation(reflection: any) {
        this.count ??= 0;
        if (reflection.name === "pirate") this.count += 1;
        return super.saveBelongsToAssociation(reflection);
      }
    };

    const ship = new shipWithSavingStack({ name: "Nights Dirty Lightning" });
    (ship as any).buildPirate({ catchphrase: "Aye" });
    await ship.saveBang();
    expect(ship.count).toEqual(1);
  });

  it("should not add the same callbacks multiple times for has one", async () => {
    await assertNoDifferenceWhenAddingCallbacksTwiceFor(CanonicalPirate, "ship");
  });

  it("should not add the same callbacks multiple times for belongs to", async () => {
    await assertNoDifferenceWhenAddingCallbacksTwiceFor(CanonicalShip, "pirate");
  });

  it("should not add the same callbacks multiple times for has many", async () => {
    await assertNoDifferenceWhenAddingCallbacksTwiceFor(CanonicalPirate, "birds");
  });

  it("should not add the same callbacks multiple times for has and belongs to many", async () => {
    await assertNoDifferenceWhenAddingCallbacksTwiceFor(CanonicalPirate, "parrots");
  });

  it("cyclic autosaves do not add multiple validations", async () => {
    const ship = new ShipWithoutNestedAttributes();
    ship.prisoners.build();

    assertNotPredicate(await ship.isValid(), (v) => v);
    expect(ship.errors.get("name").length).toEqual(1);
  });

  async function assertNoDifferenceWhenAddingCallbacksTwiceFor(
    model: typeof Base,
    associationName: string,
  ) {
    const reflection = model.reflectOnAssociation(associationName);
    expect(reflection).not.toBeNull();
    await assertNoDifference(
      () => callbacksForModel(model).length,
      null,
      () => addAutosaveAssociationCallbacks.call(model, reflection),
    );
  }

  function callbacksForModel(model: typeof Base) {
    return [...getCallbackChains(model.prototype).values()].flatMap((chain) => chain.entries);
  }
});

describe("TestHasManyAutosaveAssociationWhichItselfHasAutosaveAssociations", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  fixtures([]);

  function makeModels() {
    class GcPirate extends Base {
      declare catchphrase: string | null;
      declare ships: AssociationProxy<GcShip>;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.hasMany("ships", {
          autosave: true,
          className: "GcShip",
          foreignKey: "pirate_id",
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class GcShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;
      declare parts: AssociationProxy<GcPart>;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
        this.belongsTo("pirate", { className: "GcPirate", foreignKey: "pirate_id" });
        this.hasMany("parts", {
          autosave: true,
          className: "GcPart",
          foreignKey: "ship_id",
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface GcShip {
      get pirate(): GcPirate | null | Promise<GcPirate | null>;
      set pirate(value: GcPirate | null);
    }
    class GcPart extends Base {
      declare name: string | null;
      declare ship_id: number | null;

      static {
        this._tableName = "ship_parts";
        this.attribute("name", "string");
        this.attribute("ship_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    registerModel("GcPirate", GcPirate);
    registerModel("GcShip", GcShip);
    registerModel("GcPart", GcPart);
    return { Pirate: GcPirate, Ship: GcShip, Part: GcPart };
  }

  it("when grandchild marked_for_destruction, saving parent should destroy grandchild", async () => {
    const { Pirate, Ship, Part } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const part = await Part.create({ name: "Mast", ship_id: ship.id });
    part.markForDestruction();
    cacheAssoc(ship, "parts", [part]);
    ship.name = "Pearl-touched";
    cacheAssoc(pirate, "ships", [ship]);
    await pirate.save();
    expect(part.isDestroyed()).toBe(true);
  });

  it("when grandchild added, saving parent should create grandchild", async () => {
    const { Pirate, Ship, Part } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const newPart = new Part({ name: "Rudder" });
    cacheAssoc(ship, "parts", [newPart]);
    ship.name = "Pearl-touched";
    cacheAssoc(pirate, "ships", [ship]);
    await pirate.save();
    expect(newPart.isNewRecord()).toBe(false);
  });

  it("if association is not loaded, saving parent does not touch children", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("circular references do not cause infinite loop", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    cacheAssoc(pirate, "ships", [ship]);
    cacheAssoc(ship, "pirate", pirate);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("if association record is saved, in memory record attributes should be saved", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    ship.name = "Updated Pearl";
    cacheAssoc(pirate, "ships", [ship]);
    await pirate.save();
    const reloaded = await Ship.find(ship.id!);
    expect(reloaded.name).toBe("Updated Pearl");
  });

  it("when extra records exist for associations, validate should not load them up", async () => {
    const { Pirate, Ship, Part } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "Pearl" });
    cacheAssoc(pirate, "ships", [ship]);
    const part = new Part({ name: "Mast" });
    cacheAssoc(ship, "parts", [part]);
    await pirate.save();
    part.name = "changed";
    await Ship.create({ name: "Black Rock", pirate_id: pirate.id });
    await Part.create({ name: "Stern", ship_id: ship.id });
    await assertNoQueries(false, async () => {
      await pirate.isValid();
    });
  });
});

describe("TestAutosaveAssociationValidationMethodsGeneration", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
  });

  let pirate: any;

  beforeEach(() => {
    pirate = new CanonicalPirate();
  });

  it("should generate validation methods for has_many associations", async () => {
    assertRespondTo(pirate, "validateAssociatedRecordsFor_birds");
  });

  it("should generate validation methods for has_one associations with :validate => true", async () => {
    assertRespondTo(pirate, "validateAssociatedRecordsFor_ship");
  });

  it("should not generate validation methods for has_one associations without :validate => true", async () => {
    assertNotRespondTo(pirate, "validateAssociatedRecordsFor_nonValidatedShip");
  });

  it("should generate validation methods for belongs_to associations with :validate => true", async () => {
    assertRespondTo(pirate, "validateAssociatedRecordsFor_parrot");
  });

  it("should not generate validation methods for belongs_to associations without :validate => true", async () => {
    assertNotRespondTo(pirate, "validateAssociatedRecordsFor_nonValidatedParrot");
  });

  it("should generate validation methods for HABTM associations with :validate => true", async () => {
    assertRespondTo(pirate, "validateAssociatedRecordsFor_parrots");
  });
});

describe("TestHasOneAutosaveAssociationWhichItselfHasAutosaveAssociations", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  fixtures([]);

  function makeModels() {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class GgPirate extends Base {
      declare catchphrase: string | null;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.hasOne("ship", { autosave: true, className: "GgShip", foreignKey: "pirate_id" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface GgPirate {
      get ship(): GgShip | null | Promise<GgShip | null>;
      set ship(value: GgShip | null);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class GgShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
        this.hasOne("part", { autosave: true, className: "GgPart", foreignKey: "ship_id" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface GgShip {
      get part(): GgPart | null | Promise<GgPart | null>;
      set part(value: GgPart | null);
    }
    class GgPart extends Base {
      declare name: string | null;
      declare ship_id: number | null;

      static {
        this._tableName = "ship_parts";
        this.attribute("name", "string");
        this.attribute("ship_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    registerModel("GgPirate", GgPirate);
    registerModel("GgShip", GgShip);
    registerModel("GgPart", GgPart);
    return { Pirate: GgPirate, Ship: GgShip, Part: GgPart };
  }

  it("when great-grandchild marked_for_destruction, saving parent should destroy great-grandchild", async () => {
    const { Pirate, Ship, Part } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const part = await Part.create({ name: "Mast", ship_id: ship.id });
    part.markForDestruction();
    cacheAssoc(ship, "part", part);
    ship.name = "Pearl-touched";
    cacheAssoc(pirate, "ship", ship);
    await pirate.save();
    expect(part.isDestroyed()).toBe(true);
  });

  it("when great-grandchild added, saving parent should create great-grandchild", async () => {
    const { Pirate, Ship, Part } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const newPart = new Part({ name: "Rudder" });
    cacheAssoc(ship, "part", newPart);
    ship.name = "Pearl-touched";
    cacheAssoc(pirate, "ship", ship);
    await pirate.save();
    expect(newPart.isNewRecord()).toBe(false);
  });

  it("when extra records exist for associations, validate should not load them up", async () => {
    const { Pirate, Ship, Part } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "Pearl" });
    cacheAssoc(pirate, "ship", ship);
    const part = new Part({ name: "Mast" });
    cacheAssoc(ship, "part", part);
    await pirate.save();
    part.name = "changed";
    await Part.create({ name: "Stern", ship_id: ship.id });
    await assertNoQueries(false, async () => {
      await pirate.isValid();
    });
  });
});

describe("TestDefaultAutosaveAssociationOnNewRecord", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Account);
    registerModel(CanonicalPost);
    registerModel(PostWithAfterCreateCallback);
    registerModel(CanonicalComment);
    registerModel(Author);
    registerModel(CanonicalCategory);
  });
  it("autosave new record on belongs to can be disabled per relationship", async () => {
    let newAccount = new Account({ credit_limit: 1000 }) as any;
    const newFirm = new Firm({ name: "some firm" });

    assertNotPredicate(newFirm, (r) => r.isPersisted());
    newAccount.firm = newFirm;
    await newAccount.saveBang();

    assertPredicate(newFirm, (r) => r.isPersisted());

    newAccount = new Account({ credit_limit: 1000 });
    const newAutosavedFirm = new Firm({ name: "some firm" });

    assertNotPredicate(newAutosavedFirm, (r) => r.isPersisted());
    newAccount.unautosavedFirm = newAutosavedFirm;
    await newAccount.saveBang();

    assertNotPredicate(newAutosavedFirm, (r) => r.isPersisted());
  });

  it("autosave new record on has one can be disabled per relationship", async () => {
    let firm = new Firm({ name: "some firm" }) as any;
    let account = new Account({ credit_limit: 1000 });

    assertNotPredicate(account, (r) => r.isPersisted());
    await firm.setAccount(account);
    await firm.saveBang();

    assertPredicate(account, (r) => r.isPersisted());

    firm = new Firm({ name: "some firm" });
    account = new Account({ credit_limit: 1000 });

    await firm.setUnautosavedAccount(account);

    assertNotPredicate(account, (r) => r.isPersisted());
    await firm.setUnautosavedAccount(account);
    await firm.saveBang();

    assertNotPredicate(account, (r) => r.isPersisted());
  });

  it("autosave new record on has many can be disabled per relationship", async () => {
    let firm = new Firm({ name: "some firm" });
    let account = new Account({ credit_limit: 1000 });

    assertNotPredicate(account, (r) => r.isPersisted());
    await firm.accounts.push(account);

    await firm.saveBang();
    assertPredicate(account, (r) => r.isPersisted());

    firm = new Firm({ name: "some firm" });
    account = new Account({ credit_limit: 1000 });

    assertNotPredicate(account, (r) => r.isPersisted());
    await firm.unautosavedAccounts.push(account);

    await firm.saveBang();
    assertNotPredicate(account, (r) => r.isPersisted());
  });

  it("autosave new record with after create callback", async () => {
    const post = new PostWithAfterCreateCallback({ title: "Captain Murphy", body: "is back" });
    (post as any).comments.build({ body: "foo" });
    await post.saveBang();

    expect((post as any).author_id).not.toBeNull();
  });

  it("autosave new record with after create callback and habtm association", async () => {
    const post = new PostWithAfterCreateCallback({ title: "Captain Murphy", body: "is back" });
    (post as any).comments.build({ body: "foo" });
    (post as any).categories.build({ name: "bar" });
    await post.saveBang();

    expect(await (await (post as any).categories.reload()).length()).toEqual(1);
  });
});

describe("TestAutosaveAssociationValidationsOnAHasManyAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    registerModel(Author);
    registerModel(Book);
    registerModel(PublishedBook);
    registerModel(FamousPirate);
    registerModel(FamousShip);
  });

  let pirate: any;
  let author: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    await pirate.birds.create({ name: "cookoo" });

    author = new Author({ name: "DHH" });
    author.publishedBooks.build({ name: "Rework", isbn: "1234" });
    author.publishedBooks.build({ name: "Remote", isbn: "1234" });
  });

  it("should automatically validate associations", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    for (const bird of await pirate.birds) bird.name = "";

    assertNotPredicate(await pirate.isValid(), (v) => v);
  });

  it("rollbacks whole transaction and raises ActiveRecord::RecordInvalid when associations fail to #save! due to uniqueness validation failure", async () => {
    const authorCountBeforeSave = Number(await Author.count());
    const bookCountBeforeSave = Number(await Book.count());

    await assertNoDifference(
      async () => Number(await Author.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await Book.count()),
          null,
          async () => {
            const exception = await assertRaises([RecordInvalid], {}, () => author.saveBang());

            expect(exception.message).toEqual("Validation failed: Published books is invalid");
          },
        );
      },
    );

    expect(Number(await Author.count())).toEqual(authorCountBeforeSave);
    expect(Number(await Book.count())).toEqual(bookCountBeforeSave);
  });

  it("rollbacks whole transaction when associations fail to #save due to uniqueness validation failure", async () => {
    const authorCountBeforeSave = Number(await Author.count());
    const bookCountBeforeSave = Number(await Book.count());

    await assertNoDifference(
      async () => Number(await Author.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await Book.count()),
          null,
          async () => {
            await assertNothingRaised(async () => {
              const result = await author.save();

              assertNot(result);
            });
          },
        );
      },
    );

    expect(Number(await Author.count())).toEqual(authorCountBeforeSave);
    expect(Number(await Book.count())).toEqual(bookCountBeforeSave);
  });

  it("validations still fire on unchanged association with custom validation context", async () => {
    const pirate = (await FamousPirate.createBang({ catchphrase: "Avast Ye!" })) as any;
    await pirate.famousShips.createBang();

    assertPredicate(await pirate.isValid(), (v) => v);
    assertNot(await pirate.isValid("conference"));
  });
});

describe("TestAutosaveAssociationValidationsOnAHasOneAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
    registerModel(Developer);
  });

  let pirate: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    await pirate.createShip({ name: "titanic" });
  });

  it("should automatically validate associations with :validate => true", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    (await pirate.ship).name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);
  });

  it("should not automatically add validate associations without :validate => true", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    (await pirate.nonValidatedShip).name = "";
    assertPredicate(await pirate.isValid(), (v) => v);
  });
});

describe("TestAutosaveAssociationValidationsOnABelongsToAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalParrot);
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Account);
  });

  let pirate: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
  });

  it("should automatically validate associations with :validate => true", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    pirate.parrot = new CanonicalParrot({ name: "" });
    assertNotPredicate(await pirate.isValid(), (v) => v);
  });

  it("should not automatically validate associations without :validate => true", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    pirate.nonValidatedParrot = new CanonicalParrot({ name: "" });
    assertPredicate(await pirate.isValid(), (v) => v);
  });

  it("validations still fire on unchanged association with custom validation context", async () => {
    const firmWithLowCredit = await Firm.createBang({
      name: "Something",
      account: new Account({ credit_limit: 50 }),
    });

    assertPredicate(await firmWithLowCredit.isValid(), (v) => v);
    assertNot(await firmWithLowCredit.isValid("bankLoan"));
  });
});

describe("TestAutosaveAssociationOnAHasOneThroughAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(Organization);
    registerModel(Member);
    registerModel(MemberDetail);
    registerModel(Author);
    registerModel(CanonicalPost);
    registerModel(CanonicalComment);
    registerModel(FirstPost);
  });

  async function createMemberWithOrganization() {
    const organization = await Organization.create();
    const member = await Member.create();
    await MemberDetail.create({ organization, member });

    return member;
  }

  it("should not has one through model", async () => {
    const member = (await createMemberWithOrganization()) as any;

    const organization = await member.organization;
    const save = organization.save.bind(organization);
    organization.save = async (options?: any) => {
      await save(options);
      throw new Error("Oh noes!");
    };
    await assertNothingRaised(() => member.save());
  });

  async function createAuthorWithPostWithComment() {
    await Author.createBang({ name: "David" });
    const author = await Author.createBang({ name: "Sergiy" });
    const post = await CanonicalPost.createBang({ author, title: "foo", body: "bar" });
    await CanonicalComment.createBang({ post, body: "cool comment" });

    return author;
  }

  it("should not reversed has one through model", async () => {
    const author = (await createAuthorWithPostWithComment()) as any;

    const comment = (await author.commentOnFirstPost) ?? Object.create(null);
    const save = comment.save?.bind(comment);
    comment.save = async (options?: any) => {
      await save?.(options);
      throw new Error("Oh noes!");
    };
    await assertNothingRaised(() => author.save());
  });
});

describe("TestAutosaveAssociationValidationsOnAHABTMAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalParrot);
  });

  let pirate: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
  });

  it("should automatically validate associations with :validate => true", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    await pirate.parrots.replace([new CanonicalParrot({ name: "popuga" })]);
    for (const parrot of await pirate.parrots) parrot.name = "";
    assertNotPredicate(await pirate.isValid(), (v) => v);
  });

  it("should not automatically validate associations without :validate => true", async () => {
    assertPredicate(await pirate.isValid(), (v) => v);
    await pirate.nonValidatedParrots.replace([new CanonicalParrot({ name: "popuga" })]);
    for (const parrot of await pirate.nonValidatedParrots) parrot.name = "";
    assertPredicate(await pirate.isValid(), (v) => v);
  });
});

describe("TestAutosaveAssociationOnAHasManyAssociationWithInverse", () => {
  fixtures([]);

  function makeModels() {
    class Post extends Base {
      declare title: string | null;
      declare body: string | null;
      declare comments: AssociationProxy<Comment>;

      static {
        this._tableName = "posts";
        this.attribute("title", "string");
        this.attribute("body", "string");
        this.hasMany("comments", { className: "AscbPostComment", inverseOf: "post" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class Comment extends Base {
      declare body: string | null;
      declare post_id: number | null;

      postCommentsCount?: number;
      static {
        this._tableName = "comments";
        this.attribute("body", "string");
        this.attribute("post_id", "integer");
        this.belongsTo("post", { className: "AscbInversePost", inverseOf: "comments" });
        this.afterSave(async (record: Comment) => {
          record.postCommentsCount = await (record as any).post.comments.count();
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface Comment {
      get post(): Post | null | Promise<Post | null>;
      set post(value: Post | null);
    }
    registerModel("AscbInversePost", Post);
    registerModel("AscbPostComment", Comment);
    return { Post, Comment };
  }

  it("after save callback with autosave", async () => {
    const { Post } = makeModels();
    const post: any = new Post({ title: "Test", body: "..." });
    const comment = post.association("comments").build({ body: "..." });
    await post.saveBang();

    expect(await post.comments.count()).toBe(1);
    expect(comment.postCommentsCount).toBe(1);
  });
});

describe("TestAutosaveAssociationOnABelongsToAssociationDefinedAsRecord", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(Translation);
    registerModel(Attachment);
    registerModel(Author);
  });

  it("should not raise error", async () => {
    const translation = (await Translation.create({
      locale: "fr",
      key: "bread",
      value: "Baguette \u{1F956}",
    })) as any;
    const author = await Author.create({ name: "Dorian Marié" });
    translation.buildAttachment({ record: author });
    await assertNothingRaised(() => translation.saveBang());
  });
});

describe("TestAutosaveAssociationWithTouch", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(Invoice);
    registerModel(LineItem);
  });

  it("autosave with touch should not raise system stack error", async () => {
    const invoice = await Invoice.create();
    await assertNothingRaised(() => invoice.lineItems.create({ amount: 10 }));
  });
});
describe("TestAutosaveAssociationOnAHasManyAssociationDefinedInSubclassWithAcceptsNestedAttributes", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel("Company", CanonicalCompany);
    registerModel("Firm", Firm);
    registerModel("Agency", Agency);
    registerModel("Project", Project);
  });

  it("should update children when association redefined in subclass", async () => {
    const agency = await Agency.createBang({ name: "Agency" });
    const validProject = await Project.createBang({ firm: agency, name: "Initial" });
    await agency.updateBang({
      projectsAttributes: {
        "0": {
          name: "Updated",
          id: validProject.id,
        },
      },
    });
    await validProject.reload();

    expect((validProject as any).name).toBe("Updated");
  });
});

describe("TestAutosaveAssociationOnAHasManyAssociation", () => {
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    registerModel(CanonicalParrot);
    registerModel(CanonicalShip);
  });

  const associationName = "birds";
  const associatedModelName = "bird";
  let pirate: any;
  let child1: any;

  beforeEach(async () => {
    pirate = await CanonicalPirate.create({
      catchphrase: "Don' botharrr talkin' like one, savvy?",
    });
    child1 = await pirate.birds.create({ name: "Posideons Killer" });
    await pirate.birds.create({ name: "Killer bandita Dionne" });
  });

  it("should automatically save the associated models", async () => {
    const newNames = ["Grace OMalley", "Privateers Greed"];
    (await pirate[associationName]).forEach((child: any, i: number) => {
      child.name = newNames[i];
    });

    await pirate.save();
    expect((await (await pirate.reload())[associationName]).map((c: any) => c.name).sort()).toEqual(
      [...newNames].sort(),
    );
  });

  it("should automatically save bang the associated models", async () => {
    const newNames = ["Grace OMalley", "Privateers Greed"];
    (await pirate[associationName]).forEach((child: any, i: number) => {
      child.name = newNames[i];
    });

    await pirate.saveBang();
    expect((await (await pirate.reload())[associationName]).map((c: any) => c.name).sort()).toEqual(
      [...newNames].sort(),
    );
  });

  it("should update children when autosave is true and parent is new but child is not", async () => {
    const parrot = await CanonicalParrot.createBang({ name: "Polly" });
    parrot.name = "Squawky";
    const pirate = new CanonicalPirate({ parrots: [parrot], catchphrase: "Arrrr" });

    await pirate.saveBang();

    expect((await parrot.reload()).name).toEqual("Squawky");
  });

  it("should not update children when parent creation with no reason", async () => {
    const parrot = (await CanonicalParrot.createBang({ name: "Polly" })) as any;
    expect(parrot.updated_count).toEqual(0);

    const newPirate = new CanonicalPirate({ catchphrase: "Arrrr" });
    await newPirate.setAttributes({ parrotIds: [parrot.id] });
    await newPirate.saveBang();
    expect((await parrot.reload()).updated_count).toEqual(0);
  });

  it("should automatically validate the associated models", async () => {
    for (const child of await pirate[associationName]) child.name = "";

    assertNotPredicate(await pirate.isValid(), (v) => v);
    expect(pirate.errors.get(`${associationName}.name`)).toEqual(["can't be blank"]);
    assertEmpty(pirate.errors.get(associationName));
  });

  it("should not use default invalid error on associated models", async () => {
    pirate[associationName].build({ name: "" });

    assertNotPredicate(await pirate.isValid(), (v) => v);
    expect(pirate.errors.get(`${associationName}.name`)).toEqual(["can't be blank"]);
    assertEmpty(pirate.errors.get(associationName));
  });

  it("should default invalid error from i18n", async () => {
    I18n.backend().storeTranslations("en", {
      activerecord: { errors: { models: { [associatedModelName]: { blank: "cannot be blank" } } } },
    });
    try {
      pirate[associationName].build({ name: "" });

      assertNotPredicate(await pirate.isValid(), (v) => v);
      expect(pirate.errors.get(`${associationName}.name`)).toEqual(["cannot be blank"]);
      expect(pirate.errors.fullMessages).toEqual([
        `${humanize(associationName)} name cannot be blank`,
      ]);
      assertEmpty(pirate.errors.get(associationName));
    } finally {
      resetI18n();
    }
  });

  it("should merge errors on the associated models onto the parent even if it is not valid", async () => {
    for (const child of await pirate[associationName]) child.name = "";
    pirate.catchphrase = null;

    assertNotPredicate(await pirate.isValid(), (v) => v);
    expect(pirate.errors.get(`${associationName}.name`)).toEqual(["can't be blank"]);
    assertPredicate(pirate.errors.get("catchphrase"), (e: string[]) => e.length > 0);
  });

  it("should allow to bypass validations on the associated models on update", async () => {
    pirate.catchphrase = "";
    for (const child of await pirate[associationName]) child.name = "";

    assert(await pirate.save({ validate: false }));
    expect([
      (await pirate.reload()).catchphrase,
      (await pirate[associationName].first()).name,
      (await pirate[associationName].last()).name,
    ]).toEqual(["", "", ""]);
  });

  it("should validation the associated models on create", async () => {
    await assertNoDifference(
      async () => Number(await CanonicalBird.count()),
      null,
      async () => {
        for (let i = 0; i < 2; i++) pirate[associationName].build();
        await pirate.save();
      },
    );
  });

  it("should allow to bypass validations on the associated models on create", async () => {
    await assertDifference(
      async () => Number(await CanonicalBird.count()),
      2,
      null,
      async () => {
        for (let i = 0; i < 2; i++) pirate[associationName].build();
        await pirate.save({ validate: false });
      },
    );
  });

  it("should not save and return false if a callback cancelled saving in either create or update", async () => {
    pirate.catchphrase = "Changed";
    child1.name = "Changed";
    child1.cancelSaveFromCallback = true;

    assertNot(await pirate.save());
    expect((await pirate.reload()).catchphrase).toEqual("Don' botharrr talkin' like one, savvy?");
    expect((await child1.reload()).name).toEqual("Posideons Killer");

    const newPirate = new CanonicalPirate({ catchphrase: "Arr" }) as any;
    const newChild = newPirate[associationName].build({ name: "Grace OMalley" });
    newChild.cancelSaveFromCallback = true;

    await assertNoDifference(
      async () => Number(await CanonicalPirate.count()),
      null,
      async () => {
        await assertNoDifference(
          async () => Number(await newChild.constructor.count()),
          null,
          async () => {
            assertNot(await newPirate.save());
          },
        );
      },
    );
  });

  it("should rollback any changes if an exception occurred while saving", async () => {
    const before = [pirate.catchphrase, ...(await pirate[associationName]).map((c: any) => c.name)];
    const newNames = ["Grace OMalley", "Privateers Greed"];

    pirate.catchphrase = "Arr";
    (await pirate[associationName]).forEach((child: any, i: number) => {
      child.name = newNames[i];
    });

    const first = await pirate[associationName].first();
    const save = first.save.bind(first);
    first.save = async (options?: any) => {
      await save(options);
      throw new Error("Oh noes!");
    };

    await assertRaise([Error], {}, async () => assertNot(await pirate.save()));
    expect([
      (await pirate.reload()).catchphrase,
      ...(await pirate[associationName]).map((c: any) => c.name),
    ]).toEqual(before);
  });

  it("should still raise an ActiveRecordRecord Invalid exception if we want that", async () => {
    for (const child of await pirate[associationName]) child.name = "";
    await assertRaise([RecordInvalid], {}, () => pirate.saveBang());
  });

  it("should not load the associated models if they were not loaded yet", async () => {
    await assertQueriesCount(3, false, async () => {
      pirate.catchphrase = "Arr";
      await pirate.saveBang();
    });

    await pirate[associationName].loadTarget();

    await assertQueriesCount(5, false, async () => {
      pirate.catchphrase = "Yarr";
      const newNames = ["Grace OMalley", "Privateers Greed"];
      (await pirate[associationName]).forEach((child: any, i: number) => {
        child.name = newNames[i];
      });
      await pirate.saveBang();
    });
  });
});

describe("ChangedForAutosaveTest", () => {
  fixtures([]);

  it("parent is changed_for_autosave when nested autosave child is changed", () => {
    class Child extends Base {
      declare name: string | null;

      static {
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }
    class Parent extends Base {
      static {
        this.attribute("id", "integer");
        this.hasMany("children", { autosave: true, className: "ChangedChild" });
      }
    }
    registerModel("ChangedParent", Parent);
    registerModel("ChangedChild", Child);

    const parent = new Parent({ id: 1 });
    (parent as any)._newRecord = false;
    const child = new Child({ id: 10, name: "original" });
    (child as any)._newRecord = false;
    (child as any).changesApplied();
    child.writeAttribute("name", "modified");

    parent.association("children").setTarget([child] as any);

    expect(parent.changedForAutosave()).toBe(true);
  });

  it("parent is changed_for_autosave when nested child is marked for destruction", () => {
    class Child2 extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    class Parent2 extends Base {
      static {
        this.attribute("id", "integer");
        this.hasOne("child", { autosave: true, className: "ChangedChild2" });
      }
    }
    registerModel("ChangedParent2", Parent2);
    registerModel("ChangedChild2", Child2);

    const parent = new Parent2({ id: 1 });
    (parent as any)._newRecord = false;
    const child = new Child2({ id: 10 });
    (child as any)._newRecord = false;
    child.markForDestruction();

    parent.association("child").setTarget(child as any);

    expect(parent.changedForAutosave()).toBe(true);
  });

  it("does not infinite loop on cyclic inverse associations", () => {
    class A extends Base {
      static {
        this.attribute("id", "integer");
        this.hasOne("b", { autosave: true, className: "CycleB" });
      }
    }
    class B extends Base {
      static {
        this.attribute("id", "integer");
        this.belongsTo("a", { autosave: true, className: "CycleA" });
      }
    }
    registerModel("CycleA", A);
    registerModel("CycleB", B);

    const a = new A({ id: 1 });
    (a as any)._newRecord = false;
    (a as any).changesApplied();
    const b = new B({ id: 2 });
    (b as any)._newRecord = false;
    (b as any).changesApplied();

    a.association("b").setTarget(b as any);
    b.association("a").setTarget(a as any);

    expect(a.changedForAutosave()).toBe(false);
    expect(b.changedForAutosave()).toBe(false);
  });
});

describe("autosaveHasOne queryConstraints PK/FK pairing", () => {
  fixtures([]);
  it("pairs queryConstraintsList PK with explicit composite FK on QC owner", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class QcOwner extends Base {
      declare tree_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        (this as any)._queryConstraintsList = ["tree_id", "id"];
        (this as any)._hasQueryConstraints = true;
        this.hasOne("qcChild", {
          className: "QcChild",
          foreignKey: ["tree_id", "parent_id"],
          autosave: true,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface QcOwner {
      get qcChild(): QcChild | null | Promise<QcChild | null>;
      set qcChild(value: QcChild | null);
    }
    class QcChild extends Base {
      declare tree_id: number | null;
      declare parent_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("parent_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("QcOwner", QcOwner);
    registerModel("QcChild", QcChild);
    const owner = new QcOwner({ tree_id: 5, id: 11, name: "Corp" });
    const child = new QcChild({ name: "Doc" });
    owner.association("qcChild").setTarget(child as any);
    const saved = await owner.save();
    expect(saved).toBe(true);
    expect(child.isNewRecord()).toBe(false);
    expect(child.tree_id).toBe(5);
    expect(child.parent_id).toBe(11);
  });

  it("does not collapse QC-derived PK array via the 'id' rule for scalar FK", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class QcNoCollapse extends Base {
      declare tree_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        (this as any)._queryConstraintsList = ["tree_id", "id"];
        (this as any)._hasQueryConstraints = true;
        this.hasOne("qcNoCollapseChild", {
          className: "QcNoCollapseChild",
          foreignKey: ["tree_id", "parent_id"],
          autosave: true,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface QcNoCollapse {
      get qcNoCollapseChild(): QcNoCollapseChild | null | Promise<QcNoCollapseChild | null>;
      set qcNoCollapseChild(value: QcNoCollapseChild | null);
    }
    class QcNoCollapseChild extends Base {
      declare tree_id: number | null;
      declare parent_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("parent_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("QcNoCollapse", QcNoCollapse);
    registerModel("QcNoCollapseChild", QcNoCollapseChild);
    const owner = new QcNoCollapse({ tree_id: 9, id: 77, name: "v" });
    const child = new QcNoCollapseChild({ name: "l" });
    owner.association("qcNoCollapseChild").setTarget(child as any);
    const saved = await owner.save();
    expect(saved).toBe(true);
    expect(child.isNewRecord()).toBe(false);
    expect(child.tree_id).toBe(9);
    expect(child.parent_id).toBe(77);
  });

  it("uses queryConstraintsList as PK when class has_query_constraints? and scalar FK", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class QcTenant extends Base {
      declare tree_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        (this as any)._queryConstraintsList = ["tree_id", "id"];
        (this as any)._hasQueryConstraints = true;
        this.hasOne("qcTenantRecord", {
          className: "QcTenantRecord",
          foreignKey: "parent_id",
          autosave: true,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface QcTenant {
      get qcTenantRecord(): QcTenantRecord | null | Promise<QcTenantRecord | null>;
      set qcTenantRecord(value: QcTenantRecord | null);
    }
    class QcTenantRecord extends Base {
      declare tree_id: number | null;
      declare parent_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("parent_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("QcTenant", QcTenant);
    registerModel("QcTenantRecord", QcTenantRecord);
    const tenant = new QcTenant({ tree_id: 7, id: 42, name: "Acme" });
    const rec = new QcTenantRecord({ name: "hello" });
    tenant.association("qcTenantRecord").setTarget(rec as any);
    const saved = await tenant.save();
    expect(saved).toBe(true);
    expect(rec.isNewRecord()).toBe(false);
    expect(rec.parent_id).toBe(42);
  });
});

describe("computePrimaryKey", () => {
  function makeRecord(opts: {
    primaryKey?: string | string[];
    queryConstraintsList?: string[];
    hasQueryConstraints?: boolean;
  }): any {
    return {
      constructor: {
        primaryKey: opts.primaryKey ?? "id",
        _queryConstraintsList: opts.queryConstraintsList ?? null,
        _hasQueryConstraints: opts.hasQueryConstraints ?? false,
      },
    };
  }

  it("returns explicit reflection primaryKey option as-is", () => {
    const record = makeRecord({ primaryKey: "id" });
    const result = computePrimaryKey({ options: { primaryKey: "custom_id" } }, record);
    expect(result).toBe("custom_id");
  });

  it("returns class-level queryConstraintsList when reflection has queryConstraints option", () => {
    const record = makeRecord({
      primaryKey: "id",
      queryConstraintsList: ["tenant_id", "id"],
      hasQueryConstraints: true,
    });
    const result = computePrimaryKey({ options: { queryConstraints: true } }, record);
    expect(result).toEqual(["tenant_id", "id"]);
  });

  it("returns queryConstraintsList when record class has_query_constraints? and no FK option", () => {
    const record = makeRecord({
      primaryKey: "id",
      queryConstraintsList: ["shop_id", "id"],
      hasQueryConstraints: true,
    });
    const result = computePrimaryKey({ options: {} }, record);
    expect(result).toEqual(["shop_id", "id"]);
  });

  it("does not use queryConstraintsList when reflection has explicit foreignKey option", () => {
    const record = makeRecord({
      primaryKey: "id",
      queryConstraintsList: ["shop_id", "id"],
      hasQueryConstraints: true,
    });
    const result = computePrimaryKey(
      {
        options: { foreignKey: "order_id" },
      },
      record,
    );
    expect(result).toBe("id");
  });

  it("collapses CPK to 'id' when composite PK includes id and no queryConstraints", () => {
    const record = makeRecord({ primaryKey: ["shop_id", "id"] });
    const result = computePrimaryKey({ options: {} }, record);
    expect(result).toBe("id");
  });

  it("returns full composite PK when CPK has no 'id' column", () => {
    const record = makeRecord({ primaryKey: ["shop_id", "status"] });
    const result = computePrimaryKey({ options: {} }, record);
    expect(result).toEqual(["shop_id", "status"]);
  });

  it("returns class primary key for non-composite, non-constrained record", () => {
    const record = makeRecord({ primaryKey: "id" });
    const result = computePrimaryKey({ options: {} }, record);
    expect(result).toBe("id");
  });
});
