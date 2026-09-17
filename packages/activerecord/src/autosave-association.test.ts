import { indexNestedAttributeErrors, setIndexNestedAttributeErrors } from "./active-record.js";
import { kernelThrow } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { SingularAssociation } from "./associations/singular-association.js";
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import { I18n, Error as ModelError } from "@blazetrails/activemodel";
import { Base, registerModel, acceptsNestedAttributesFor, RecordInvalid } from "./index.js";
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
import { Pirate as CanonicalPirate } from "./test-helpers/models/pirate.js";
import {
  Prisoner,
  Ship as CanonicalShip,
  ShipWithoutNestedAttributes,
} from "./test-helpers/models/ship.js";
import { AuditLog, Developer } from "./test-helpers/models/developer.js";
import { Tag } from "./test-helpers/models/tag.js";
import { Tagging } from "./test-helpers/models/tagging.js";
import { Mouse } from "./test-helpers/models/mouse.js";
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
import { Post as CanonicalPost, PostWithAfterCreateCallback } from "./test-helpers/models/post.js";
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
  deepDup,
  getCallbackChains,
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
    const { Firm } = makeModels();
    const firm = await Firm.create({ name: "Acme" });
    const saved = await firm.save();
    expect(saved).toBe(true);
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
    const { Firm, Account } = makeModels();
    const firm = await Firm.create({ name: "Acme" });
    const account = await Account.create({ credit_limit: 600, firm_id: firm.id });
    cacheAssoc(firm, "account", account);
    await firm.save();
    expect(account.firm_id).toBe(firm.id);
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
  const { tags, posts } = fixtures(["companies", "posts", "tags", "taggings"]);
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
    const { Customer, Order } = makeOrderModels();
    const numOrders = (await Order.count()) as number;
    const numCustomers = (await Customer.count()) as number;
    const order = new Order({});
    const customer = new Customer({ name: "C" });
    await setBilling(order, customer);
    await setShipping(order, customer);
    expect(await order.save()).toBe(true);
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    await order.reload();
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    expect(await Order.count()).toBe(numOrders + 1);
    expect(await Customer.count()).toBe(numCustomers + 1);
  });
  it("store association in two relations with one save in existing object", async () => {
    const { Customer, Order } = makeOrderModels();
    const numOrders = (await Order.count()) as number;
    const numCustomers = (await Customer.count()) as number;
    const order = await Order.create({});
    const customer = new Customer({ name: "C" });
    await setBilling(order, customer);
    await setShipping(order, customer);
    expect(await order.save()).toBe(true);
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    await order.reload();
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    expect(await Order.count()).toBe(numOrders + 1);
    expect(await Customer.count()).toBe(numCustomers + 1);
  });
  it("store association in two relations with one save in existing object with values", async () => {
    const { Customer, Order } = makeOrderModels();
    const numOrders = (await Order.count()) as number;
    const numCustomers = (await Customer.count()) as number;
    const order = await Order.create({});
    let customer = new Customer({ name: "C" });
    await setBilling(order, customer);
    await setShipping(order, customer);
    expect(await order.save()).toBe(true);
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    await order.reload();
    customer = new Customer({ name: "C2" });
    await setBilling(order, customer);
    await setShipping(order, customer);
    expect(await order.save()).toBe(true);
    await order.reload();
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    expect(await Order.count()).toBe(numOrders + 1);
    expect(await Customer.count()).toBe(numCustomers + 2);
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
    const { Author, Post } = makeModels();
    const author = await Author.create({ name: "Valid" });
    const post = await Post.create({ name: "Test", author_id: author.id });
    const saved = await post.save();
    expect(saved).toBe(true);
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
    const { Post } = makeModels();
    const post = await Post.create({ name: "Alone" });
    const saved = await post.save();
    expect(saved).toBe(true);
  });
});

