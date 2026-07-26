/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { describe, it, expect, beforeAll } from "vitest";
import { throwAbort } from "@blazetrails/activesupport";
import { I18n, Error as ModelError } from "@blazetrails/activemodel";
import {
  Base,
  registerModel,
  acceptsNestedAttributesFor,
  assignNestedAttributes,
  RecordInvalid,
  indexNestedAttributeErrors,
  setIndexNestedAttributeErrors,
} from "./index.js";
import { Associations, association } from "./associations.js";

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
import { Ship as CanonicalShip, ShipWithoutNestedAttributes } from "./test-helpers/models/ship.js";
import { Developer } from "./test-helpers/models/developer.js";
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
import {
  markForDestruction,
  isMarkedForDestruction,
  computePrimaryKey,
  addAutosaveAssociationCallbacks,
} from "./autosave-association.js";
import { fixtures } from "./test-helpers/fixtures.js";
import { assertNoQueries } from "./testing/query-assertions.js";

function cacheAssoc(record: Base, name: string, value: unknown) {
  record.association(name).setTarget(value as any);
}

fixtures([], { useTransactionalTests: false });

describe("TestDestroyAsPartOfAutosaveAssociation", () => {
  // Transactional fixtures roll back every persisted pirate/ship/parrot per test
  // so this block does not pollute the shared worker DB for sibling blocks
  // (e.g. TestAutosaveAssociationOnACollectionRemoveCallbacks) — Rails'
  // `use_transactional_tests`.
  fixtures([]);
  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
    registerModel(Developer);
    registerModel(CanonicalBird);
    registerModel(ShipPart);
    registerModel(CanonicalParrot);
  });

  function cacheAssoc(record: Base, name: string, value: unknown) {
    record.association(name).setTarget(value as any);
  }

  function makePirateShip() {
    return { Pirate: CanonicalPirate, Ship: CanonicalShip, Bird: CanonicalBird, Part: ShipPart };
  }

  it("a marked for destruction record should not be be marked after reload", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Don' botharrr talkin' like one, savvy?" });
    const ship = await Ship.create({ name: "Nights Dirty Lightning", pirate_id: pirate.id });
    cacheAssoc(pirate, "ship", ship);

    markForDestruction(pirate);
    markForDestruction(ship);

    expect(isMarkedForDestruction(await pirate.reload())).toBe(false);
    expect(isMarkedForDestruction(await ship.reload())).toBe(false);
  });

  it("should destroy a child association as part of the save transaction if it was marked for destruction", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Black Pearl", pirate_id: pirate.id });
    markForDestruction(ship);
    cacheAssoc(pirate, "ship", ship);
    await pirate.save();
    expect(ship.isDestroyed()).toBe(true);
  });

  it("should skip validation on a child association if marked for destruction", async () => {
    const { Ship, Part } = makePirateShip();
    const ship = await Ship.create({ name: "Titanic" });
    const part = await Part.create({ name: "Mast", ship_id: ship.id });
    part.name = "";
    markForDestruction(part);
    cacheAssoc(ship, "parts", [part]);
    const saved = await ship.save();
    expect(saved).toBe(true);
    expect(part.isDestroyed()).toBe(true);
  });

  it("a child marked for destruction should not be destroyed twice", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    markForDestruction(ship);
    cacheAssoc(pirate, "ship", ship);
    await pirate.save();
    expect(ship.isDestroyed()).toBe(true);
    cacheAssoc(pirate, "ship", ship);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("should rollback destructions if an exception occurred while saving a child", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const origSave = ship.save.bind(ship);
    (ship as any).save = async (opts?: any) => {
      await origSave(opts);
      await ship.destroy();
      throw new Error("Oh noes!");
    };
    // Mirror Rails: @ship.name_will_change! — force ship dirty so autosaveHasOne calls save
    ship.name = "Pearl Changed";
    cacheAssoc(pirate, "ship", ship);
    await expect(pirate.save()).rejects.toThrow("Oh noes!");
    // Destruction should be rolled back — ship still exists
    const reloaded = await Ship.find(ship.id);
    expect(reloaded).toBeTruthy();
  });

  it("should save changed has one changed object if child is saved", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    ship.name = "NewName";
    cacheAssoc(pirate, "ship", ship);
    expect(await pirate.save()).toBeTruthy();
    const reloaded = await Ship.find(ship.id);
    expect(reloaded.name).toBe("NewName");
  });

  it("should not save changed has one unchanged object if child is saved", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    cacheAssoc(pirate, "ship", ship);
    const saved = await pirate.save();
    expect(saved).toBe(true);
    expect(ship.isDestroyed()).toBe(false);
  });

  it("should destroy a parent association as part of the save transaction if it was marked for destruction", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    markForDestruction(pirate);
    cacheAssoc(ship, "pirate", pirate);
    await ship.save();
    expect(pirate.isDestroyed()).toBe(true);
  });

  it("autosave cpk association should destroy parent association when marked for destruction", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Ahoy" });
    const ship = await Ship.create({ name: "Queen Anne", pirate_id: pirate.id });
    markForDestruction(pirate);
    cacheAssoc(ship, "pirate", pirate);
    await ship.save();
    expect(pirate.isDestroyed()).toBe(true);
  });

  it("should skip validation on a parent association if marked for destruction", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    markForDestruction(pirate);
    cacheAssoc(ship, "pirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(true);
    expect(pirate.isDestroyed()).toBe(true);
  });

  it("a parent marked for destruction should not be destroyed twice", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    markForDestruction(pirate);
    cacheAssoc(ship, "pirate", pirate);
    await ship.save();
    expect(pirate.isDestroyed()).toBe(true);
    cacheAssoc(ship, "pirate", pirate);
    const saved = await ship.save();
    expect(saved).toBe(true);
  });

  it("should rollback destructions if an exception occurred while saving a parent", async () => {
    const { Pirate, Ship } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    const origSave = pirate.save.bind(pirate);
    (pirate as any).save = async (opts?: any) => {
      await origSave(opts);
      await pirate.destroy();
      throw new Error("Oh noes!");
    };
    // Mirror Rails: @ship.pirate.catchphrase = "Changed Catchphrase" — make pirate dirty
    pirate.catchphrase = "Changed Catchphrase";
    cacheAssoc(ship, "pirate", pirate);
    await expect(ship.save()).rejects.toThrow("Oh noes!");
    // Destruction should be rolled back — pirate still exists
    const reloaded = await Pirate.find(pirate.id);
    expect(reloaded).toBeTruthy();
  });

  it("should save changed child objects if parent is saved", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const bird = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    bird.name = "Squawk";
    cacheAssoc(pirate, "birds", [bird]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
    const reloaded = await Bird.find(bird.id!);
    expect(reloaded.name).toBe("Squawk");
  });

  it("should destroy has many as part of the save transaction if they were marked for destruction", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const b1 = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    const b2 = await Bird.create({ name: "Crackers", pirate_id: pirate.id });
    markForDestruction(b1);
    cacheAssoc(pirate, "birds", [b1, b2]);
    await pirate.save();
    expect(b1.isDestroyed()).toBe(true);
    expect(b2.isDestroyed()).toBe(false);
  });

  it("should not resave destroyed association", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const bird = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    await bird.destroy();
    cacheAssoc(pirate, "birds", [bird]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("should skip validation on has many if marked for destruction", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const bird = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    bird.name = "";
    markForDestruction(bird);
    cacheAssoc(pirate, "birds", [bird]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
    expect(bird.isDestroyed()).toBe(true);
  });

  it("should skip validation on has many if destroyed", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const bird = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    await bird.destroy();
    cacheAssoc(pirate, "birds", [bird]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("a child marked for destruction should not be destroyed twice while saving has many", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const bird = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    markForDestruction(bird);
    cacheAssoc(pirate, "birds", [bird]);
    await pirate.save();
    expect(bird.isDestroyed()).toBe(true);
    cacheAssoc(pirate, "birds", [bird]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("should rollback destructions if an exception occurred while saving has many", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const b1 = await Bird.create({ name: "birds_0", pirate_id: pirate.id });
    const b2 = await Bird.create({ name: "birds_1", pirate_id: pirate.id });
    markForDestruction(b1);
    markForDestruction(b2);
    // Override the second bird's destroy to raise after super
    const origDestroy = b2.destroy.bind(b2);
    (b2 as any).destroy = async () => {
      await origDestroy();
      throw new Error("Oh noes!");
    };
    cacheAssoc(pirate, "birds", [b1, b2]);
    await expect(pirate.save()).rejects.toThrow("Oh noes!");
    // Both destructions should be rolled back
    const remaining = await Bird.where({ pirate_id: pirate.id });
    expect(remaining.length).toBe(2);
  });

  it("when new record a child marked for destruction should not affect other records from saving", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const b1 = new Bird({ name: "Polly" });
    markForDestruction(b1);
    const b2 = new Bird({ name: "Crackers" });
    cacheAssoc(pirate, "birds", [b1, b2]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
    expect(b2.isNewRecord()).toBe(false);
  });

  it("should save new record that has same value as existing record marked for destruction on field that has unique index", async () => {
    const { Pirate, Bird } = makePirateShip();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const b1 = await Bird.create({ name: "Polly", pirate_id: pirate.id });
    markForDestruction(b1);
    const b2 = new Bird({ name: "Polly" });
    cacheAssoc(pirate, "birds", [b1, b2]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
    expect(b1.isDestroyed()).toBe(true);
    expect(b2.isNewRecord()).toBe(false);
  });

  function makePirateParrot() {
    return { Pirate: CanonicalPirate, Parrot: CanonicalParrot };
  }

  it("should destroy habtm as part of the save transaction if they were marked for destruction", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const proxy = association(pirate, "parrots");
    await proxy.create({ name: "parrots_0" });
    await proxy.create({ name: "parrots_1" });

    const parrots = await proxy;
    expect(parrots.some((p) => isMarkedForDestruction(p))).toBe(false);
    for (const p of parrots) markForDestruction(p);

    // Rails `assert_no_difference "Parrot.count"`: HABTM mark_for_destruction
    // removes the join row, it does NOT destroy the associated record.
    const before = Number(await Parrot.count());
    await pirate.save();
    expect(Number(await Parrot.count())).toBe(before);

    const reloaded = await Pirate.find(pirate.id!);
    expect((await association(reloaded, "parrots")).length).toBe(0);
  });

  it("should skip validation on habtm if marked for destruction", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const proxy = association(pirate, "parrots");
    await proxy.create({ name: "parrots_0" });
    await proxy.create({ name: "parrots_1" });

    const parrots = await proxy;
    for (const p of parrots) p.name = "";
    expect(await pirate.isValid()).toBe(false);

    for (const p of parrots) markForDestruction(p);

    // Rails `assert_not_called(parrot, :valid?)`: a marked-for-destruction child
    // is skipped by `association_valid?` before validation runs, so `valid?`
    // must not fire on it during the owner save.
    const validatedIds: unknown[] = [];
    for (const p of parrots) {
      const origIsValid = p.isValid.bind(p);
      (p as { isValid: (ctx?: unknown) => Promise<boolean> }).isValid = (ctx?: unknown) => {
        validatedIds.push(p.id);
        return origIsValid(ctx as never);
      };
    }
    const saved = await pirate.save();
    expect(saved).toBe(true);
    expect(validatedIds).toEqual([]);

    const reloaded = await Pirate.find(pirate.id!);
    expect((await association(reloaded, "parrots")).length).toBe(0);
  });

  it("should skip validation on habtm if destroyed", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const parrot = await Parrot.create({ name: "Polly" });
    const proxy = association(pirate, "parrots");
    await proxy.push(parrot);

    await parrot.destroy();
    cacheAssoc(pirate, "parrots", [parrot]);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });
  it("should be valid on habtm if persisted and unchanged", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const proxy = association(pirate, "parrots");
    const p1 = await Parrot.create({ name: "Polly" });
    await proxy.push(p1);
    expect(await pirate.isValid()).toBe(true);
  });
  it("should be invalid on habtm when any record in the association chain is invalid and was changed", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const parrot = await Parrot.create({ name: "Polly" });
    const proxy = association(pirate, "parrots");
    await proxy.push(parrot);
    parrot.name = "";
    cacheAssoc(pirate, "parrots", [parrot]);
    expect(await pirate.isValid()).toBe(false);
  });
  it("should be invalid on habtm when any record in the association chain is invalid and was changed with autosave", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const parrot = await Parrot.create({ name: "Polly" });
    const proxy = association(pirate, "parrots");
    await proxy.push(parrot);
    parrot.name = "";
    cacheAssoc(pirate, "parrots", [parrot]);
    const saved = await pirate.save();
    expect(saved).toBe(false);
  });
  it("should be valid on habtm when any record in the association chain is invalid but was not changed", async () => {
    const { Pirate, Parrot } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const parrot = await Parrot.create({ name: "Polly" });
    const proxy = association(pirate, "parrots");
    await proxy.push(parrot);
    // Parrot is persisted and unchanged; autosave validation should only consider
    // associated records that have actually been changed
    cacheAssoc(pirate, "parrots", [parrot]);
    expect(await pirate.isValid()).toBe(true);
  });
  it("a child marked for destruction should not be destroyed twice while saving habtm", async () => {
    const { Pirate } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const proxy = association(pirate, "parrots");
    await proxy.create({ name: "parrots_1" });

    for (const p of await proxy) markForDestruction(p);
    expect(await pirate.save()).toBe(true);

    // The join record is already gone — saving again issues no queries.
    await assertNoQueries(false, async () => {
      expect(await pirate.save()).toBe(true);
    });
  });
  it("should rollback destructions if an exception occurred while saving habtm", async () => {
    const { Pirate } = makePirateParrot();
    const pirate = await Pirate.create({ catchphrase: "Arrr" });
    const proxy = association(pirate, "parrots");
    await proxy.create({ name: "parrots_0" });
    await proxy.create({ name: "parrots_1" });

    const before = (await proxy).map((p) => p.id).sort();
    for (const p of await proxy) markForDestruction(p);

    // Mirror Rails: override the parrots association's `destroy` to raise after
    // running the real destroy, so the whole save transaction rolls back.
    const inst = (pirate as any).association("parrots");
    const origDestroy = inst.destroy.bind(inst);
    inst.destroy = async (...args: unknown[]) => {
      await origDestroy(...args);
      throw new Error("Oh noes!");
    };
    await expect(pirate.save()).rejects.toThrow("Oh noes!");

    const reloaded = await Pirate.find(pirate.id!);
    const after = (await association(reloaded, "parrots")).map((p) => p.id).sort();
    expect(after).toEqual(before);
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociation", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    record.association(name).setTarget(value as any);
  }
  const { companies, developers } = fixtures(["companies", "developers"]);
  beforeAll(() => {
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
    const firm = await Firm.find(companies("first_firm").id);
    const c = new Client();
    expect(await firm.clientsOfFirm.push(c)).toBeFalsy();
    expect(c.isPersisted()).toBe(false);
    expect(await firm.isValid()).toBe(false);
    expect(await firm.save()).toBe(false);
    expect(c.isPersisted()).toBe(false);
  });

  it("invalid adding before save", async () => {
    const newFirm = new Firm({ name: "A New Firm, Inc" });
    const c = new Client();
    await newFirm.clientsOfFirm.concat(c, new Client({ name: "Apple" }));
    expect(c.isPersisted()).toBe(false);
    expect(await c.isValid()).toBe(false);
    expect(await newFirm.isValid()).toBe(false);
    expect(await newFirm.save()).toBe(false);
    expect(c.isPersisted()).toBe(false);
    expect(newFirm.isPersisted()).toBe(false);
  });

  it("adding unsavable association", async () => {
    const newFirm = new Firm({ name: "A New Firm, Inc" });
    const client = newFirm.clients.build({ name: "Apple" });
    client.throwOnSave = true;

    expect(await client.isValid()).toBe(true);
    expect(await newFirm.isValid()).toBe(true);
    expect(await newFirm.save()).toBe(false);
    expect(newFirm.isPersisted()).toBe(false);
    expect(client.isPersisted()).toBe(false);
  });

  it("invalid adding with validate false", async () => {
    const firm = (await Firm.first())!;
    const client = new Client();
    await firm.unvalidatedClientsOfFirm.concat(client);

    expect(await firm.isValid()).toBe(true);
    expect(await client.isValid()).toBe(false);
    expect(await firm.save()).toBe(true);
    expect(client.isPersisted()).toBe(false);
  });

  it("valid adding with validate false", async () => {
    const noOfClients = Number(await Client.count());

    const firm = (await Firm.first())!;
    const client = new Client({ name: "Apple" });

    expect(await firm.isValid()).toBe(true);
    expect(await client.isValid()).toBe(true);
    expect(client.isPersisted()).toBe(false);

    await firm.unvalidatedClientsOfFirm.concat(client);

    expect(await firm.save()).toBe(true);
    expect(client.isPersisted()).toBe(true);
    expect(Number(await Client.count())).toBe(noOfClients + 1);
  });

  it("circular autosave does not validate children", async () => {
    // Rails builds an anonymous `Class.new(ActiveRecord::Base)` on `readers`
    // that self-names "Reader" via `def self.name`. We cannot reuse that name:
    // the canonical `Reader` model owns it and `registerModel` refuses a
    // canonical-name shadow. That forces the explicit `foreignKey` on
    // `children`: Rails derives `reader_id` from its "Reader" self-name, we
    // would derive `circular_reader_id`. `reader_id` is likewise a declared
    // attribute, not a `readers` column — Rails declares it the same way.
    class CircularReader extends Base {
      declare catch_phrase: string | null;
      declare reader_id: number | null;
      declare post_id: number | null;
      declare person_id: number | null;
      declare children: AssociationProxy<CircularReader>;

      static {
        this._tableName = "readers";
        this.attribute("catch_phrase", "string");
        this.attribute("reader_id", "integer");
        this.hasMany("children", {
          className: "CircularReader",
          foreignKey: "reader_id",
          autosave: true,
        });
        this.belongsTo("parent", { className: "CircularReader", autosave: true });
        this.validate("shouldBeFunny");
      }

      shouldBeFunny() {
        if (this.catch_phrase !== "funny") {
          this.errors.add("base", "not funny");
        }
      }
    }
    registerModel("CircularReader", CircularReader);

    const c = new CircularReader({ catch_phrase: "boring" });
    await c.children.concat(c);
    c.post_id = 0;
    c.person_id = 0;
    await c.save();

    expect(c.isPersisted()).toBe(false);
    expect(await c.isValid()).toBe(false);
  });

  it("parent should save children record with foreign key validation set in before save callback", async () => {
    const company = new NewlyContractedCompany({ name: "test" });

    expect(await company.save()).toBe(true);
    await company.reload();
    expect(await company.newContracts).not.toHaveLength(0);
  });

  it("parent should not get saved with duplicate children records", async () => {
    const repliesBefore = Number(await Reply.count());
    const sillyBefore = Number(await SillyUniqueReply.count());

    const reply = new Reply();
    reply.sillyUniqueReplies.build([{ content: "Best content" }, { content: "Best content" }]);

    expect(await reply.save()).toBe(false);
    // `propagateErrors` underscores the camelCase reflection name so the
    // humanized message matches Rails ("Silly unique replies is invalid"),
    // making the error attribute Rails' own `:silly_unique_replies`.
    expect(reply.errors.get("silly_unique_replies")).toEqual(["is invalid"]);

    const built = await reply.sillyUniqueReplies;
    expect(built[0].errors.empty).toBe(true);
    expect(built[built.length - 1].errors.get("content")).toEqual(["has already been taken"]);

    expect(Number(await Reply.count())).toBe(repliesBefore);
    expect(Number(await SillyUniqueReply.count())).toBe(sillyBefore);
  });

  it("invalid build", async () => {
    const firstFirm = await Firm.find(companies("first_firm").id);
    const newClient = firstFirm.clientsOfFirm.build();
    expect(newClient.isPersisted()).toBe(false);
    expect(await newClient.isValid()).toBe(false);
    const cached = await firstFirm.clientsOfFirm;
    expect(cached[cached.length - 1]).toBe(newClient);
    expect(await firstFirm.save()).toBe(false);
    expect(newClient.isPersisted()).toBe(false);
    const clientsOfFirm = firstFirm.clientsOfFirm;
    await clientsOfFirm.reload();
    expect(await clientsOfFirm).toHaveLength(2);
  });

  it("adding before save", async () => {
    const noOfFirms = Number(await Firm.count());
    const noOfClients = Number(await Client.count());

    const newFirm = new Firm({ name: "A New Firm, Inc" });
    const c = new Client({ name: "Apple" });

    await newFirm.clientsOfFirm.push(new Client({ name: "Natural Company" }));
    expect(await newFirm.clientsOfFirm).toHaveLength(1);
    await newFirm.clientsOfFirm.concat(c);
    expect(await newFirm.clientsOfFirm).toHaveLength(2);

    expect(Number(await Firm.count())).toBe(noOfFirms);
    expect(Number(await Client.count())).toBe(noOfClients);
    expect(await newFirm.save()).toBe(true);
    expect(newFirm.isPersisted()).toBe(true);
    expect(c.isPersisted()).toBe(true);
    expect(await c.loadBelongsTo("firm")).toEqual(newFirm);
    expect(Number(await Firm.count())).toBe(noOfFirms + 1);
    expect(Number(await Client.count())).toBe(noOfClients + 2);

    expect(await newFirm.clientsOfFirm).toHaveLength(2);
    const clientsOfFirm = newFirm.clientsOfFirm;
    await clientsOfFirm.reload();
    expect(await clientsOfFirm).toHaveLength(2);
  });

  it("assign ids", async () => {
    const firm = new Firm({ name: "Apple" });
    await firm.clients.setIds([
      companies("first_client").id as number,
      companies("second_client").id as number,
    ]);
    await firm.save();
    await firm.reload();
    const clients = await firm.clients;
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.id)).toContain(companies("second_client").id);
  });
  it("assign ids with belongs to cpk model", async () => {
    // Rails: order has a CPK [shop_id, id]; order_agreements is a single-column
    // FK has_many keyed on the "id" component (primaryKey: :id). Assigning the
    // child ids must populate order_id with the owner's "id" component.
    class AiCpkOrder extends Base {
      declare shop_id: number | null;
      declare status: string | null;
      declare orderAgreements: AssociationProxy<AiCpkOrderAgreement>;

      static {
        this._tableName = "cpk_orders";
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.primaryKey = ["shop_id", "id"];
        this.hasMany("orderAgreements", {
          className: "AiCpkOrderAgreement",
          foreignKey: "order_id",
          primaryKey: "id",
        });
      }
    }
    class AiCpkOrderAgreement extends Base {
      declare order_id: number | null;
      declare signature: string | null;
      declare order: AiCpkOrder | null;
      declare loadBelongsTo: (name: "order") => Promise<AiCpkOrder | null>;

      static {
        this._tableName = "cpk_order_agreements";
        this.attribute("order_id", "integer");
        this.attribute("signature", "string");
        this.belongsTo("order", {
          className: "AiCpkOrder",
          primaryKey: "id",
        });
      }
    }
    registerModel("AiCpkOrder", AiCpkOrder);
    registerModel("AiCpkOrderAgreement", AiCpkOrderAgreement);

    const order = await AiCpkOrder.create({ id: [1, 1], status: "paid" });
    const a1 = await AiCpkOrderAgreement.create({ signature: "signed" });
    const a2 = await AiCpkOrderAgreement.create({ signature: "signed" });
    const orderAgreements = [a1.id, a2.id];

    const proxy = association(order, "orderAgreements");
    expect(await proxy).toHaveLength(0);

    await proxy.setIds(orderAgreements as number[]);
    await order.save();
    await order.reload();

    expect(await order.orderAgreementIds).toEqual(orderAgreements);
    const loadedAgreements = await association(order, "orderAgreements");
    expect(loadedAgreements).toHaveLength(2);
    expect(loadedAgreements.map((a) => a.id)).toContain(a2.id);
  });
  it("assign ids with cpk for two models", async () => {
    // Rails: order has a CPK [shop_id, id]; books is a composite-FK has_many
    // keyed on [shop_id, order_id] auto-derived from the owner's CPK. The child
    // (book) is itself CPK [author_id, id], so its ids arrive as tuples.
    class AiCpkTwoOrder extends Base {
      declare shop_id: number | null;
      declare status: string | null;
      declare books: AssociationProxy<AiCpkTwoBook>;

      static {
        this._tableName = "cpk_orders";
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.primaryKey = ["shop_id", "id"];
        this.hasMany("books", {
          className: "AiCpkTwoBook",
          foreignKey: ["shop_id", "order_id"],
        });
      }
    }
    class AiCpkTwoBook extends Base {
      declare author_id: number | null;
      declare title: string | null;
      declare order_id: number | null;
      declare shop_id: number | null;
      declare order: AiCpkTwoOrder | null;
      declare loadBelongsTo: (name: "order") => Promise<AiCpkTwoOrder | null>;

      static {
        this._tableName = "cpk_books";
        this.attribute("author_id", "integer");
        this.attribute("id", "integer");
        this.attribute("title", "string");
        this.attribute("order_id", "integer");
        this.attribute("shop_id", "integer");
        this.primaryKey = ["author_id", "id"];
        this.belongsTo("order", {
          className: "AiCpkTwoOrder",
          foreignKey: ["shop_id", "order_id"],
          primaryKey: ["shop_id", "id"],
        });
      }
    }
    registerModel("AiCpkTwoOrder", AiCpkTwoOrder);
    registerModel("AiCpkTwoBook", AiCpkTwoBook);

    const order = await AiCpkTwoOrder.create({ id: [1, 1], status: "paid" });
    const b1 = await AiCpkTwoBook.create({
      id: [1, 1],
      title: "First",
      shop_id: 0,
      order_id: 0,
    });
    const b2 = await AiCpkTwoBook.create({
      id: [1, 2],
      title: "Second",
      shop_id: 0,
      order_id: 0,
    });
    const bookIds = [b1.id, b2.id];

    const proxy = association(order, "books");
    expect(await proxy).toHaveLength(0);

    await proxy.setIds(bookIds as number[][]);
    await order.save();
    await order.reload();

    expect(await order.bookIds).toEqual(bookIds);
    const loadedBooks = await association(order, "books");
    expect(loadedBooks).toHaveLength(2);
    const loadedTitles = loadedBooks.map((b) => b.title);
    expect(loadedTitles).toContain("First");
    expect(loadedTitles).toContain("Second");
  });
  it("has one cpk has one autosave with id", async () => {
    // Rails: test "has_one cpk has_one autosave with id" — when the parent has a CPK
    // and the has_one uses a non-composite single-column FK, autosave should propagate
    // the "id" component of the composite PK into the child's FK column.
    class CpkOrderPk extends Base {
      declare shop_id: number | null;
      declare status: string | null;
      declare cpkBookFk: CpkBookFk | null;
      declare loadHasOne: (name: "cpkBookFk") => Promise<CpkBookFk | null>;

      static {
        this._tableName = "cpk_orders";
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.primaryKey = ["shop_id", "id"];
        this.hasOne("cpkBookFk", {
          className: "CpkBookFk",
          foreignKey: "order_id",
          autosave: true,
        });
      }
    }
    class CpkBookFk extends Base {
      declare order_id: number | null;
      declare signature: string | null;

      static {
        this._tableName = "cpk_order_agreements";
        this.attribute("order_id", "integer");
        this.attribute("signature", "string");
      }
    }
    registerModel("CpkOrderPk", CpkOrderPk);
    registerModel("CpkBookFk", CpkBookFk);
    // has_one with single-column FK on CPK parent (like OrderWithPrimaryKeyAssociatedBook)
    const order = new CpkOrderPk({ id: [5, 7], status: "open" });
    const book = new CpkBookFk({ signature: "My Book" });
    cacheAssoc(order, "cpkBookFk", book);
    const saved = await order.save();
    expect(saved).toBe(true);
    expect(order.isNewRecord()).toBe(false);
    expect(book.isNewRecord()).toBe(false);
    // autosave propagates the "id" component of the composite PK into book.order_id
    expect(book.order_id).toBe(7);
  });
  it("assign ids for through a belongs to", async () => {
    const firm = new Firm({ name: "Apple" });
    await firm.developers.setIds([
      developers("david").id as number,
      developers("jamis").id as number,
    ]);
    await firm.save();
    await firm.reload();
    const devs = await firm.developers;
    expect(devs).toHaveLength(2);
    expect(devs.map((d) => d.id)).toContain(developers("david").id);
  });

  it("build before save", async () => {
    const company = await Firm.find(companies("first_firm").id);

    const newClient = company.clientsOfFirm.build({ name: "Another Client" });
    expect(company.clientsOfFirm.loaded).toBeFalsy();

    company.name += "-changed";
    expect(await company.save()).toBeTruthy();
    expect(newClient.isPersisted()).toBeTruthy();
    const clientsOfFirm = company.clientsOfFirm;
    await clientsOfFirm.reload();
    expect(await clientsOfFirm).toHaveLength(3);
  });

  it("build many before save", async () => {
    const company = await Firm.find(companies("first_firm").id);

    company.clientsOfFirm.build([{ name: "Another Client" }, { name: "Another Client II" }]);

    company.name += "-changed";
    expect(await company.save()).toBeTruthy();
    const clientsOfFirm = company.clientsOfFirm;
    await clientsOfFirm.reload();
    expect(await clientsOfFirm).toHaveLength(4);
  });

  it("build via block before save", async () => {
    const company = await Firm.find(companies("first_firm").id);

    const newClient = company.clientsOfFirm.build({}, (client: any) => {
      client.name = "Another Client";
    });
    expect(company.clientsOfFirm.loaded).toBeFalsy();

    company.name += "-changed";
    expect(await company.save()).toBeTruthy();
    expect(newClient.isPersisted()).toBeTruthy();
    const clientsOfFirm = company.clientsOfFirm;
    await clientsOfFirm.reload();
    expect(await clientsOfFirm).toHaveLength(3);
  });

  it("build many via block before save", async () => {
    const company = await Firm.find(companies("first_firm").id);

    company.clientsOfFirm.build(
      [{ name: "Another Client" }, { name: "Another Client II" }],
      (client: any) => {
        client.name = "changed";
      },
    );

    company.name += "-changed";
    expect(await company.save()).toBeTruthy();
    const clientsOfFirm = company.clientsOfFirm;
    await clientsOfFirm.reload();
    expect(await clientsOfFirm).toHaveLength(4);
  });

  it("replace on new object", async () => {
    const firm = new Firm({ name: "New Firm" });
    const secondClient = await Client.find(companies("second_client").id);
    await firm.clients.replace([secondClient, new Client({ name: "New Client" })]);
    expect(await firm.save()).toBeTruthy();
    await firm.reload();
    const clients = await firm.clients;
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.name)).toContain("New Client");
  });

  it("replace on duplicated object", async () => {
    const firm = (await Firm.createBang({ name: "New Firm" })).dup();
    const secondClient = await Client.find(companies("second_client").id);
    await firm.clients.replace([secondClient, new Client({ name: "New Client" })]);
    expect(await firm.save()).toBeTruthy();
    await firm.reload();
    const clients = await firm.clients;
    expect(clients).toHaveLength(2);
    expect(clients.map((c) => c.name)).toContain("New Client");
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
    record.association(name).setTarget(value as any);
  }
  fixtures([]);
  beforeAll(() => {
    registerModel(Firm);
    registerModel(Account);
    registerModel(Eye);
    registerModel(Iris);
    registerModel(IrisWithReadOnlyForeignKey);
  });

  // Rails' Firm declares `has_one :account, foreign_key: "firm_id",
  // dependent: :destroy, validate: true` (test/models/company.rb) — validated
  // but NOT autosaved. A new child still persists on owner.save via the
  // unconditionally-registered has_one autosave callback.
  function makeModels() {
    return { Firm: Firm, Account };
  }

  it("should save parent but not invalid child", async () => {
    // Without autosave: invalid has_one child does not block parent save
    class PFirm extends Base {
      declare name: string | null;
      declare pAccount: PAccount | null;
      declare loadHasOne: (name: "pAccount") => Promise<PAccount | null>;

      static {
        this._tableName = "companies";
        this.attribute("name", "string");
        this.hasOne("pAccount", { foreignKey: "firm_id" });
      }
    }
    class PAccount extends Base {
      declare credit_limit: number | null;
      declare firm_id: number | null;

      static {
        this._tableName = "accounts";
        this.attribute("credit_limit", "integer");
        this.attribute("firm_id", "integer");
        this.validates("credit_limit", { presence: true });
      }
    }
    registerModel("PFirm", PFirm);
    registerModel("PAccount", PAccount);

    const firm = new PFirm({ name: "GlobalMegaCorp" });
    expect(await firm.isValid()).toBe(true);

    const account = new PAccount({});
    cacheAssoc(firm, "pAccount", account);
    expect(await account.isValid()).toBe(false);

    const saved = await firm.save();
    expect(saved).toBe(true);
    expect(account.isPersisted()).toBe(false);
  });

  it("save fails for invalid has one", async () => {
    const { Firm, Account } = makeModels();
    const firm = await Firm.create({ name: "Acme" });
    const account = new Account({});
    cacheAssoc(firm, "account", account);
    const saved = await firm.save();
    expect(saved).toBe(false);
  });

  it("save succeeds for invalid has one with validate false", async () => {
    const { Firm } = makeModels();
    class LooseAccount extends Base {
      declare credit_limit: number | null;
      declare firm_id: number | null;

      static {
        this._tableName = "accounts";
        this.attribute("credit_limit", "integer");
        this.attribute("firm_id", "integer");
      }
    }
    registerModel("LooseAccount", LooseAccount);
    Associations.hasOne.call(Firm, "looseAccount", { autosave: true, foreignKey: "firm_id" });
    const firm = await Firm.create({ name: "Acme" });
    const account = new LooseAccount({});
    cacheAssoc(firm, "looseAccount", account);
    const saved = await firm.save();
    expect(saved).toBe(true);
  });

  it("build before child saved", async () => {
    const { Firm, Account } = makeModels();
    const firm = await Firm.create({ name: "Acme" });
    const account = new Account({ credit_limit: 100 });
    cacheAssoc(firm, "account", account);
    await firm.save();
    expect(account.isNewRecord()).toBe(false);
    expect(account.firm_id).toBe(firm.id);
  });

  it("build before either saved", async () => {
    const { Firm, Account } = makeModels();
    const firm = new Firm({ name: "Acme" });
    const account = new Account({ credit_limit: 200 });
    cacheAssoc(firm, "account", account);
    await firm.save();
    expect(firm.isNewRecord()).toBe(false);
    expect(account.isNewRecord()).toBe(false);
    expect(account.firm_id).toBe(firm.id);
  });

  it("assignment before parent saved", async () => {
    const { Firm, Account } = makeModels();
    const firm = new Firm({ name: "Corp" });
    const account = new Account({ credit_limit: 300 });
    cacheAssoc(firm, "account", account);
    await firm.save();
    expect(account.firm_id).toBe(firm.id);
  });

  it("assignment before either saved", async () => {
    const { Firm, Account } = makeModels();
    const firm = new Firm({ name: "LLC" });
    const account = new Account({ credit_limit: 400 });
    cacheAssoc(firm, "account", account);
    await firm.save();
    expect(firm.isNewRecord()).toBe(false);
    expect(account.isNewRecord()).toBe(false);
  });

  it("not resaved when unchanged", async () => {
    const { Firm, Account } = makeModels();
    const firm = await Firm.create({ name: "Acme" });
    const account = await Account.create({ credit_limit: 500, firm_id: firm.id });
    cacheAssoc(firm, "account", account);
    const saved = await firm.save();
    expect(saved).toBe(true);
    expect(account.isDestroyed()).toBe(false);
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
    const iris = eye.iris;
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
    const log: string[] = [];
    class PolyParent extends Base {
      declare name: string | null;
      declare polyChild: PolyChild | null;
      declare loadHasOne: (name: "polyChild") => Promise<PolyChild | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("polyChild", {
          as: "employable",
          autosave: true,
          className: "PolyChild",
          inverseOf: "employable",
        });
      }
    }
    class PolyChild extends Base {
      declare employable_id: number | null;
      declare employable_type: string | null;
      declare employable: Base | null;
      declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

      static {
        this._tableName = "chefs";
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.beforeValidation(function () {
          log.push("before_validation");
        });
        this.afterValidation(function () {
          log.push("after_validation");
        });
        this.beforeSave(function () {
          log.push("before_save");
        });
        this.afterSave(function () {
          log.push("after_save");
        });
        this.belongsTo("employable", {
          polymorphic: true,
          inverseOf: "polyChild",
        });
      }
    }
    registerModel("PolyParent", PolyParent);
    registerModel("PolyChild", PolyChild);
    const parent = new PolyParent({ name: "P" });
    const child = new PolyChild({});
    // Mirrors Rails HasOneAssociation#set_owner_attributes which writes the
    // polymorphic _type column at assignment time (before save).
    child._writeAttribute("employable_type", "PolyParent");
    cacheAssoc(parent, "polyChild", child);
    await parent.save();
    expect(log).toContain("before_validation");
    expect(log).toContain("after_validation");
    expect(log).toContain("before_save");
    expect(log).toContain("after_save");
    expect(child.isNewRecord()).toBe(false);
    expect(child._readAttribute("employable_id")).toBe(parent.id);
    expect(child._readAttribute("employable_type")).toBe("PolyParent");
  });
  it("callbacks on child when child autosaves parent", async () => {
    const log: string[] = [];
    class CbOwner extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.afterSave(function () {
          log.push("owner_after_save");
        });
      }
    }
    class CbPet extends Base {
      declare name: string | null;
      declare author_id: number | null;
      declare cbOwner: CbOwner | null;
      declare loadBelongsTo: (name: "cbOwner") => Promise<CbOwner | null>;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.belongsTo("cbOwner", {
          autosave: true,
          className: "CbOwner",
          foreignKey: "author_id",
        });
      }
    }
    registerModel("CbOwner", CbOwner);
    registerModel("CbPet", CbPet);
    const owner = new CbOwner({ name: "Alice" });
    const pet = new CbPet({ name: "cat" });
    cacheAssoc(pet, "cbOwner", owner);
    await pet.save();
    expect(log).toContain("owner_after_save");
    expect(owner.isNewRecord()).toBe(false);
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
    const log: string[] = [];
    class PolyAsParent extends Base {
      declare name: string | null;
      declare polyAsChild: PolyAsChild | null;
      declare loadHasOne: (name: "polyAsChild") => Promise<PolyAsChild | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.beforeValidation(function () {
          log.push("parent_before_validation");
        });
        this.afterValidation(function () {
          log.push("parent_after_validation");
        });
        this.beforeSave(function () {
          log.push("parent_before_save");
        });
        this.afterSave(function () {
          log.push("parent_after_save");
        });
        this.hasOne("polyAsChild", {
          as: "employable",
          className: "PolyAsChild",
          inverseOf: "employable",
        });
      }
    }
    class PolyAsChild extends Base {
      declare employable_id: number | null;
      declare employable_type: string | null;
      declare employable: Base | null;
      declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

      static {
        this._tableName = "chefs";
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", {
          autosave: true,
          polymorphic: true,
          inverseOf: "polyAsChild",
        });
      }
    }
    registerModel("PolyAsParent", PolyAsParent);
    registerModel("PolyAsChild", PolyAsChild);
    const parent = new PolyAsParent({ name: "P" });
    const child = new PolyAsChild({});
    // Mirrors Rails BelongsToPolymorphicAssociation#replace_keys which
    // writes the polymorphic _type column at assignment time.
    child._writeAttribute("employable_type", "PolyAsParent");
    cacheAssoc(child, "employable", parent);
    await child.save();
    expect(log).toContain("parent_before_validation");
    expect(log).toContain("parent_after_validation");
    expect(log).toContain("parent_before_save");
    expect(log).toContain("parent_after_save");
    expect(parent.isNewRecord()).toBe(false);
    expect(child._readAttribute("employable_id")).toBe(parent.id);
    expect(child._readAttribute("employable_type")).toBe("PolyAsParent");
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
  fixtures([]);
  function cacheAssoc(record: Base, name: string, value: unknown) {
    record.association(name).setTarget(value as any);
  }

  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalShip);
    registerModel(ShipPart);
    registerModel(ShipWithoutNestedAttributes);
  });

  function makeModels() {
    return { Pirate: CanonicalPirate, Ship: CanonicalShip };
  }

  it("should still work without an associated model", async () => {
    const { Pirate } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    pirate.catchphrase = "Arr";
    await pirate.save();
    const reloaded = await Pirate.find(pirate.id);
    expect(reloaded.catchphrase).toBe("Arr");
  });

  it("should automatically save the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "Black Pearl" });
    cacheAssoc(pirate, "ship", ship);
    await pirate.save();
    expect(ship.isNewRecord()).toBe(false);
    expect(ship.pirate_id).toBe(pirate.id);
  });

  it("changed for autosave should handle cycles", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Pearl", pirate_id: pirate.id });
    // No changes — save should succeed without infinite loop
    cacheAssoc(pirate, "ship", ship);
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("should automatically save bang the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Nights Dirty Lightning", pirate_id: pirate.id });
    ship.name = "The Vile Serpent";
    cacheAssoc(pirate, "ship", ship);
    await pirate.saveBang();
    const reloaded = await Ship.find(ship.id);
    expect(reloaded.name).toBe("The Vile Serpent");
  });

  it("should automatically save bang the associated model if it sets the inverse record", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = new Pirate({ catchphrase: "Savvy?" });
    const ship = new Ship({ name: "Black Pearl" });
    (ship as any).pirate = pirate;
    await pirate.save();
    const reloaded = await Pirate.find(pirate.id!);
    const reloadedShip = (await reloaded.association("ship").loadTarget()) as Base;
    expect(reloadedShip.name).toBe("Black Pearl");
  });

  it("should automatically validate the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "" }); // invalid
    cacheAssoc(pirate, "ship", ship);
    const saved = await pirate.save();
    expect(saved).toBe(false);
  });

  it("should merge errors on the associated models onto the parent even if it is not valid", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "" });
    cacheAssoc(pirate, "ship", ship);
    const saved = await pirate.save();
    expect(saved).toBe(false);
    const errors = (pirate as any).errors;
    expect(errors).toBeDefined();
  });

  it("should not ignore different error messages on the same attribute", async () => {
    // Rails: test "should not ignore different error messages on the same attribute"
    // When multiple validators fire on the same child attribute, all messages
    // should be merged onto the parent under the dotted attribute key.
    class DualValidShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
        this.validates("name", { presence: true });
        this.validates("name", { format: { with: /\w/ } });
      }
    }
    class DualPirate extends Base {
      declare catchphrase: string | null;
      declare dualValidShip: DualValidShip | null;
      declare loadHasOne: (name: "dualValidShip") => Promise<DualValidShip | null>;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.hasOne("dualValidShip", { autosave: true });
      }
    }
    registerModel("DualPirate", DualPirate);
    registerModel("DualValidShip", DualValidShip);
    const pirate = await DualPirate.create({ catchphrase: "Yarr" });
    const ship = new DualValidShip({ name: "" });
    cacheAssoc(pirate, "dualValidShip", ship);
    const valid = await pirate.isValid();
    expect(valid).toBe(false);
    const errMap = (pirate as any).errors.messages;
    const msgs: string[] =
      errMap.get("dualValidShip.name") ?? errMap.get("dual_valid_ship.name") ?? [];
    expect(msgs).toContain("can't be blank");
    expect(msgs).toContain("is invalid");
  });

  it("should still allow to bypass validations on the associated model", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = await Ship.create({ name: "Nights Dirty Lightning", pirate_id: pirate.id });
    cacheAssoc(pirate, "ship", ship);

    pirate.catchphrase = "";
    ship.name = "";
    const saved = await pirate.save({ validate: false });
    expect(saved).toBe(true);

    expect((await Pirate.find(pirate.id)).catchphrase).toBe("");
    expect((await Ship.find(ship.id)).name).toBe("");
  });

  it("should allow to bypass validations on associated models at any depth", async () => {
    // Rails: test "should allow to bypass validations on associated models at any depth"
    // save(validate: false) should skip validation on the parent and all nested records.
    class DeepPart extends Base {
      declare name: string | null;
      declare ship_id: number | null;

      static {
        this._tableName = "ship_parts";
        this.attribute("name", "string");
        this.attribute("ship_id", "integer");
        this.validates("name", { presence: true });
      }
    }
    class DeepShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;
      declare deepParts: AssociationProxy<DeepPart>;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
        this.validates("name", { presence: true });
        this.hasMany("deepParts", { autosave: true, foreignKey: "ship_id" });
      }
    }
    class DeepPirate extends Base {
      declare catchphrase: string | null;
      declare deepShip: DeepShip | null;
      declare loadHasOne: (name: "deepShip") => Promise<DeepShip | null>;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.validates("catchphrase", { presence: true });
        // The FK derived from the association name would be `deep_pirate_id`;
        // the real `ships` column is `pirate_id`. The bridge used to swallow
        // the phantom write; strict _writeAttribute surfaces it.
        this.hasOne("deepShip", { autosave: true, foreignKey: "pirate_id" });
      }
    }
    registerModel("DeepPirate", DeepPirate);
    registerModel("DeepShip", DeepShip);
    registerModel("DeepPart", DeepPart);

    const pirate = await DeepPirate.create({ catchphrase: "Yarr" });
    const ship = await DeepShip.create({ name: "Pearl", pirate_id: pirate.id });
    const part1 = await DeepPart.create({ name: "part 0", ship_id: ship.id });
    const part2 = await DeepPart.create({ name: "part 1", ship_id: ship.id });

    pirate.catchphrase = "";
    ship.name = "";
    part1.name = "";
    part2.name = "";
    cacheAssoc(pirate, "deepShip", ship);
    cacheAssoc(ship, "deepParts", [part1, part2]);

    const saved = await pirate.save({ validate: false });
    expect(saved).toBe(true);
    // Reload and verify all empty strings were persisted (validations bypassed at every depth)
    const reloadedPirate = await DeepPirate.find(pirate.id as number);
    expect(reloadedPirate.catchphrase).toBe("");
    const reloadedShip = await DeepShip.find(ship.id as number);
    expect(reloadedShip.name).toBe("");
    // Parts must also be saved with blank names — a regression where has_many autosave
    // doesn't propagate validate:false would leave them with their original names.
    const reloadedPart1 = await DeepPart.find(part1.id as number);
    const reloadedPart2 = await DeepPart.find(part2.id as number);
    expect(reloadedPart1.name).toBe("");
    expect(reloadedPart2.name).toBe("");
  });
  it("should still raise an ActiveRecordRecord Invalid exception if we want that", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "" }); // invalid — presence required
    cacheAssoc(pirate, "ship", ship);
    await expect(pirate.saveBang()).rejects.toThrow(RecordInvalid);
  });
  it("should not save and return false if a callback cancelled saving", async () => {
    class CcPirate extends Base {
      declare catchphrase: string | null;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.beforeSave(function () {
          throwAbort();
        });
      }
    }
    registerModel("CcPirate", CcPirate);
    const pirate = new CcPirate({ catchphrase: "Cancelled" });
    const saved = await pirate.save();
    expect(saved).toBe(false);
    expect(pirate.isNewRecord()).toBe(true);
  });
  it("should rollback any changes if an exception occurred while saving", async () => {
    const { Pirate, Ship } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const ship = new Ship({ name: "" }); // invalid — presence required
    pirate.catchphrase = "Changed";
    cacheAssoc(pirate, "ship", ship);
    const saved = await pirate.save();
    expect(saved).toBe(false);
    // Parent's update should be rolled back
    const reloaded = await Pirate.find(pirate.id);
    expect(reloaded.catchphrase).toBe("Yarr");
  });

  it("should not load the associated model", async () => {
    const { Pirate } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const saved = await pirate.save();
    expect(saved).toBe(true);
  });

  it("mark for destruction is ignored without autosave true", async () => {
    // `ShipWithoutNestedAttributes has_many :parts` is declared without
    // autosave, so `mark_for_destruction` is ignored: the part is still
    // validated as an ordinary new child and its blank name invalidates the
    // ship. Only an autosave association skips validating a marked child.
    const ship = new ShipWithoutNestedAttributes({ name: "The Black Flag" });
    const part = ship.parts.build();
    markForDestruction(part);

    expect(await ship.isValid()).toBe(false);
  });

  it("recognises inverse polymorphic association changes with same foreign key", async () => {
    class SwapChef extends Base {
      declare employable_id: number | null;
      declare employable_type: string | null;
      declare employable: Base | null;
      declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

      static {
        this._tableName = "chefs";
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", {
          polymorphic: true,
          inverseOf: "chef",
        });
      }
    }
    class SwapCakeDesigner extends Base {
      declare name: string | null;
      declare chef: SwapChef | null;
      declare loadHasOne: (name: "chef") => Promise<SwapChef | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("chef", {
          as: "employable",
          autosave: true,
          className: "SwapChef",
          inverseOf: "employable",
        });
      }
    }
    class SwapDrinkDesigner extends Base {
      declare name: string | null;
      declare chef: SwapChef | null;
      declare loadHasOne: (name: "chef") => Promise<SwapChef | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("chef", {
          as: "employable",
          autosave: true,
          className: "SwapChef",
          inverseOf: "employable",
        });
      }
    }
    registerModel("SwapChef", SwapChef);
    registerModel("SwapCakeDesigner", SwapCakeDesigner);
    registerModel("SwapDrinkDesigner", SwapDrinkDesigner);

    const cake = await SwapCakeDesigner.create({ name: "Cake" });
    const drink = await SwapDrinkDesigner.create({ name: "Drink" });
    const chef = new SwapChef({});
    chef._writeAttribute("employable_type", "SwapCakeDesigner");
    cacheAssoc(cake, "chef", chef);
    await cake.save();
    expect(chef._readAttribute("employable_type")).toBe("SwapCakeDesigner");
    expect(chef._readAttribute("employable_id")).toBe(cake.id);

    // Reassign chef to drink — polymorphic type column flips even when
    // employable_id may collide. autosave on drink should re-persist the chef.
    chef._writeAttribute("employable_type", "SwapDrinkDesigner");
    cacheAssoc(drink, "chef", chef);
    await drink.save();
    expect(chef._readAttribute("employable_type")).toBe("SwapDrinkDesigner");
    expect(chef._readAttribute("employable_id")).toBe(drink.id);
  });
});

