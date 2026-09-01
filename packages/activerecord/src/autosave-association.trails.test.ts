import type { AssociationProxy } from "./associations/collection-proxy.js";
import { throwAbort } from "@blazetrails/activesupport";
import { describe, it, expect, beforeAll } from "vitest";
import { Base, registerModel, assignNestedAttributes } from "./index.js";
import { Associations } from "./associations.js";
import { Company as CanonicalCompany, Firm, Client } from "./test-helpers/models/company.js";
import { Pirate as CanonicalPirate } from "./test-helpers/models/pirate.js";
import { Bird as CanonicalBird } from "./test-helpers/models/bird.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Developer } from "./test-helpers/models/developer.js";
import { Eye, Iris, IrisWithReadOnlyForeignKey } from "./test-helpers/models/eye.js";
import { fixtures } from "./test-fixtures.js";

function cacheAssoc(record: Base, name: string, value: unknown) {
  const association = record.association(name) as any;
  if (typeof association.isUpdated === "function") association.writer(value as any);
  else association.setTarget(value as any);
}

describe("TestDefaultAutosaveAssociationOnAHasOneAssociation", () => {
  fixtures([]);
  beforeAll(() => {
    registerModel(Eye);
    registerModel(Iris);
    registerModel(IrisWithReadOnlyForeignKey);
  });

  it("callbacks read a cold has_one cache", async () => {
    const created = await Eye.create({ irisAttributes: { color: "honey" } });
    const eye = await Eye.find(created.id);
    expect(eye.association("iris").isLoaded()).toBe(false);

    await eye.save();

    expect(eye.association("iris").isLoaded()).toBe(true);
    expect(eye.afterSaveCallbacksStack).toEqual([false, false]);
  });

  it("an autosaved has_one whose save is cancelled rolls the owner back", async () => {
    class CancellingFace extends Base {
      declare description: string | null;
      declare human_id: number | null;

      static {
        this._tableName = "faces";
        this.beforeSave(function () {
          throwAbort();
        });
      }
    }
    registerModel("CancellingFace", CancellingFace);

    class HumanWithCancellingFace extends Base {
      declare name: string | null;
      declare cancellingFace: InstanceType<typeof CancellingFace> | null;

      static {
        this._tableName = "humans";
        this.hasOne("cancellingFace", {
          className: "CancellingFace",
          autosave: true,
          foreignKey: "human_id",
        });
      }
    }
    registerModel("HumanWithCancellingFace", HumanWithCancellingFace);

    const human = new HumanWithCancellingFace({ name: "Steve" });
    cacheAssoc(human, "cancellingFace", new CancellingFace({ description: "wide eyed" }));

    expect(await human.save()).toBeFalsy();
    expect(await HumanWithCancellingFace.where({ name: "Steve" }).count()).toBe(0);

    const human2 = new HumanWithCancellingFace({ name: "Steve" });
    cacheAssoc(human2, "cancellingFace", new CancellingFace({ description: "wide eyed" }));
    expect(await human2.saveBang()).toBeUndefined();
    expect(await HumanWithCancellingFace.where({ name: "Steve" }).count()).toBe(0);
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociation", () => {
  fixtures(["companies"]);
  beforeAll(() => {
    registerModel(CanonicalCompany);
    registerModel(Firm);
    registerModel(Client);
  });

  it("collection-proxy build without load autosaves built children (Slot B)", async () => {
    const firm = new Firm({ name: "Acme" });
    const built = firm.clientsOfFirm.build({ name: "ProxyBuilt" });
    expect(built.isNewRecord()).toBe(true);
    await firm.save();
    expect(firm.isNewRecord()).toBe(false);
    expect(built.isNewRecord()).toBe(false);
  });
});

describe("TestAutosaveAssociationsInGeneral", () => {
  fixtures([]);

  it("custom validation context is applied to unchanged persisted children", async () => {
    class Widget extends Base {
      declare name: string | null;
      declare author_id: number | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
        this.attribute("author_id", "integer");
        this.validates("name", { presence: true, on: "publish" } as any);
      }
    }
    class WidgetOwner extends Base {
      declare name: string | null;
      declare widgets: AssociationProxy<Widget>;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
        this.hasMany("widgets", { autosave: true, foreignKey: "author_id" });
      }
    }
    registerModel("Widget", Widget);
    registerModel("WidgetOwner", WidgetOwner);

    const owner = await WidgetOwner.create({ name: "Alice" });
    const widget = await Widget.create({ name: "", author_id: owner.id });
    cacheAssoc(owner, "widgets", [widget]);

    const defaultValid = await owner.isValid();
    expect(defaultValid).toBe(true);

    const publishValid = await owner.isValid("publish" as any);
    expect(publishValid).toBe(false);
  });

  it("default belongs_to saves new associated record and propagates the FK", async () => {
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
    registerModel("DefaultBelongsToAuthor", Author);
    registerModel("DefaultBelongsToPost", Post);
    Associations.belongsTo.call(Post, "author", {
      foreignKey: "author_id",
      className: "DefaultBelongsToAuthor",
    });

    const author = new Author({ name: "New Author" });
    const post = new Post({ name: "Default autosave" });
    cacheAssoc(post, "author", author);
    await post.save();
    expect(author.isNewRecord()).toBe(false);
    expect(post.author_id).toBe(author.id);
  });

  it("belongs_to autosave with mismatched composite FK/PK uses zip semantics", async () => {
    class Parent extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class Child extends Base {
      declare parent_id: number | null;
      declare group: string | null;
      declare title: string | null;

      static {
        this._tableName = "topics";
        this.attribute("parent_id", "integer");
        this.attribute("group", "string");
        this.attribute("title", "string");
      }
    }
    registerModel("ZipParent", Parent);
    registerModel("ZipChild", Child);
    Associations.belongsTo.call(Child, "parent", {
      primaryKey: "id",
      foreignKey: ["parent_id", "group"],
      className: "ZipParent",
      autosave: true,
    });

    const parent = new Parent({ name: "P" });
    const child = new Child({ title: "c" });
    cacheAssoc(child, "parent", parent);
    child.group = "us-west";
    await child.save();
    expect(parent.isNewRecord()).toBe(false);
    expect(child.parent_id).toBe(parent.id);
    expect(child.group).toBe("us-west");
  });

  it("default belongs_to runs validations on the new target via validate: !autosave", async () => {
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
    registerModel("DefaultAutosaveAuthor", Author);
    registerModel("DefaultAutosavePost", Post);
    Associations.belongsTo.call(Post, "author", {
      foreignKey: "author_id",
      className: "DefaultAutosaveAuthor",
    });

    const author = new Author({});
    const post = new Post({ name: "ok" });
    cacheAssoc(post, "author", author);
    const saved = await post.save();
    expect(saved).toBe(true);
    expect(post.isNewRecord()).toBe(false);
    expect(author.isNewRecord()).toBe(true);
    expect(post.errors.size).toBe(0);
  });

  it("belongs_to autosave with PK longer than FK skips trailing PK positions", async () => {
    class Parent extends Base {
      declare name: string | null;

      static {
        this._tableName = "authors";
        this.attribute("name", "string");
      }
    }
    class Child extends Base {
      declare author_id: number | null;
      declare name: string | null;

      static {
        this._tableName = "books";
        this.attribute("author_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("LongPkParent", Parent);
    registerModel("LongPkChild", Child);
    Associations.belongsTo.call(Child, "parent", {
      primaryKey: ["id", "name"],
      foreignKey: "author_id",
      className: "LongPkParent",
      autosave: true,
    });

    const parent = new Parent({ name: "P" });
    const child = new Child({ name: "c" });
    cacheAssoc(child, "parent", parent);
    await child.save();
    expect(parent.isNewRecord()).toBe(false);
    expect(child.author_id).toBe(parent.id);
  });
});

describe("TestDefaultAutosaveAssociationOnAHasManyAssociationWithAcceptsNestedAttributes", () => {
  fixtures([]);

  function makeModels() {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    return { Pirate: CanonicalPirate, Bird: CanonicalBird };
  }

  it("errors details should be set for invalid nested", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    const invalidBird = new Bird({ name: "" });
    pirate.association("birds").setTarget([invalidBird] as any);
    const saved = await pirate.save();
    expect(saved).toBe(false);
  });

  it("valid nested attributes create children", async () => {
    const { Pirate, Bird } = makeModels();
    const pirate = await Pirate.create({ catchphrase: "Yarr" });
    await assignNestedAttributes(pirate, "birds", [{ name: "Polly" }]);
    await pirate.save();
    const birds = await Bird.where({ pirate_id: pirate.id });
    expect(birds.length).toBe(1);
  });
});

describe("TestAutosaveAssociationsInGeneral changed_for_autosave?", () => {
  fixtures([]);

  it("changed_for_autosave? dispatches through marked_for_destruction?", async () => {
    class Gadget extends Base {
      declare name: string | null;

      static {
        this._tableName = "books";
        this.attribute("name", "string");
      }

      override markedForDestruction = (): boolean => true;
    }
    registerModel("ChangedForAutosaveGadget", Gadget);

    const gadget = await Gadget.create({ name: "widget" });

    expect(gadget.changedForAutosave()).toBe(true);
  });
});

describe("TestAutosaveAssociationsInGeneral association_valid?", () => {
  fixtures([]);

  it("association_valid? dispatches through marked_for_destruction?", async () => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    class DoomedBird extends CanonicalBird {
      override markedForDestruction = (): boolean => true;
    }
    registerModel("AssociationValidDoomedBird", DoomedBird);

    const pirate = await CanonicalPirate.create({ catchphrase: "Yarr" });
    const doomed = new DoomedBird({ name: "" });
    pirate.association("birds").setTarget([doomed] as any);

    expect(await pirate.save()).toBe(true);
  });
});

describe("TestAutosaveAssociationOnAHasManyAssociation marked_for_destruction?", () => {
  fixtures([]);

  it("save_collection_association selects the records to destroy through marked_for_destruction?", async () => {
    registerModel(CanonicalPirate);
    registerModel(CanonicalBird);
    let doomed = false;
    class DoomedBird extends CanonicalBird {
      override markedForDestruction = (): boolean => doomed;
    }
    registerModel("CollectionDoomedBird", DoomedBird);

    const pirate = await CanonicalPirate.create({ catchphrase: "Yarr" });
    const bird = new DoomedBird({ name: "polly", pirate_id: pirate.id });
    await bird.save();
    doomed = true;
    pirate.association("birds").setTarget([bird] as any);

    expect(await pirate.save()).toBe(true);
    expect(await CanonicalBird.where({ id: bird.id }).count()).toBe(0);
  });
});

describe("TestAutosaveAssociationOnAHasOneAssociation marked_for_destruction?", () => {
  fixtures([]);

  it("save_has_one_association destroys the record through marked_for_destruction?", async () => {
    registerModel(CanonicalPirate);
    registerModel(Ship);
    registerModel(Developer);
    let doomed = false;
    class DoomedShip extends Ship {
      override markedForDestruction = (): boolean => doomed;
    }
    registerModel("HasOneDoomedShip", DoomedShip);

    const pirate = await CanonicalPirate.create({ catchphrase: "Yarr" });
    const ship = new DoomedShip({ name: "Black Pearl", pirate_id: pirate.id });
    await ship.save();
    doomed = true;
    pirate.association("ship").setTarget(ship as any);

    await pirate.save();
    expect(await Ship.where({ id: ship.id }).count()).toBe(0);
  });
});