describe("TestAutosaveAssociationOnABelongsToAssociation", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    setAssociationTarget(record, name, value);
  }
  fixtures([]);

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
  });

  function makeModels() {
    return { Pirate: CanonicalPirate, Ship: CanonicalShip };
  }

  it("should still work without an associated model", async () => {
    const { Ship } = makeModels();
    const ship = await Ship.create({ name: "Pearl" });
    ship.name = "The Vile Serpent";
    await ship.save();
    const reloaded = await Ship.find(ship.id);
    expect(reloaded.name).toBe("The Vile Serpent");
  });

  it("should automatically save the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = new Pirate({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "Pearl" });
    cacheAssoc(ship, "pirate", pirate);
    await ship.save();
    expect(pirate.isNewRecord()).toBe(false);
    expect(ship.pirate_id).toBe(pirate.id);
  });

  it("should automatically save bang the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    pirate.catchphrase = "Arr";
    cacheAssoc(ship, "pirate", pirate);
    await ship.saveBang();
    const reloaded = await Pirate.find(pirate.id);
    expect(reloaded.catchphrase).toBe("Arr");
  });

  it("should automatically validate the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = new Pirate({ catchphrase: "" });
    const ship = new Ship({ name: "Pearl" });
    cacheAssoc(ship, "pirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(false);
  });

  it("should merge errors on the associated model onto the parent even if it is not valid", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = new Pirate({ catchphrase: "" });
    const ship = new Ship({ name: "Pearl" });
    cacheAssoc(ship, "pirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(false);
    const errors = (ship as any).errors;
    expect(errors).toBeDefined();
  });

  it("should still allow to bypass validations on the associated model", async () => {
    class FlexPirate extends Base {
      declare catchphrase: string | null;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
      }
    }
    registerModel("FlexPirate", FlexPirate);
    class FlexShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
      }
    }
    registerModel("FlexShip", FlexShip);
    Associations.belongsTo.call(FlexShip, "flexPirate", {
      autosave: true,
      foreignKey: "pirate_id",
    });
    const pirate = new FlexPirate({ catchphrase: "" });
    const ship = new FlexShip({ name: "NoValidation" });
    cacheAssoc(ship, "flexPirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(true);
  });

  it("should still raise an ActiveRecordRecord Invalid exception if we want that", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    pirate.catchphrase = "";
    cacheAssoc(ship, "pirate", pirate);
    await expect(ship.saveBang()).rejects.toThrow(RecordInvalid);
  });
  it("should not save and return false if a callback cancelled saving", async () => {
    class CcShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
        this.beforeSave(function () {
          kernelThrow(":abort");
        });
      }
    }
    registerModel("CcShip", CcShip);
    const ship = new CcShip({ name: "Cancelled" });
    const saved = await ship.save();
    expect(saved).toBe(false);
    expect(ship.isNewRecord()).toBe(true);
  });
  it("should rollback any changes if an exception occurred while saving", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    pirate.catchphrase = "";
    ship.name = "Changed";
    cacheAssoc(ship, "pirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(false);
    const reloaded = await Ship.find(ship.id);
    expect(reloaded.name).toBe("Pearl");
  });

  it("should not load the associated model", async () => {
    const { Ship } = makeModels();
    const ship = await Ship.create({ name: "NoLoad" });
    const saved = await ship.save();
    expect(saved).toBe(true);
  });

  it("should save with non nullable foreign keys", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "FK", pirate_id: pirate.id });
    cacheAssoc(ship, "pirate", pirate);
    await ship.save();
    expect(ship.pirate_id).toBe(pirate.id);
  });

  it("should save if previously saved", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Saved", pirate_id: pirate.id });
    pirate.catchphrase = "Ahoy";
    cacheAssoc(ship, "pirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(true);
    const reloaded = await Pirate.find(pirate.id!);
    expect(reloaded.catchphrase).toBe("Ahoy");
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
    const oldCustomize = ModelError.i18nCustomizeFullMessage;
    ModelError.i18nCustomizeFullMessage = true;
    I18n.backend().storeTranslations("en", {
      activerecord: {
        errors: {
          models: {
            "index_errors_person/references": { format: "%{message}" },
          },
        },
      },
    });
    try {
      class IndexErrorsReference extends Base {
        declare favorite: boolean | null;
        declare job_id: number | null;
        declare person_id: number | null;

        static {
          this.attribute("favorite", "boolean");
          this.attribute("job_id", "integer");
          this.attribute("person_id", "integer");
          this.validate(function (record: any) {
            if (!record.favorite) record.errors.add("base", "should be favorite");
          });
          this.validates("job_id", { presence: true });
        }
      }
      class IndexErrorsPerson extends Base {
        declare name: string | null;
        declare references: AssociationProxy<IndexErrorsReference>;

        static {
          this._tableName = "people";
          this.attribute("name", "string");
          this.hasMany("references", {
            autosave: true,
            indexErrors: true,
            className: "IndexErrorsReference",
            foreignKey: "person_id",
          });
        }
      }
      registerModel("IndexErrorsPerson", IndexErrorsPerson);
      registerModel("IndexErrorsReference", IndexErrorsReference);

      const refValid = new IndexErrorsReference({ favorite: true, job_id: 1 });
      const refInvalid = new IndexErrorsReference({ favorite: false });
      const p = new IndexErrorsPerson({});
      cacheAssoc(p, "references", [refValid, refInvalid]);

      expect(await refValid.isValid()).toBe(true);
      expect(await refInvalid.isValid()).toBe(false);
      expect(await p.isValid()).toBe(false);
      expect(p.errors.fullMessages).toEqual(["should be favorite", "can't be blank"]);
    } finally {
      ModelError.i18nCustomizeFullMessage = oldCustomize;
      resetI18n();
    }
  });
  it("indexed errors on base attribute should be properly translated", async () => {
    I18n.backend().storeTranslations("en", {
      activerecord: {
        attributes: {
          base_errors_person: { reference: "Super reference" },
          reference: { base: "" },
        },
      },
    });
    try {
      class BaseErrorsReference extends Base {
        declare favorite: boolean | null;
        declare job_id: number | null;
        declare person_id: number | null;

        static {
          this.attribute("favorite", "boolean");
          this.attribute("job_id", "integer");
          this.attribute("person_id", "integer");
          this.validate(function (record: any) {
            if (!record.favorite) record.errors.add("base", "should be favorite");
          });
          this.validates("job_id", { presence: true });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      class BaseErrorsPerson extends Base {
        declare name: string | null;

        static {
          this._tableName = "people";
          this.attribute("name", "string");
          this.validates("reference", { presence: true });
          this.hasOne("reference", {
            autosave: true,
            className: "BaseErrorsReference",
            foreignKey: "person_id",
          });
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
      interface BaseErrorsPerson {
        get reference(): BaseErrorsReference | null | Promise<BaseErrorsReference | null>;
        set reference(value: BaseErrorsReference | null);
      }
      registerModel("BaseErrorsPerson", BaseErrorsPerson);
      registerModel("BaseErrorsReference", BaseErrorsReference);

      const p = new BaseErrorsPerson({});
      expect(await p.isValid()).toBe(false);
      expect(p.errors.fullMessages).toEqual(["Super reference can't be blank"]);

      const refInvalid = new BaseErrorsReference({ favorite: false });
      cacheAssoc(p, "reference", refInvalid);
      expect(await refInvalid.isValid()).toBe(false);
      expect(await p.isValid()).toBe(false);
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

  it("should generate validation methods for has_many associations", async () => {
    class VmParent extends Base {
      declare name: string | null;
      declare vmChildren: AssociationProxy<VmChild>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("vmChildren", {
          className: "VmChild",
          foreignKey: "author_id",
          validate: true,
        });
      }
    }
    class VmChild extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    registerModel("VmParent", VmParent);
    registerModel("VmChild", VmChild);
    const parent = await VmParent.create({ name: "P" });
    const child = new VmChild({ name: "" });
    cacheAssoc(parent, "vmChildren", [child]);
    expect(await parent.isValid()).toBe(false);
  });

  it("should generate validation methods for has_one associations with :validate => true", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class VoParent extends Base {
      declare name: string | null;

      static {
        this._tableName = "companies";
        this.attribute("name", "string");
        this.hasOne("voChild", {
          className: "VoChild",
          foreignKey: "author_id",
          validate: true,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface VoParent {
      get voChild(): VoChild | null | Promise<VoChild | null>;
      set voChild(value: VoChild | null);
    }
    class VoChild extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    registerModel("VoParent", VoParent);
    registerModel("VoChild", VoChild);
    const parent = await VoParent.create({ name: "P" });
    const child = new VoChild({ name: "" });
    cacheAssoc(parent, "voChild", child);
    expect(await parent.isValid()).toBe(false);
  });

  it("should not generate validation methods for has_one associations without :validate => true", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class NvParent extends Base {
      declare name: string | null;

      static {
        this._tableName = "companies";
        this.attribute("name", "string");
        this.hasOne("nvChild", {
          className: "NvChild",
          foreignKey: "author_id",
          validate: false,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface NvParent {
      get nvChild(): NvChild | null | Promise<NvChild | null>;
      set nvChild(value: NvChild | null);
    }
    class NvChild extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    registerModel("NvParent", NvParent);
    registerModel("NvChild", NvChild);
    const parent = await NvParent.create({ name: "P" });
    const child = new NvChild({ name: "" });
    cacheAssoc(parent, "nvChild", child);
    expect(await parent.isValid()).toBe(true);
  });

  it("should generate validation methods for belongs_to associations with :validate => true", async () => {
    class BvOwner extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class BvChild extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.belongsTo("bvOwner", {
          className: "BvOwner",
          foreignKey: "author_id",
          validate: true,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface BvChild {
      get bvOwner(): BvOwner | null | Promise<BvOwner | null>;
      set bvOwner(value: BvOwner | null);
    }
    registerModel("BvOwner", BvOwner);
    registerModel("BvChild", BvChild);
    const child = await BvChild.create({ name: "ok" });
    const owner = new BvOwner({ name: "" });
    cacheAssoc(child, "bvOwner", owner);
    expect(await child.isValid()).toBe(false);
  });

  it("should not generate validation methods for belongs_to associations without :validate => true", async () => {
    class NbOwner extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class NbChild extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.belongsTo("nbOwner", {
          className: "NbOwner",
          foreignKey: "author_id",
          validate: false,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface NbChild {
      get nbOwner(): NbOwner | null | Promise<NbOwner | null>;
      set nbOwner(value: NbOwner | null);
    }
    registerModel("NbOwner", NbOwner);
    registerModel("NbChild", NbChild);
    const child = await NbChild.create({ name: "ok" });
    const owner = new NbOwner({ name: "" });
    cacheAssoc(child, "nbOwner", owner);
    expect(await child.isValid()).toBe(true);
  });

  it("should generate validation methods for HABTM associations with :validate => true", async () => {
    class HvParent extends Base {
      declare catchphrase: string | null;
      declare hvTags: AssociationProxy<HvTag>;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.hasAndBelongsToMany("hvTags", {
          className: "HvTag",
          joinTable: "parrots_pirates",
          foreignKey: "pirate_id",
          associationForeignKey: "parrot_id",
          validate: true,
        });
      }
    }
    class HvTag extends Base {
      declare name: string | null;

      static {
        this._tableName = "parrots";
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    registerModel("HvParent", HvParent);
    registerModel("HvTag", HvTag);
    const parent = await HvParent.create({ catchphrase: "P" });
    const tag = new HvTag({ name: "" });
    cacheAssoc(parent, "hvTags", [tag]);
    expect(await parent.isValid()).toBe(false);
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
  fixtures(["pirates", "ships"]);
  it("should automatically validate associations", async () => {
    class Item extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const item = new Item({ name: "" });
    const valid = await item.isValid();
    expect(valid).toBe(false);
  });
  it("validations still fire on unchanged association with custom validation context", async () => {
    const { FamousPirate } = await import("./test-helpers/models/pirate.js");
    const { FamousShip } = await import("./test-helpers/models/ship.js");
    registerModel("FamousPirate", FamousPirate as never);
    registerModel("FamousShip", FamousShip as never);

    const pirate = (await FamousPirate.createBang({ catchphrase: "Avast Ye!" })) as any;
    await pirate.famousShips.createBang({});

    expect(await pirate.isValid()).toBe(true);
    expect(await pirate.isValid("conference")).toBe(false);
  });
});

describe("TestAutosaveAssociationValidationsOnAHasManyAssociation", () => {
  fixtures([]);

  let AuthorM: typeof Base;
  let BookM: typeof Base;
  let PublishedBookM: typeof Base;

  beforeAll(async () => {
    AuthorM = (await import("./test-helpers/models/author.js")).Author as never;
    const bookMod = await import("./test-helpers/models/book.js");
    BookM = bookMod.Book as never;
    PublishedBookM = bookMod.PublishedBook as never;
    registerModel("Author", AuthorM);
    registerModel("Book", BookM);
    registerModel("PublishedBook", PublishedBookM);
  });

  const buildAuthor = (): Base => {
    const author = new AuthorM({ name: "DHH" });
    (author as any).publishedBooks.build({ name: "Rework", isbn: "1234" });
    (author as any).publishedBooks.build({ name: "Remote", isbn: "1234" });
    return author;
  };

  it("rollbacks whole transaction and raises ActiveRecord::RecordInvalid when associations fail to #save! due to uniqueness validation failure", async () => {
    const authorCountBefore = await AuthorM.count();
    const bookCountBefore = await BookM.count();
    const author = buildAuthor();

    await expect(author.saveBang()).rejects.toMatchObject({
      message: "Validation failed: Published books is invalid",
    });

    expect(await AuthorM.count()).toBe(authorCountBefore);
    expect(await BookM.count()).toBe(bookCountBefore);
  });

  it("rollbacks whole transaction when associations fail to #save due to uniqueness validation failure", async () => {
    const authorCountBefore = await AuthorM.count();
    const bookCountBefore = await BookM.count();
    const author = buildAuthor();

    const result = await author.save();
    expect(result).toBe(false);

    expect(await AuthorM.count()).toBe(authorCountBefore);
    expect(await BookM.count()).toBe(bookCountBefore);
  });
});

describe("TestAutosaveAssociationValidationsOnABelongsToAssociation", () => {
  fixtures([]);
  it("should automatically validate associations with :validate => true", async () => {
    class Author extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const a = new Author({ name: "" });
    const valid = await a.isValid();
    expect(valid).toBe(false);
  });

  it("should not automatically validate associations without :validate => true", async () => {
    class Item extends Base {
      declare label: string | null;

      static {
        this.attribute("label", "string");
      }
    }
    const item = new Item({ label: "fine" });
    const valid = await item.isValid();
    expect(valid).toBe(true);
  });

  it("validations still fire on unchanged association with custom validation context", async () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
        this.validates("title", { presence: true, on: "create" });
      }
    }
    const p = new Post({});
    expect(await p.isValid("create")).toBe(false);
    expect(await p.isValid("update")).toBe(true);
  });
});

describe("TestAutosaveAssociationValidationsOnAHasOneAssociation", () => {
  fixtures([]);
  it("should automatically validate associations with :validate => true", async () => {
    class Profile extends Base {
      declare bio: string | null;

      static {
        this.attribute("bio", "string");
        this.validates("bio", { presence: true });
      }
    }
    const p = new Profile({ bio: "" });
    const valid = await p.isValid();
    expect(valid).toBe(false);
  });

  it("should not automatically add validate associations without :validate => true", async () => {
    class Address extends Base {
      declare street: string | null;

      static {
        this.attribute("street", "string");
      }
    }
    const a = new Address({ street: "123 Main" });
    const valid = await a.isValid();
    expect(valid).toBe(true);
  });
});

describe("TestAutosaveAssociationOnAHasOneThroughAssociation", () => {
  fixtures([]);
  it("should not has one through model", async () => {
    class HotOrg extends Base {
      declare name: string | null;

      static {
        this._tableName = "companies";
        this.attribute("name", "string");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class HotMember extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("hotDetail", {
          className: "HotDetail",
          foreignKey: "developer_id",
        });
        this.hasOne("hotOrg", {
          className: "HotOrg",
          through: "hotDetail",
          source: "hotOrg",
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface HotMember {
      get hotDetail(): HotDetail | null | Promise<HotDetail | null>;
      set hotDetail(value: HotDetail | null);
      get hotOrg(): Base | null | Promise<Base | null>;
      set hotOrg(value: Base | null);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class HotDetail extends Base {
      declare company_id: number | null;
      declare developer_id: number | null;

      static {
        this._tableName = "contracts";
        this.attribute("company_id", "integer");
        this.attribute("developer_id", "integer");
        this.belongsTo("hotOrg", {
          className: "HotOrg",
          foreignKey: "company_id",
        });
        this.belongsTo("hotMember", {
          className: "HotMember",
          foreignKey: "developer_id",
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface HotDetail {
      get hotOrg(): HotOrg | null | Promise<HotOrg | null>;
      set hotOrg(value: HotOrg | null);
      get hotMember(): HotMember | null | Promise<HotMember | null>;
      set hotMember(value: HotMember | null);
    }
    registerModel("HotOrg", HotOrg);
    registerModel("HotMember", HotMember);
    registerModel("HotDetail", HotDetail);

    const org = await HotOrg.create({ name: "Org" });
    const member = await HotMember.create({ name: "M" });
    await HotDetail.create({ company_id: org.id, developer_id: member.id });
    cacheAssoc(member, "hotOrg", org);
    org.name = "Modified";
    const saved = await member.save();
    expect(saved).toBe(true);
    const reloadedOrg = await HotOrg.find(org.id);
    expect(reloadedOrg.name).toBe("Org");
  });
  it("should not reversed has one through model", async () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class RevOrg extends Base {
      declare name: string | null;

      static {
        this._tableName = "companies";
        this.attribute("name", "string");
        this.hasOne("revDetail", {
          className: "RevDetail",
          foreignKey: "company_id",
        });
        this.hasOne("revMember", {
          className: "RevMember",
          through: "revDetail",
          source: "revMember",
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface RevOrg {
      get revDetail(): RevDetail | null | Promise<RevDetail | null>;
      set revDetail(value: RevDetail | null);
      get revMember(): Base | null | Promise<Base | null>;
      set revMember(value: Base | null);
    }
    class RevMember extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class RevDetail extends Base {
      declare company_id: number | null;
      declare developer_id: number | null;

      static {
        this._tableName = "contracts";
        this.attribute("company_id", "integer");
        this.attribute("developer_id", "integer");
        this.belongsTo("revOrg", {
          className: "RevOrg",
          foreignKey: "company_id",
        });
        this.belongsTo("revMember", {
          className: "RevMember",
          foreignKey: "developer_id",
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface RevDetail {
      get revOrg(): RevOrg | null | Promise<RevOrg | null>;
      set revOrg(value: RevOrg | null);
      get revMember(): RevMember | null | Promise<RevMember | null>;
      set revMember(value: RevMember | null);
    }
    registerModel("RevOrg", RevOrg);
    registerModel("RevMember", RevMember);
    registerModel("RevDetail", RevDetail);

    const org = await RevOrg.create({ name: "Org" });
    const member = await RevMember.create({ name: "M" });
    await RevDetail.create({ company_id: org.id, developer_id: member.id });
    cacheAssoc(org, "revMember", member);
    member.name = "Modified";
    const saved = await org.save();
    expect(saved).toBe(true);
    const reloadedMember = await RevMember.find(member.id);
    expect(reloadedMember.name).toBe("M");
  });
});

describe("TestAutosaveAssociationValidationsOnAHABTMAssociation", () => {
  fixtures([]);
  it("should automatically validate associations with :validate => true", async () => {
    class Tag extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
        this.validates("name", { presence: true });
      }
    }
    const t = new Tag({ name: "" });
    const valid = await t.isValid();
    expect(valid).toBe(false);
  });
  it("should not automatically validate associations without :validate => true", async () => {
    class Label extends Base {
      declare text: string | null;

      static {
        this.attribute("text", "string");
      }
    }
    const l = new Label({ text: "fine" });
    const valid = await l.isValid();
    expect(valid).toBe(true);
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
  it("should not raise error", async () => {
    class BtOwner extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class BtRecord extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.belongsTo("btOwner", {
          className: "BtOwner",
          foreignKey: "author_id",
          autosave: true,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface BtRecord {
      get btOwner(): BtOwner | null | Promise<BtOwner | null>;
      set btOwner(value: BtOwner | null);
    }
    registerModel("BtOwner", BtOwner);
    registerModel("BtRecord", BtRecord);
    const owner = await BtOwner.create({ name: "Owner" });
    const record = new BtRecord({ name: "V", author_id: owner.id });
    cacheAssoc(record, "btOwner", owner);
    const saved = await record.save();
    expect(saved).toBe(true);
  });
});

describe("TestAutosaveAssociationWithTouch", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(Invoice);
    registerModel(LineItem);
  });
  it("autosave with touch should not raise system stack error", async () => {
    const invoice = await Invoice.create({});
    await expect(invoice.lineItems.create({ amount: 10 })).resolves.not.toThrow();
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

describe("should update children when autosave is true and parent is new but child is not", () => {
  fixtures([]);
  it("should update children when autosave is true and parent is new but child is not", async () => {
    class UcParent extends Base {
      declare name: string | null;
      declare ucChildren: AssociationProxy<UcChild>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("ucChildren", {
          className: "UcChild",
          foreignKey: "author_id",
          autosave: true,
        });
      }
    }
    class UcChild extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    registerModel("UcParent", UcParent);
    registerModel("UcChild", UcChild);
    const child = await UcChild.create({ name: "existing" });
    const parent = new UcParent({ name: "new parent" });
    child.name = "updated";
    cacheAssoc(parent, "ucChildren", [child]);
    const saved = await parent.save();
    expect(saved).toBe(true);
    expect(parent.isNewRecord()).toBe(false);
    const reloaded = await UcChild.find(child.id);
    expect(reloaded.name).toBe("updated");
    expect(reloaded.readAttribute("author_id")).toBe(parent.id);
  });
  it("should automatically save the associated models", async () => {
    class NAutoTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class NAutoArticle extends Base {
      declare name: string | null;
      declare nautoTags: AssociationProxy<NAutoTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("nautoTags", {
          className: "NAutoTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(NAutoArticle, "nautoTags");
    registerModel(NAutoTag);
    registerModel(NAutoArticle);
    const article = await NAutoArticle.create({ name: "auto save" });
    await (article as any).setNautoTagsAttributes([{ name: "saved" }]);
    await article.save();
    const tags = await NAutoTag.where({ author_id: article.id });
    expect(tags.length).toBe(1);
    expect(tags[0].name).toBe("saved");
    expect(tags[0].isPersisted()).toBe(true);
  });

  it("should automatically save bang the associated models", async () => {
    class ASB1Tag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class ASB1Article extends Base {
      declare name: string | null;
      declare asb1Tags: AssociationProxy<ASB1Tag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("asb1Tags", {
          className: "ASB1Tag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(ASB1Article, "asb1Tags");
    registerModel(ASB1Tag);
    registerModel(ASB1Article);
    const article = await ASB1Article.create({ name: "bang save" });
    await (article as any).setAsb1TagsAttributes([{ name: "banged" }]);
    await article.save();
    const tags = await ASB1Tag.where({ author_id: article.id });
    expect(tags.length).toBe(1);
    expect(tags[0].isPersisted()).toBe(true);
  });

  it("should not update children when parent creation with no reason", async () => {
    class NUCTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class NUCArticle extends Base {
      declare name: string | null;
      declare nucTags: AssociationProxy<NUCTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("nucTags", {
          className: "NUCTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(NUCArticle, "nucTags");
    registerModel(NUCTag);
    registerModel(NUCArticle);
    const article = await NUCArticle.create({ name: "parent" });
    const tag = await NUCTag.create({ name: "child", author_id: article.id });
    await article.save();
    const reloaded = await NUCTag.find(tag.id);
    expect(reloaded.name).toBe("child");
  });

  it("should automatically validate the associated models", async () => {
    class AVTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class AVArticle extends Base {
      declare name: string | null;
      declare avTags: AssociationProxy<AVTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("avTags", {
          className: "AVTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(AVArticle, "avTags");
    registerModel(AVTag);
    registerModel(AVArticle);
    const invalidTag = new AVTag({ name: "" });
    const valid = await invalidTag.isValid();
    expect(valid).toBe(false);
  });

  it("should not use default invalid error on associated models", async () => {
    class NDITag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class NDIArticle extends Base {
      declare name: string | null;
      declare ndiTags: AssociationProxy<NDITag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("ndiTags", {
          className: "NDITag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(NDIArticle, "ndiTags");
    registerModel(NDITag);
    registerModel(NDIArticle);
    const tag = new NDITag({ name: "" });
    const valid = await tag.isValid();
    expect(valid).toBe(false);
    const nameMessages = tag.errors.fullMessagesFor("name");
    expect(nameMessages.length).toBeGreaterThan(0);
  });

  it("should default invalid error from i18n", async () => {
    class DITag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class DIArticle extends Base {
      declare name: string | null;
      declare diTags: AssociationProxy<DITag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("diTags", {
          className: "DITag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(DIArticle, "diTags");
    registerModel(DITag);
    registerModel(DIArticle);
    const tag = new DITag({ name: "" });
    const valid = await tag.isValid();
    expect(valid).toBe(false);
    expect(tag.errors.size).toBeGreaterThan(0);
  });

  it("should allow to bypass validations on the associated models on update", async () => {
    class BVUTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class BVUArticle extends Base {
      declare name: string | null;
      declare bvuTags: AssociationProxy<BVUTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("bvuTags", {
          className: "BVUTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(BVUArticle, "bvuTags");
    registerModel(BVUTag);
    registerModel(BVUArticle);
    const article = await BVUArticle.create({ name: "test" });
    const tag = await BVUTag.create({ name: "original", author_id: article.id });
    await (article as any).setBvuTagsAttributes([{ id: tag.id, name: "updated" }]);
    await article.save();
    const reloaded = await BVUTag.find(tag.id);
    expect(reloaded.name).toBe("updated");
  });

  it("should validation the associated models on create", async () => {
    class VCTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class VCArticle extends Base {
      declare name: string | null;
      declare vcTags: AssociationProxy<VCTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("vcTags", {
          className: "VCTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(VCArticle, "vcTags");
    registerModel(VCTag);
    registerModel(VCArticle);
    const tag = new VCTag({ name: "" });
    const valid = await tag.isValid();
    expect(valid).toBe(false);
  });

  it("should allow to bypass validations on the associated models on create", async () => {
    class BVTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class BVArticle extends Base {
      declare name: string | null;
      declare bvTags: AssociationProxy<BVTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("bvTags", {
          className: "BVTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(BVArticle, "bvTags");
    registerModel(BVTag);
    registerModel(BVArticle);
    const article = await BVArticle.create({ name: "test" });
    await (article as any).setBvTagsAttributes([{ name: "valid" }]);
    await article.save();
    const tags = await BVTag.where({ author_id: article.id });
    expect(tags.length).toBe(1);
  });

  it("should not save and return false if a callback cancelled saving in either create or update", async () => {
    class CBTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.beforeSave(function (record: any) {
          if (record.name === "cancel") kernelThrow(":abort");
        });
      }
    }
    class CBArticle extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    registerModel(CBTag);
    registerModel(CBArticle);
    const tag = new CBTag({ name: "cancel" });
    const result = await tag.save();
    expect(result).toBe(false);
  });

  it("should not load the associated models if they were not loaded yet", async () => {
    class NLTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class NLArticle extends Base {
      declare name: string | null;
      declare nlTags: AssociationProxy<NLTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("nlTags", {
          className: "NLTag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(NLArticle, "nlTags");
    registerModel(NLTag);
    registerModel(NLArticle);
    const article = await NLArticle.create({ name: "no load" });
    const saved = await article.save();
    expect(saved).toBe(true);
  });
  it("should merge errors on the associated models onto the parent even if it is not valid", async () => {
    class METag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class MEArticle extends Base {
      declare name: string | null;
      declare meTags: AssociationProxy<METag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("meTags", {
          className: "METag",
          foreignKey: "author_id",
        });
      }
    }
    acceptsNestedAttributesFor(MEArticle, "meTags");
    registerModel(METag);
    registerModel(MEArticle);
    const invalidTag = new METag({ name: "" });
    const valid = await invalidTag.isValid();
    expect(valid).toBe(false);
    expect(invalidTag.errors.size).toBeGreaterThan(0);
  });

  it("should rollback any changes if an exception occurred while saving", async () => {
    class RBTag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class RBArticle extends Base {
      declare name: string | null;
      declare rbTags: AssociationProxy<RBTag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("rbTags", {
          className: "RBTag",
          foreignKey: "author_id",
          autosave: true,
        });
      }
    }
    acceptsNestedAttributesFor(RBArticle, "rbTags");
    registerModel(RBTag);
    registerModel(RBArticle);
    const article = await RBArticle.create({ name: "rollback test" });
    expect(() =>
      (article as any).setRbTagsAttributes([{ name: "good" }, { name: "bad", unknownCol: "boom" }]),
    ).toThrow(/unknown attribute/);
    const tags = await RBTag.where({ author_id: article.id });
    expect(tags.length).toBeLessThanOrEqual(1);
  });

  it("should still raise an ActiveRecordRecord Invalid exception if we want that", async () => {
    class RITag extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class RIArticle extends Base {
      declare name: string | null;
      declare riTags: AssociationProxy<RITag>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("riTags", {
          className: "RITag",
          foreignKey: "author_id",
          autosave: true,
        });
      }
    }
    registerModel(RITag);
    registerModel(RIArticle);
    const article = await RIArticle.create({ name: "test" });
    const tag = await RITag.create({ name: "valid", author_id: article.id });
    tag.name = "";
    cacheAssoc(article, "riTags", [tag]);
    await expect(article.saveBang()).rejects.toThrow(RecordInvalid);
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