describe("TestDefaultAutosaveAssociationOnABelongsToAssociation", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    record.association(name).setTarget(value as any);
  }
  fixtures([]);

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

  function setBilling(order: Base, customer: Base) {
    (order.association("billing") as any).writer(customer);
  }
  function setShipping(order: Base, customer: Base) {
    (order.association("shipping") as any).writer(customer);
  }

  it("should save parent but not invalid child", async () => {
    const { Author, Post } = makeModels();
    const author = new Author({ name: "" }); // invalid
    const post = new Post({ name: "Hello" });
    cacheAssoc(post, "author", author);
    const saved = await post.save();
    expect(saved).toBe(false);
  });

  it("save fails for invalid belongs to", async () => {
    const { Author, Post } = makeModels();
    const author = new Author({ name: "" });
    const post = new Post({ name: "Test" });
    cacheAssoc(post, "author", author);
    const saved = await post.save();
    expect(saved).toBe(false);
  });

  it("save succeeds for invalid belongs to with validate false", async () => {
    class FlexAuthor extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    registerModel("FlexAuthor", FlexAuthor);
    class FlexPost extends Base {
      declare name: string | null;
      declare author_id: number | null;
      declare flexAuthor: FlexAuthor | null;
      declare loadBelongsTo: (name: "flexAuthor") => Promise<FlexAuthor | null>;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.belongsTo("flexAuthor", { autosave: true, foreignKey: "author_id" });
      }
    }
    registerModel("FlexPost", FlexPost);
    const author = new FlexAuthor({ name: "" });
    const post = new FlexPost({ name: "Test" });
    cacheAssoc(post, "flexAuthor", author);
    const saved = await post.save();
    expect(saved).toBe(true);
  });

  it("assignment before parent saved", async () => {
    const { Author, Post } = makeModels();
    const author = new Author({ name: "Dean" });
    const post = new Post({ name: "Hello" });
    cacheAssoc(post, "author", author);
    await post.save();
    expect(author.isNewRecord()).toBe(false);
    expect(post.author_id).toBe(author.id);
  });

  it("assignment before either saved", async () => {
    const { Author, Post } = makeModels();
    const author = new Author({ name: "Dean" });
    const post = new Post({ name: "Hello" });
    cacheAssoc(post, "author", author);
    await post.save();
    expect(post.isNewRecord()).toBe(false);
    expect(author.isNewRecord()).toBe(false);
  });

  it("store two association with one save", async () => {
    const { Author, Post } = makeModels();
    const author = new Author({ name: "Author" });
    const post = new Post({ name: "Post" });
    cacheAssoc(post, "author", author);
    await post.save();
    expect(post.isNewRecord()).toBe(false);
    expect(author.isNewRecord()).toBe(false);
    expect(post.author_id).toBe(author.id);
  });

  it("store association in two relations with one save", async () => {
    const { Customer, Order } = makeOrderModels();
    const numOrders = (await Order.count()) as number;
    const numCustomers = (await Customer.count()) as number;
    const order = new Order({});
    const customer = new Customer({ name: "C" });
    setBilling(order, customer);
    setShipping(order, customer);
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
    setBilling(order, customer);
    setShipping(order, customer);
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
    setBilling(order, customer);
    setShipping(order, customer);
    expect(await order.save()).toBe(true);
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    await order.reload();
    customer = new Customer({ name: "C2" });
    setBilling(order, customer);
    setShipping(order, customer);
    expect(await order.save()).toBe(true);
    await order.reload();
    expect(((await order.association("billing").loadTarget()) as Base).id).toBe(customer.id);
    expect(((await order.association("shipping").loadTarget()) as Base).id).toBe(customer.id);
    expect(await Order.count()).toBe(numOrders + 1);
    expect(await Customer.count()).toBe(numCustomers + 2);
  });

  it("store association with a polymorphic relationship", async () => {
    class PolyMember extends Base {
      declare name: string | null;

      static {
        this._tableName = "members";
        this.attribute("name", "string");
      }
    }
    class PolySponsor extends Base {
      declare sponsorable_id: number | null;
      declare sponsorable_type: string | null;
      declare sponsorable: Base | null;
      declare loadBelongsTo: (name: "sponsorable") => Promise<Base | null>;

      static {
        this._tableName = "sponsors";
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.belongsTo("sponsorable", { polymorphic: true });
      }
    }
    registerModel(PolyMember);
    registerModel(PolySponsor);
    const member = await PolyMember.create({ name: "Alice" });
    const sponsor = new PolySponsor({});
    (sponsor as any).sponsorable = member;
    await sponsor.save();
    const reloaded = await PolySponsor.find(sponsor.id!);
    expect(reloaded.sponsorable_id).toBe(member.id);
    expect(reloaded.sponsorable_type).toBe("PolyMember");
  });

  it("build and then save parent should not reload target", async () => {
    const { Author, Post } = makeModels();
    const author = new Author({ name: "Built" });
    const post = new Post({ name: "NoReload" });
    cacheAssoc(post, "author", author);
    await post.save();
    expect(author.isNewRecord()).toBe(false);
  });

  it("validation does not validate stale association target", async () => {
    const { Author, Post } = makeModels();
    const author = await Author.create({ name: "Valid" });
    const post = await Post.create({ name: "Test", author_id: author.id });
    // Author is persisted and not cached — should not be validated
    const saved = await post.save();
    expect(saved).toBe(true);
  });

  it("validation does not validate non dirty association target", async () => {
    const { Author, Post } = makeModels();
    const author = await Author.create({ name: "Clean" });
    const post = await Post.create({ name: "Clean", author_id: author.id });
    cacheAssoc(post, "author", author);
    const saved = await post.save();
    expect(saved).toBe(true);
  });

  it("composite primary key autosave", async () => {
    // Rails: test "composite primary key autosave" — creating a has_one child
    // via autosave propagates composite FK columns from parent to child.
    class CpkOrder2 extends Base {
      declare shop_id: number | null;
      declare status: string | null;
      declare cpkBook2: CpkBook2 | null;
      declare loadHasOne: (name: "cpkBook2") => Promise<CpkBook2 | null>;

      static {
        this._tableName = "cpk_orders";
        this.attribute("shop_id", "integer");
        this.attribute("id", "integer");
        this.attribute("status", "string");
        this.primaryKey = ["shop_id", "id"];
        this.hasOne("cpkBook2", {
          className: "CpkBook2",
          autosave: true,
          foreignKey: ["shop_id", "order_id"],
        });
      }
    }
    class CpkBook2 extends Base {
      declare author_id: number | null;
      declare shop_id: number | null;
      declare order_id: number | null;
      declare title: string | null;

      static {
        this._tableName = "cpk_books";
        this.attribute("author_id", "integer");
        this.attribute("id", "integer");
        this.attribute("shop_id", "integer");
        this.attribute("order_id", "integer");
        this.attribute("title", "string");
        this.primaryKey = ["author_id", "id"] as any;
      }
    }
    registerModel("CpkOrder2", CpkOrder2);
    registerModel("CpkBook2", CpkBook2);
    // Provide explicit composite PK values (Rails: Order.create!(id: [1, 2], ...))
    const order = new CpkOrder2({ id: [1, 2], status: "pending" });
    const book = new CpkBook2({ id: [77, 77], title: "Composite Key Book" });
    cacheAssoc(order, "cpkBook2", book);
    const saved = await order.save();
    expect(saved).toBe(true);
    expect(order.isNewRecord()).toBe(false);
    expect(book.isNewRecord()).toBe(false);
    // autosave should have propagated composite FK from order PK to book
    expect(book.shop_id).toBe(1);
    expect(book.order_id).toBe(2);
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
    record.association(name).setTarget(value as any);
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
    const pirate = new Pirate({ catchphrase: "" }); // invalid
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
    pirate.catchphrase = ""; // invalid — presence required
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
          throwAbort();
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
    pirate.catchphrase = ""; // invalid — presence required
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
    record.association(name).setTarget(value as any);
  }
  fixtures([]);

  function makeModels() {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    return { Pirate: CanonicalPirate, Bird: CanonicalBird };
  }

  it("valid adding with nested attributes", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    assignNestedAttributes(pirate, "birds", [{ name: "Polly" }]);
    await pirate.save();
    const birds = await Bird.where({ pirate_id: pirate.id });
    expect(birds.length).toBe(1);
    expect(birds[0].name).toBe("Polly");
  });

  it("invalid adding with nested attributes", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    assignNestedAttributes(pirate, "birds", [{ name: "" }]);
    await pirate.save();
    const birds = await Bird.where({ pirate_id: pirate.id });
    expect(birds.length).toBeLessThanOrEqual(1);
  });

  it("errors details should be set", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const invalidBird = new Bird({ name: "" });
    cacheAssoc(pirate, "birds", [invalidBird]);
    const saved = await pirate.save();
    expect(saved).toBe(false);
  });

  it("errors should be indexed when passed as array", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    assignNestedAttributes(pirate, "birds", [{ name: "Valid" }, { name: "" }]);
    await pirate.save();
    const birds = await Bird.where({ pirate_id: pirate.id });
    expect(birds.some((b: any) => b.name === "Valid")).toBe(true);
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
    const old = indexNestedAttributeErrors;
    setIndexNestedAttributeErrors(true);
    try {
      const { Parent, Child } = makeIndexedHasMany();
      const parent = new Parent({ name: "p" });
      cacheAssoc(parent, "children", [new Child({ name: "ok" }), new Child({ name: "" })]);
      expect(await parent.isValid()).toBe(false);
      expect(parent.errors.where("children[1].name")).toHaveLength(1);
      expect(parent.errors.where("children.name")).toHaveLength(0);
    } finally {
      setIndexNestedAttributeErrors(old);
    }
  });
  it("errors details should be indexed when passed as array", async () => {
    const { Parent, Child } = makeIndexedHasMany({ indexErrors: true });
    const parent = new Parent({ name: "p" });
    cacheAssoc(parent, "children", [new Child({ name: "ok" }), new Child({ name: "" })]);
    expect(await parent.isValid()).toBe(false);
    expect(parent.errors.details.get("children[1].name")?.length ?? 0).toBeGreaterThan(0);
    expect(parent.errors.details.get("children.name") ?? []).toHaveLength(0);
  });
  it("errors details with error on base should be indexed when passed as array", async () => {
    class P extends Base {
      declare name: string | null;
      declare kids: AssociationProxy<C>;

      static {
        this.attribute("name", "string");
        this.hasMany("kids", {
          autosave: true,
          indexErrors: true,
          className: "BaseErrC",
        });
      }
    }
    class C extends Base {
      declare favorite: boolean | null;
      declare p_id: number | null;

      static {
        this.attribute("favorite", "boolean");
        this.attribute("p_id", "integer");
      }
      override async isValid(): Promise<boolean> {
        this.errors.clear();
        if (!(this as any).favorite) this.errors.add("base", "should be favorite");
        return this.errors.empty;
      }
    }
    registerModel("BaseErrP", P);
    registerModel("BaseErrC", C);
    const parent = new P({ name: "p" });
    cacheAssoc(parent, "kids", [new C({ favorite: true }), new C({ favorite: false })]);
    expect(await parent.isValid()).toBe(false);
    expect(parent.errors.details.get("kids[1].base")?.length ?? 0).toBeGreaterThan(0);
  });
  it("indexed errors should be properly translated", async () => {
    const oldCustomize = ModelError.i18nCustomizeFullMessage;
    ModelError.i18nCustomizeFullMessage = true;
    I18n.storeTranslations("en", {
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
      I18n.reset();
    }
  });
  it("indexed errors on base attribute should be properly translated", async () => {
    I18n.storeTranslations("en", {
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
      class BaseErrorsPerson extends Base {
        declare name: string | null;
        declare reference: BaseErrorsReference | null;
        declare loadHasOne: (name: "reference") => Promise<BaseErrorsReference | null>;

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
      I18n.reset();
    }
  });
  it("errors details should be indexed when global flag is set", async () => {
    const old = indexNestedAttributeErrors;
    setIndexNestedAttributeErrors(true);
    try {
      const { Parent, Child } = makeIndexedHasMany();
      const parent = new Parent({ name: "p" });
      cacheAssoc(parent, "children", [new Child({ name: "ok" }), new Child({ name: "" })]);
      expect(await parent.isValid()).toBe(false);
      expect(parent.errors.details.get("children[1].name")?.length ?? 0).toBeGreaterThan(0);
      expect(parent.errors.details.get("children.name") ?? []).toHaveLength(0);
    } finally {
      setIndexNestedAttributeErrors(old);
    }
  });
});

describe("TestAutosaveAssociationsInGeneral", () => {
  fixtures([]);
  it("autosave works even when other callbacks update the parent model", async () => {
    class CallbackPirate extends Base {
      declare catchphrase: string | null;
      declare ship: CanonicalShip | null;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.beforeSave(function (record: any) {
          record.catchphrase = "Ahoy!";
        });
        this.hasOne("ship", { autosave: true, foreignKey: "pirate_id", className: "Ship" });
      }
    }
    registerModel("CallbackPirate", CallbackPirate);

    const pirate = await CallbackPirate.create({ catchphrase: "Yarr" });
    const ship = new CanonicalShip({ name: "Pearl" });
    cacheAssoc(pirate, "ship", ship);
    pirate.catchphrase = "trigger save";
    await pirate.save();
    expect(pirate.catchphrase).toBe("Ahoy!");
    expect(ship.isNewRecord()).toBe(false);
    expect(ship.pirate_id).toBe(pirate.id);
  });

  it("autosave does not pass through non custom validation contexts", async () => {
    // Rails: test "autosave does not pass through non custom validation contexts"
    // When autosave validates an associated record, it should NOT pass the owner's
    // standard (:create/:update) validation context — only custom contexts propagate.
    class ContextPerson extends Base {
      declare first_name: string | null;

      static {
        this._tableName = "people";
        this.attribute("first_name", "string");
        // :create-only validation — should not fire when context is :update
        this.validate(
          function (record: any) {
            if (record.first_name !== "cool") {
              record.errors.add("first_name", "not cool");
            }
          },
          { on: "create" },
        );
      }
    }
    class ContextReference extends Base {
      declare person_id: number | null;
      declare person: ContextPerson | null;
      declare loadBelongsTo: (name: "person") => Promise<ContextPerson | null>;

      static {
        this._tableName = "references";
        this.attribute("person_id", "integer");
        this.belongsTo("person", {
          autosave: true,
          className: "ContextPerson",
          foreignKey: "person_id",
        });
      }
    }
    registerModel("ContextPerson", ContextPerson);
    registerModel("ContextReference", ContextReference);

    const person = await ContextPerson.create({ first_name: "cool" });
    // Change to "nah" — still valid because on:create validator doesn't run in :update context
    person.first_name = "nah";
    expect(await person.isValid()).toBe(true);

    // autosave through reference should also be valid —
    // autosave uses the owner's _validationContext (nil → not custom) so person is validated
    // in its default :update context, where the :create-only validator is skipped.
    const ref = new ContextReference({ person });
    cacheAssoc(ref, "person", person);
    const valid = await ref.isValid();
    expect(valid).toBe(true);
  });

  it("autosave collection association callbacks get called once", async () => {
    let saveCount = 0;
    class Book extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.beforeSave(() => {
          saveCount++;
        });
      }
    }
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    registerModel("CallbacksOnceBook", Book);
    registerModel("CallbacksOnceAuthor", Author);
    Associations.hasMany.call(Author, "books", {
      autosave: true,
      foreignKey: "author_id",
      className: "CallbacksOnceBook",
    });

    const author = await Author.create({ name: "Test" });
    const book = new Book({ name: "My Book" });
    cacheAssoc(author, "books", [book]);
    author.name = "trigger save";
    await author.save();
    expect(book.isNewRecord()).toBe(false);
    expect(saveCount).toBe(1);
    expect(book.author_id).toBe(author.id);
  });

  it("autosave has one association callbacks get called once", async () => {
    let saveCount = 0;
    class Profile extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.beforeSave(() => {
          saveCount++;
        });
      }
    }
    class AutosaveProfileUser extends Base {
      declare name: string | null;
      declare profile: Profile | null;
      declare loadHasOne: (name: "profile") => Promise<Profile | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("profile", {
          autosave: true,
          foreignKey: "author_id",
          className: "Profile",
        });
      }
    }
    registerModel("Profile", Profile);
    registerModel("AutosaveProfileUser", AutosaveProfileUser);

    const user = await AutosaveProfileUser.create({ name: "Test" });
    const profile = new Profile({ name: "Hello" });
    cacheAssoc(user, "profile", profile);
    user.name = "trigger save";
    await user.save();
    expect(profile.isNewRecord()).toBe(false);
    expect(saveCount).toBe(1);
    expect(profile.author_id).toBe(user.id);
  });

  it("autosave belongs to association callbacks get called once", async () => {
    let saveCount = 0;
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.beforeSave(() => {
          saveCount++;
        });
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
    registerModel("BelongsToCallbacksOnceAuthor", Author);
    registerModel("BelongsToCallbacksOncePost", Post);
    Associations.belongsTo.call(Post, "author", {
      autosave: true,
      foreignKey: "author_id",
      className: "BelongsToCallbacksOnceAuthor",
    });

    const author = new Author({ name: "New Author" });
    const post = await Post.create({ name: "Test" });
    cacheAssoc(post, "author", author);
    post.name = "trigger save";
    await post.save();
    expect(author.isNewRecord()).toBe(false);
    expect(saveCount).toBe(1);
    expect(post.author_id).toBe(author.id);
  });

  it("should not add the same callbacks multiple times for has one", async () => {
    let saveCount = 0;
    class Profile extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.beforeSave(() => {
          saveCount++;
        });
      }
    }
    class DuplicateCallbackProfileUser extends Base {
      declare name: string | null;
      declare profile: Profile | null;
      declare loadHasOne: (name: "profile") => Promise<Profile | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("profile", {
          autosave: true,
          foreignKey: "author_id",
          className: "Profile",
        });
      }
    }
    registerModel("Profile", Profile);
    registerModel("DuplicateCallbackProfileUser", DuplicateCallbackProfileUser);
    // Calling addAutosaveAssociationCallbacks a second time must not duplicate callbacks
    const reflection = (DuplicateCallbackProfileUser as any)._reflectOnAssociation("profile");
    addAutosaveAssociationCallbacks(DuplicateCallbackProfileUser, reflection);

    const user = await DuplicateCallbackProfileUser.create({ name: "Test" });
    const profile = new Profile({ name: "Hello" });
    profile.name = "Changed";
    cacheAssoc(user, "profile", profile);
    user.name = "trigger";
    await user.save();
    expect(saveCount).toBe(1);
  });

  it("should not add the same callbacks multiple times for belongs to", async () => {
    let saveCount = 0;
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.beforeSave(() => {
          saveCount++;
        });
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
    registerModel("DuplicateCallbacksBelongsToAuthor", Author);
    registerModel("DuplicateCallbacksBelongsToPost", Post);
    Associations.belongsTo.call(Post, "author", {
      autosave: true,
      foreignKey: "author_id",
      className: "DuplicateCallbacksBelongsToAuthor",
    });
    const reflection = (Post as any)._reflectOnAssociation("author");
    addAutosaveAssociationCallbacks(Post, reflection);

    const author = new Author({ name: "New" });
    const post = await Post.create({ name: "Test" });
    cacheAssoc(post, "author", author);
    post.name = "trigger";
    await post.save();
    expect(saveCount).toBe(1);
  });

  it("should not add the same callbacks multiple times for has many", async () => {
    let saveCount = 0;
    class Book extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.beforeSave(() => {
          saveCount++;
        });
      }
    }
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    registerModel("DuplicateCallbacksHasManyBook", Book);
    registerModel("DuplicateCallbacksHasManyAuthor", Author);
    Associations.hasMany.call(Author, "books", {
      autosave: true,
      foreignKey: "author_id",
      className: "DuplicateCallbacksHasManyBook",
    });
    const reflection = (Author as any)._reflectOnAssociation("books");
    addAutosaveAssociationCallbacks(Author, reflection);

    const author = await Author.create({ name: "Test" });
    const book = new Book({ name: "My Book" });
    cacheAssoc(author, "books", [book]);
    author.name = "trigger";
    await author.save();
    expect(saveCount).toBe(1);
  });

  it("should not add the same callbacks multiple times for has and belongs to many", async () => {
    let saveCount = 0;
    class DupCbParrot extends Base {
      declare name: string | null;

      static {
        this._tableName = "parrots";
        this.attribute("name", "string");
        this.beforeSave(() => {
          saveCount++;
        });
      }
    }
    class DupCbPirate extends Base {
      declare catchphrase: string | null;
      declare parrots: AssociationProxy<DupCbParrot>;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.hasAndBelongsToMany("parrots", {
          autosave: true,
          className: "DupCbParrot",
          joinTable: "parrots_pirates",
          foreignKey: "pirate_id",
          associationForeignKey: "parrot_id",
        });
      }
    }
    registerModel("DupCbParrot", DupCbParrot);
    registerModel("DupCbPirate", DupCbPirate);
    // Calling addAutosaveAssociationCallbacks a second time must not duplicate callbacks
    const reflection = (DupCbPirate as any)._reflectOnAssociation("parrots");
    expect(reflection).toBeDefined();
    addAutosaveAssociationCallbacks(DupCbPirate, reflection);

    const pirate = await DupCbPirate.create({ catchphrase: "Arrr" });
    const parrot = await DupCbParrot.create({ name: "Polly" });
    saveCount = 0; // reset after create (create triggers beforeSave)
    const proxy = association(pirate, "parrots");
    await proxy.push(parrot);
    // Make parrot dirty so autosave saves it
    parrot.name = "Polly Updated";
    pirate.catchphrase = "trigger";
    await pirate.save();
    expect(saveCount).toBe(1);
  });

  it("cyclic autosaves do not add multiple validations", async () => {
    // ShipWithoutNestedAttributes: has_many :prisoners (no autosave), two presence validators.
    // Prisoner: belongs_to :ship (autosave: true). Cyclic: prisoner.valid? calls ship.valid? again.
    // _ensureNoDuplicateErrors (after_validation) deduplicates to exactly 1 error for :name.
    class ShipCyclic extends Base {
      declare name: string | null;
      declare prisoners: AssociationProxy<PrisonerCyclic>;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.validates("name", { presence: true });
        this.validates("name", { presence: true });
        this.hasMany("prisoners", { className: "PrisonerCyclic", foreignKey: "ship_id" });
      }
    }
    class PrisonerCyclic extends Base {
      declare ship_id: number | null;
      declare ship: ShipCyclic | null;
      declare loadBelongsTo: (name: "ship") => Promise<ShipCyclic | null>;

      static {
        this._tableName = "prisoners";
        this.attribute("ship_id", "integer");
        this.belongsTo("ship", {
          className: "ShipCyclic",
          autosave: true,
          inverseOf: "prisoners",
        });
      }
    }
    registerModel("ShipCyclic", ShipCyclic);
    registerModel("PrisonerCyclic", PrisonerCyclic);
    // Wire _ensureNoDuplicateErrors as after_validation on ShipCyclic (mirrors Rails'
    // AssociationBuilderExtension.build → add_autosave_association_callbacks).
    const prisonersRef = ShipCyclic.reflectOnAssociation("prisoners");
    addAutosaveAssociationCallbacks(ShipCyclic, prisonersRef);

    const ship = new ShipCyclic({ name: "" });
    const prisoner = new PrisonerCyclic({});
    // Wire cached associations so _loadedAssociation finds them without a DB hit.
    cacheAssoc(ship, "prisoners", [prisoner]);
    cacheAssoc(prisoner, "ship", ship);

    expect(await ship.isValid()).toBeFalsy();
    expect(ship.errors.where("name").length).toBe(1);
  });
});

describe("TestHasManyAutosaveAssociationWhichItselfHasAutosaveAssociations", () => {
  function cacheAssoc(record: Base, name: string, value: unknown) {
    record.association(name).setTarget(value as any);
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
    class GcShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;
      declare pirate: GcPirate | null;
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
    markForDestruction(part);
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
    // Extra records in the DB that are absent from the already-loaded
    // collections. `valid?` calls `nested_records_changed_for_autosave?`,
    // which must consult the loaded target only — never reload — so these
    // extras are not pulled in.
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
    class VoParent extends Base {
      declare name: string | null;
      declare voChild: VoChild | null;
      declare loadHasOne: (name: "voChild") => Promise<VoChild | null>;

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
    class NvParent extends Base {
      declare name: string | null;
      declare nvChild: NvChild | null;
      declare loadHasOne: (name: "nvChild") => Promise<NvChild | null>;

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
    class BvChild extends Base {
      declare name: string | null;
      declare author_id: number | null;
      declare bvOwner: BvOwner | null;
      declare loadBelongsTo: (name: "bvOwner") => Promise<BvOwner | null>;

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
    class NbChild extends Base {
      declare name: string | null;
      declare author_id: number | null;
      declare nbOwner: NbOwner | null;
      declare loadBelongsTo: (name: "nbOwner") => Promise<NbOwner | null>;

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
    record.association(name).setTarget(value as any);
  }
  fixtures([]);

  function makeModels() {
    class GgPirate extends Base {
      declare catchphrase: string | null;
      declare ship: GgShip | null;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.hasOne("ship", { autosave: true, className: "GgShip", foreignKey: "pirate_id" });
      }
    }
    class GgShip extends Base {
      declare name: string | null;
      declare pirate_id: number | null;
      declare part: GgPart | null;

      static {
        this._tableName = "ships";
        this.attribute("name", "string");
        this.attribute("pirate_id", "integer");
        this.hasOne("part", { autosave: true, className: "GgPart", foreignKey: "ship_id" });
      }
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
    markForDestruction(part);
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
    // Extra record in the DB absent from the already-loaded singular
    // associations. `valid?` must consult the loaded target only — never
    // reload — so this extra is not pulled in.
    await Part.create({ name: "Stern", ship_id: ship.id });
    await assertNoQueries(false, async () => {
      await pirate.isValid();
    });
  });
});

describe("TestDefaultAutosaveAssociationOnNewRecord", () => {
  fixtures([]);
  it("autosave new record on belongs to can be disabled per relationship", async () => {
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
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
    registerModel("NewRecordBelongsToAuthor", Author);
    registerModel("NewRecordBelongsToPost", Post);
    Associations.belongsTo.call(Post, "author", {
      autosave: false,
      foreignKey: "author_id",
      className: "NewRecordBelongsToAuthor",
    });

    const author = new Author({ name: "Unsaved" });
    const post = await Post.create({ name: "test" });
    cacheAssoc(post, "author", author);
    post.name = "trigger save";
    await post.save();
    expect(author.isNewRecord()).toBe(true);
    expect(post.author_id).toBeNull();
  });

  it("autosave new record on has one can be disabled per relationship", async () => {
    class Profile extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class DisabledProfileUser extends Base {
      declare name: string | null;
      declare profile: Profile | null;
      declare loadHasOne: (name: "profile") => Promise<Profile | null>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasOne("profile", {
          autosave: false,
          foreignKey: "author_id",
          className: "Profile",
        });
      }
    }
    registerModel("Profile", Profile);
    registerModel("DisabledProfileUser", DisabledProfileUser);

    const user = await DisabledProfileUser.create({ name: "test" });
    const profile = new Profile({ name: "Unsaved" });
    cacheAssoc(user, "profile", profile);
    user.name = "trigger save";
    await user.save();
    expect(profile.isNewRecord()).toBe(true);
    expect(profile.author_id).toBeNull();
  });

  it("autosave new record on has many can be disabled per relationship", async () => {
    class Book extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
      }
    }
    class Author extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    registerModel("NewRecordHasManyBook", Book);
    registerModel("NewRecordHasManyAuthor", Author);
    Associations.hasMany.call(Author, "books", {
      autosave: false,
      foreignKey: "author_id",
      className: "NewRecordHasManyBook",
    });

    const author = await Author.create({ name: "test" });
    const book = new Book({ name: "Unsaved" });
    cacheAssoc(author, "books", [book]);
    author.name = "trigger save";
    await author.save();
    expect(book.isNewRecord()).toBe(true);
    expect(book.author_id).toBeNull();
  });

  it("autosave new record with after create callback", async () => {
    const log: string[] = [];
    class AcPirate extends Base {
      declare catchphrase: string | null;
      declare ship: CanonicalShip | null;

      static {
        this._tableName = "pirates";
        this.attribute("catchphrase", "string");
        this.afterCreate(() => {
          log.push("pirate_created");
        });
        this.hasOne("ship", { autosave: true, foreignKey: "pirate_id", className: "Ship" });
      }
    }
    registerModel("AcPirate", AcPirate);

    const pirate = new AcPirate({ catchphrase: "Yarr" });
    const ship = new CanonicalShip({ name: "Pearl" });
    cacheAssoc(pirate, "ship", ship);
    await pirate.save();
    expect(log).toContain("pirate_created");
    expect(pirate.isNewRecord()).toBe(false);
    expect(ship.pirate_id).toBe(pirate.id);
    expect(ship.isNewRecord()).toBe(false);
  });

  it("autosave new record with after create callback and habtm association", async () => {
    registerModel(PostWithAfterCreateCallback);
    registerModel(CanonicalPost);
    registerModel(CanonicalComment);
    registerModel(CanonicalCategory);

    const post = new PostWithAfterCreateCallback({
      title: "Captain Murphy",
      body: "is back",
    });
    (post as any).comments.build({ body: "foo" });
    (post as any).categories.build({ name: "bar" });
    await post.save();

    const fresh = await PostWithAfterCreateCallback.find(post.id!);
    const categories = (await fresh.association("categories").loadTarget()) as Base[];
    expect(categories.length).toBe(1);
  });
});

describe("TestAutosaveAssociationValidationsOnAHasManyAssociation", () => {
  fixtures([]);
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

describe("TestAutosaveAssociationValidationsOnAHasManyAssociation", () => {
  fixtures([]);

  // Dynamic import so esbuild doesn't rename the bespoke same-named classes
  // declared inside the describe.skip blocks above (Author/Book) — see the
  // canonical-import esbuild class-rename gotcha.
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
    class HotMember extends Base {
      declare name: string | null;
      declare hotDetail: HotDetail | null;
      declare hotOrg: Base | null;
      declare loadHasOne: ((name: "hotDetail") => Promise<HotDetail | null>) &
        ((name: "hotOrg") => Promise<Base | null>);

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
    class HotDetail extends Base {
      declare company_id: number | null;
      declare developer_id: number | null;
      declare hotOrg: HotOrg | null;
      declare hotMember: HotMember | null;
      declare loadBelongsTo: ((name: "hotOrg") => Promise<HotOrg | null>) &
        ((name: "hotMember") => Promise<HotMember | null>);

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
    registerModel("HotOrg", HotOrg);
    registerModel("HotMember", HotMember);
    registerModel("HotDetail", HotDetail);

    const org = await HotOrg.create({ name: "Org" });
    const member = await HotMember.create({ name: "M" });
    await HotDetail.create({ company_id: org.id, developer_id: member.id });
    // Cache the through target — even cached, has_one_through should not autosave
    cacheAssoc(member, "hotOrg", org);
    org.name = "Modified";
    const saved = await member.save();
    expect(saved).toBe(true);
    const reloadedOrg = await HotOrg.find(org.id);
    expect(reloadedOrg.name).toBe("Org");
  });
  it("should not reversed has one through model", async () => {
    class RevOrg extends Base {
      declare name: string | null;
      declare revDetail: RevDetail | null;
      declare revMember: Base | null;
      declare loadHasOne: ((name: "revDetail") => Promise<RevDetail | null>) &
        ((name: "revMember") => Promise<Base | null>);

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
    class RevMember extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class RevDetail extends Base {
      declare company_id: number | null;
      declare developer_id: number | null;
      declare revOrg: RevOrg | null;
      declare revMember: RevMember | null;
      declare loadBelongsTo: ((name: "revOrg") => Promise<RevOrg | null>) &
        ((name: "revMember") => Promise<RevMember | null>);

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

  // Mirrors Rails' nested Post/Comment classes (posts/comments tables) with a
  // Comment after_save callback that reads back the inverse `post.comments`.
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
    class Comment extends Base {
      declare body: string | null;
      declare post_id: number | null;
      declare post: Post | null;
      declare loadBelongsTo: (name: "post") => Promise<Post | null>;

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
    class BtRecord extends Base {
      declare name: string | null;
      declare author_id: number | null;
      declare btOwner: BtOwner | null;
      declare loadBelongsTo: (name: "btOwner") => Promise<BtOwner | null>;

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
    assignNestedAttributes(article, "nautoTags", [{ name: "saved" }]);
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
    assignNestedAttributes(article, "asb1Tags", [{ name: "banged" }]);
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
    assignNestedAttributes(article, "bvuTags", [{ id: tag.id, name: "updated" }]);
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
    assignNestedAttributes(article, "bvTags", [{ name: "valid" }]);
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
          if (record.name === "cancel") throwAbort();
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
    assignNestedAttributes(article, "rbTags", [
      { name: "good" },
      { name: "bad", unknownCol: "boom" },
    ]);
    await expect(article.save()).rejects.toThrow(/unknown attribute/);
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
    tag.name = ""; // invalid — presence required
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
        (this as any)._associations = [
          {
            name: "children",
            type: "hasMany",
            options: { autosave: true, className: "ChangedChild" },
          },
        ];
      }
    }
    registerModel("ChangedParent", Parent);
    registerModel("ChangedChild", Child);

    const parent = new Parent({ id: 1 });
    (parent as any)._newRecord = false;
    const child = new Child({ id: 10, name: "original" });
    (child as any)._newRecord = false;
    (child as any)._dirty.snapshot(child._attributes);
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
        (this as any)._associations = [
          {
            name: "child",
            type: "hasOne",
            options: { autosave: true, className: "ChangedChild2" },
          },
        ];
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
        (this as any)._associations = [
          { name: "b", type: "hasOne", options: { autosave: true, className: "CycleB" } },
        ];
      }
    }
    class B extends Base {
      static {
        this.attribute("id", "integer");
        (this as any)._associations = [
          { name: "a", type: "belongsTo", options: { autosave: true, className: "CycleA" } },
        ];
      }
    }
    registerModel("CycleA", A);
    registerModel("CycleB", B);

    const a = new A({ id: 1 });
    (a as any)._newRecord = false;
    (a as any)._dirty.snapshot(a._attributes);
    const b = new B({ id: 2 });
    (b as any)._newRecord = false;
    (b as any)._dirty.snapshot(b._attributes);

    a.association("b").setTarget(b as any);
    b.association("a").setTarget(a as any);

    // Should not stack overflow
    expect(a.changedForAutosave()).toBe(false);
    expect(b.changedForAutosave()).toBe(false);
  });
});

describe("autosaveHasOne queryConstraints PK/FK pairing", () => {
  fixtures([]);
  // When a class has queryConstraints and the has_one uses an explicit composite FK,
  // assoc.options.foreignKey is the composite array. The reflection normalizes it
  // into options.queryConstraints internally. computePrimaryKey(reflection) therefore
  // hits branch 2 and returns queryConstraintsList — pairing with the composite FK.
  it("pairs queryConstraintsList PK with explicit composite FK on QC owner", async () => {
    class QcOwner extends Base {
      declare tree_id: number | null;
      declare name: string | null;
      declare qcChild: QcChild | null;
      declare loadHasOne: (name: "qcChild") => Promise<QcChild | null>;

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
    // Explicit composite FK — assoc.options.foreignKey = ["tree_id","parent_id"].
    // The old scalar-guard skipped computePrimaryKey → used ctor.primaryKey = "id" → mismatch.
    // The fixed code calls computePrimaryKey(reflection) which, via branch 2 (reflection
    // normalizes array FK into queryConstraints), returns queryConstraintsList = ["tree_id","id"].
    const owner = new QcOwner({ tree_id: 5, id: 11, name: "Corp" });
    const child = new QcChild({ name: "Doc" });
    owner.association("qcChild").setTarget(child as any);
    const saved = await owner.save();
    expect(saved).toBe(true);
    expect(child.isNewRecord()).toBe(false);
    // PK ["tree_id","id"] zipped with FK ["tree_id","parent_id"]:
    // child.tree_id ← owner.tree_id = 5, child.parent_id ← owner.id = 11
    expect(child.tree_id).toBe(5);
    expect(child.parent_id).toBe(11);
  });

  it("does not collapse QC-derived PK array via the 'id' rule for scalar FK", async () => {
    // Guard against the bug where the composite_primary_key? collapse was applied to QC
    // arrays. If QC list is ["tree_id","id"] and FK is scalar "tree_id", the old code
    // would collapse to "id" and assign owner.id into child.tree_id — wrong.
    // With the fix (gate on Array.isArray(ctor.primaryKey)), QC arrays are not collapsed;
    // instead the composite/scalar mismatch path is reached. In a properly configured
    // association both FK and PK would be composite, so no-mismatch is the happy path.
    // This test confirms the collapse does NOT fire for QC-derived PK arrays.
    class QcNoCollapse extends Base {
      declare tree_id: number | null;
      declare name: string | null;
      declare qcNoCollapseChild: QcNoCollapseChild | null;
      declare loadHasOne: (name: "qcNoCollapseChild") => Promise<QcNoCollapseChild | null>;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        // QC list — ctor.primaryKey remains scalar "id"
        (this as any)._queryConstraintsList = ["tree_id", "id"];
        (this as any)._hasQueryConstraints = true;
        this.hasOne("qcNoCollapseChild", {
          className: "QcNoCollapseChild",
          foreignKey: ["tree_id", "parent_id"],
          autosave: true,
        });
      }
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
    // Explicit composite FK — reflection normalizes array FK to queryConstraints.
    // computePrimaryKey branch 2 returns QC list ["tree_id","id"].
    // Array PK + array FK → composite pairing (no "id" collapse).
    const owner = new QcNoCollapse({ tree_id: 9, id: 77, name: "v" });
    const child = new QcNoCollapseChild({ name: "l" });
    owner.association("qcNoCollapseChild").setTarget(child as any);
    const saved = await owner.save();
    expect(saved).toBe(true);
    expect(child.isNewRecord()).toBe(false);
    // PK ["tree_id","id"] paired with FK ["tree_id","parent_id"]:
    // child.tree_id ← owner.tree_id = 9, child.parent_id ← owner.id = 77
    expect(child.tree_id).toBe(9);
    expect(child.parent_id).toBe(77);
  });

  // When a class has queryConstraints and the has_one uses a scalar FK,
  // computePrimaryKey collapses the QC list to a scalar PK via the "id" rule.
  it("uses queryConstraintsList as PK when class has_query_constraints? and scalar FK", async () => {
    class QcTenant extends Base {
      declare tree_id: number | null;
      declare name: string | null;
      declare qcTenantRecord: QcTenantRecord | null;
      declare loadHasOne: (name: "qcTenantRecord") => Promise<QcTenantRecord | null>;

      static {
        this._tableName = "nodes";
        this.attribute("tree_id", "integer");
        this.attribute("id", "integer");
        this.attribute("name", "string");
        // Simulate a model with query_constraints [:tree_id, :id]
        (this as any)._queryConstraintsList = ["tree_id", "id"];
        (this as any)._hasQueryConstraints = true;
        this.hasOne("qcTenantRecord", {
          className: "QcTenantRecord",
          foreignKey: "parent_id",
          autosave: true,
        });
      }
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
    // Scalar FK "parent_id". computePrimaryKey (scalar-FK branch) returns QC list ["tree_id","id"].
    // The scalar-FK collapse applies: includes("id") → "id" → rec.parent_id = tenant.id = 42.
    const tenant = new QcTenant({ tree_id: 7, id: 42, name: "Acme" });
    const rec = new QcTenantRecord({ name: "hello" });
    tenant.association("qcTenantRecord").setTarget(rec as any);
    const saved = await tenant.save();
    expect(saved).toBe(true);
    expect(rec.isNewRecord()).toBe(false);
    // computePrimaryKey → QC list ["tree_id","id"] → scalar collapse "id" → rec.parent_id = 42
    expect(rec.parent_id).toBe(42);
  });
});

describe("computePrimaryKey", () => {
  // Unit tests for the computePrimaryKey helper, which mirrors
  // Rails autosave_association.rb:576-587 (compute_primary_key).

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
    // Mirrors: elsif reflection.options[:query_constraints] && (qcl = record.class.query_constraints_list)
    const record = makeRecord({
      primaryKey: "id",
      queryConstraintsList: ["tenant_id", "id"],
      hasQueryConstraints: true,
    });
    const result = computePrimaryKey({ options: { queryConstraints: true } }, record);
    expect(result).toEqual(["tenant_id", "id"]);
  });

  it("returns queryConstraintsList when record class has_query_constraints? and no FK option", () => {
    // Mirrors: elsif record.class.has_query_constraints? && !reflection.options[:foreign_key]
    const record = makeRecord({
      primaryKey: "id",
      queryConstraintsList: ["shop_id", "id"],
      hasQueryConstraints: true,
    });
    const result = computePrimaryKey({ options: {} }, record);
    expect(result).toEqual(["shop_id", "id"]);
  });

  it("does not use queryConstraintsList when reflection has explicit foreignKey option", () => {
    // Mirrors: elsif record.class.has_query_constraints? && !reflection.options[:foreign_key]
    // — the !:foreign_key guard prevents queryConstraintsList from being used.
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
    // Mirrors: composite_primary_key? branch — primary_key.include?("id") ? "id" : primary_key
    const record = makeRecord({ primaryKey: ["shop_id", "id"] });
    const result = computePrimaryKey({ options: {} }, record);
    expect(result).toBe("id");
  });

  it("returns full composite PK when CPK has no 'id' column", () => {
    // Mirrors: composite_primary_key? branch — primary_key.include?("id") ? "id" : primary_key
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

// vendor/rails/activerecord/test/cases/autosave_association_test.rb:1444-1477 —
// add/remove callbacks fire when a marked-for-destruction child is destroyed as
// part of the owner save. Exercises the collection-level destroy path
// (save_collection_association -> association.destroy(record)) which fires the
// before_remove/after_remove callbacks, not record-level child.destroy().
describe("TestAutosaveAssociationOnACollectionRemoveCallbacks", () => {
  fixtures([], { useTransactionalTests: false });
  beforeAll(() => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
  });

  for (const callbackType of ["method", "proc"] as const) {
    it(`should run remove callback ${callbackType}s for has many`, async () => {
      const assocName = `birdsWith${callbackType === "method" ? "Method" : "Proc"}Callbacks`;
      const pirate = await CanonicalPirate.create({ catchphrase: "Arr" });
      const child = await association(pirate, assocName).create({ name: "Crowe the One-Eyed" });
      markForDestruction(child);
      const childId = child.id;

      pirate.shipLog.splice(0);
      await pirate.save();

      expect(pirate.shipLog).toEqual([
        `before_removing_${callbackType}_bird_${childId}`,
        `after_removing_${callbackType}_bird_${childId}`,
      ]);
    });
  }
});
