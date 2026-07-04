/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 */
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { describe, it, expect } from "vitest";
import {
  Base,
  columns,
  columnNames,
  contentColumns,
  reflectOnAssociation,
  reflectOnAllAssociations,
  reflectOnAllAutosaveAssociations,
  ThroughReflection,
  AssociationReflection,
  AggregateReflection,
  registerModel,
  modelRegistry,
  composedOf,
} from "./index.js";
import { Associations, resolveAssocClass } from "./associations.js";
import {
  MyAppBusinessFirm,
  MyAppBusinessClient,
  MyAppBillingAccount,
  MyAppBillingFirm,
  MyAppBillingNestedFirm,
} from "./test-helpers/models/company-in-module.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";

import { UnknownPrimaryKey, NameError } from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { setupFixtures } from "./test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "./test-helpers/use-handler-transactional-fixtures.js";

setupFixtures();
useHandlerTransactionalFixtures();

describe("ReflectionTest", () => {
  function makeModels() {
    class Author extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      declare title: string | null;
      declare author_id: number | null;

      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
      }
    }
    class Chapter extends Base {
      declare title: string | null;
      declare book_id: number | null;

      static {
        this.attribute("title", "string");
        this.attribute("book_id", "integer");
      }
    }
    Associations.belongsTo.call(Book, "author", {});
    Associations.hasMany.call(Author, "books", {});
    Associations.hasOne.call(Author, "profile", {});
    Associations.hasMany.call(Book, "chapters", {});
    registerModel(Author);
    registerModel(Book);
    registerModel(Chapter);
    return { Author, Book, Chapter };
  }

  it("scope chain does not interfere with hmt with polymorphic case", async () => {
    class ScHotel extends Base {
      declare name: string | null;
      declare departments: AssociationProxy<ScDept>;
      declare chefs: AssociationProxy<Base>;
      declare cakeDesigners: AssociationProxy<ScCake>;
      declare drinkDesigners: AssociationProxy<ScDrink>;

      static {
        this.attribute("name", "string");
        this.hasMany("departments", {
          className: "ScDept",
          foreignKey: "hotel_id",
        });
        this.hasMany("chefs", { through: "departments", className: "ScChef" });
        this.hasMany("cakeDesigners", {
          through: "chefs",
          source: "employable",
          sourceType: "ScCake",
          className: "ScCake",
        });
        this.hasMany("drinkDesigners", {
          through: "chefs",
          source: "employable",
          sourceType: "ScDrink",
          className: "ScDrink",
        });
      }
    }
    class ScDept extends Base {
      declare hotel_id: number | null;
      declare chefs: AssociationProxy<ScChef>;

      static {
        this.attribute("hotel_id", "integer");
        this.hasMany("chefs", {
          className: "ScChef",
          foreignKey: "department_id",
        });
      }
    }
    class ScChef extends Base {
      declare department_id: number | null;
      declare employable_id: number | null;
      declare employable_type: string | null;
      declare employable: Base | null;
      declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

      static {
        this.attribute("department_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", { polymorphic: true });
      }
    }
    class ScCake extends Base {}
    class ScDrink extends Base {}
    registerModel("ScHotel", ScHotel);
    registerModel("ScDept", ScDept);
    registerModel("ScChef", ScChef);
    registerModel("ScCake", ScCake);
    registerModel("ScDrink", ScDrink);

    const hotel = await ScHotel.create({ name: "Grand" });
    const dept = await ScDept.create({ hotel_id: hotel.id });
    const cake = await ScCake.create({});
    const drink = await ScDrink.create({});
    await ScChef.create({
      department_id: dept.id,
      employable_id: cake.id,
      employable_type: "ScCake",
    });
    await ScChef.create({
      department_id: dept.id,
      employable_id: drink.id,
      employable_type: "ScDrink",
    });

    const h = hotel as any;
    expect((await h.cakeDesigners.toArray()).length).toBe(1);
    expect(await h.cakeDesigners.count()).toBe(1);
    expect((await h.drinkDesigners.toArray()).length).toBe(1);
    expect(await h.drinkDesigners.count()).toBe(1);
    expect((await h.chefs.toArray()).length).toBe(2);
    expect(await h.chefs.count()).toBe(2);
  });
  it("scope chain does not interfere with hmt with polymorphic case and subclass source", async () => {
    class SC2Hotel extends Base {
      declare name: string | null;
      declare chefLists: AssociationProxy<SC2ChefList>;
      declare mocktailDesigners: AssociationProxy<SC2Mocktail>;

      static {
        this.attribute("name", "string");
        this.hasMany("chefLists", {
          className: "SC2ChefList",
          as: "employableList",
        });
        this.hasMany("mocktailDesigners", {
          through: "chefLists",
          source: "employable",
          sourceType: "SC2Mocktail",
          className: "SC2Mocktail",
        });
      }
    }
    class SC2ChefList extends Base {
      declare employable_list_id: number | null;
      declare employable_list_type: string | null;
      declare employable_id: number | null;
      declare employable_type: string | null;
      declare employable: Base | null;
      declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

      static {
        this.attribute("employable_list_id", "integer");
        this.attribute("employable_list_type", "string");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", { polymorphic: true });
      }
    }
    class SC2Mocktail extends Base {}
    registerModel("SC2Hotel", SC2Hotel);
    registerModel("SC2ChefList", SC2ChefList);
    registerModel("SC2Mocktail", SC2Mocktail);

    const hotel = await SC2Hotel.create({ name: "Grand" });
    const mocktail = await SC2Mocktail.create({});
    await SC2ChefList.create({
      employable_list_id: hotel.id,
      employable_list_type: "SC2Hotel",
      employable_id: mocktail.id,
      employable_type: "SC2Mocktail",
    });

    const h2 = hotel as any;
    expect((await h2.mocktailDesigners.toArray()).length).toBe(1);
    expect(await h2.mocktailDesigners.count()).toBe(1);
    expect((await h2.chefLists.toArray()).length).toBe(1);
    expect(await h2.chefLists.count()).toBe(1);

    await SC2ChefList.where({ employable_list_id: hotel.id }).deleteAll();

    expect((await h2.mocktailDesigners.toArray()).length).toBe(0);
    expect(await h2.mocktailDesigners.count()).toBe(0);
    expect((await h2.chefLists.toArray()).length).toBe(0);
    expect(await h2.chefLists.count()).toBe(0);
  });
  it("scope chain does not interfere with hmt with polymorphic and subclass source 2", async () => {
    class SC3Author extends Base {
      declare name: string | null;
      declare books: AssociationProxy<SC3Book>;
      declare bestHardbacks: AssociationProxy<SC3BestHardback>;

      static {
        this.attribute("name", "string");
        this.hasMany("books", {
          className: "SC3Book",
          foreignKey: "author_id",
        });
        this.hasMany("bestHardbacks", {
          through: "books",
          source: "formatRecord",
          sourceType: "SC3BestHardback",
          className: "SC3BestHardback",
        });
      }
    }
    class SC3Book extends Base {
      declare author_id: number | null;
      declare format_record_id: number | null;
      declare format_record_type: string | null;
      declare formatRecord: Base | null;
      declare loadBelongsTo: (name: "formatRecord") => Promise<Base | null>;

      static {
        this.attribute("author_id", "integer");
        this.attribute("format_record_id", "integer");
        this.attribute("format_record_type", "string");
        this.belongsTo("formatRecord", { polymorphic: true });
      }
    }
    class SC3Hardback extends Base {}
    class SC3BestHardback extends SC3Hardback {}

    registerModel("SC3Author", SC3Author);
    registerModel("SC3Book", SC3Book);
    registerModel("SC3Hardback", SC3Hardback);
    registerModel("SC3BestHardback", SC3BestHardback);

    const author = await SC3Author.create({ name: "John Doe" });
    const hardback = await SC3BestHardback.create({});
    await SC3Book.create({
      author_id: author.id,
      format_record_id: hardback.id,
      format_record_type: "SC3BestHardback",
    });

    const a3 = author as any;
    const bh1 = await a3.bestHardbacks.toArray();
    expect(bh1.length).toBe(1);
    expect(bh1[0].id).toBe(hardback.id);
    const bh1r = await SC3Author.find(author.id).then((a: any) => a.bestHardbacks.toArray());
    expect(bh1r.length).toBe(1);

    await SC3Book.where({ author_id: author.id }).deleteAll();

    expect((await a3.bestHardbacks.toArray()).length).toBe(0);
    const bh2r = await SC3Author.find(author.id).then((a: any) => a.bestHardbacks.toArray());
    expect(bh2r.length).toBe(0);
  });
  it("scope chain of polymorphic association does not leak into other hmt associations", async () => {
    class SC4Hotel extends Base {
      declare name: string | null;
      declare departments: AssociationProxy<SC4Dept>;
      declare chefs: AssociationProxy<Base>;
      declare drinkDesigners: AssociationProxy<SC4Drink>;
      declare recipes: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("departments", {
          className: "SC4Dept",
          foreignKey: "hotel_id",
        });
        this.hasMany("chefs", { through: "departments", className: "SC4Chef" });
        this.hasMany("drinkDesigners", {
          through: "chefs",
          source: "employable",
          sourceType: "SC4Drink",
          className: "SC4Drink",
        });
        this.hasMany("recipes", { through: "chefs", className: "SC4Recipe" });
      }
    }
    class SC4Dept extends Base {
      declare hotel_id: number | null;
      declare chefs: AssociationProxy<SC4Chef>;

      static {
        this.attribute("hotel_id", "integer");
        this.hasMany("chefs", {
          className: "SC4Chef",
          foreignKey: "department_id",
        });
      }
    }
    class SC4Chef extends Base {
      declare department_id: number | null;
      declare employable_id: number | null;
      declare employable_type: string | null;
      declare employable: Base | null;
      declare recipes: AssociationProxy<SC4Recipe>;
      declare loadBelongsTo: (name: "employable") => Promise<Base | null>;

      static {
        this.attribute("department_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", { polymorphic: true });
        this.hasMany("recipes", {
          className: "SC4Recipe",
          foreignKey: "chef_id",
        });
      }
    }
    class SC4Drink extends Base {}
    class SC4Recipe extends Base {
      declare chef_id: number | null;
      declare hotel_id: number | null;

      static {
        this.attribute("chef_id", "integer");
        this.attribute("hotel_id", "integer");
      }
    }
    registerModel("SC4Hotel", SC4Hotel);
    registerModel("SC4Dept", SC4Dept);
    registerModel("SC4Chef", SC4Chef);
    registerModel("SC4Drink", SC4Drink);
    registerModel("SC4Recipe", SC4Recipe);

    const hotel = await SC4Hotel.create({ name: "Grand" });
    const dept = await SC4Dept.create({ hotel_id: hotel.id });
    const drink = await SC4Drink.create({});
    const chef = await SC4Chef.create({
      department_id: dept.id,
      employable_id: drink.id,
      employable_type: "SC4Drink",
    });
    await SC4Recipe.create({ chef_id: chef.id, hotel_id: hotel.id });

    const recipesBefore = await (hotel as any).recipes.toArray();

    reflectOnAssociation(SC4Hotel, "recipes")?.clearAssociationScopeCache();
    const hotelReloaded = (await SC4Hotel.find(hotel.id)) as any;
    await hotelReloaded.drinkDesigners.toArray();
    const recipesAfter = await hotelReloaded.recipes.toArray();

    expect(recipesAfter.length).toBe(recipesBefore.length);
    expect(recipesAfter[0].id).toBe(recipesBefore[0].id);
  });

  it("has many reflection", () => {
    const { Author } = makeModels();
    const ref = reflectOnAssociation(Author, "books");
    expect(ref).not.toBeNull();
    expect(ref!.macro).toBe("hasMany");
    expect(ref!.name).toBe("books");
  });
  it("has one reflection", () => {
    const { Author } = makeModels();
    const ref = reflectOnAssociation(Author, "profile");
    expect(ref).not.toBeNull();
    expect(ref!.macro).toBe("hasOne");
  });
  it("has many through reflection", () => {
    class Subscriber extends Base {
      declare name: string | null;
      declare subscriptions: AssociationProxy<Subscription>;
      declare subBooks: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("subscriptions", {});
        this.hasMany("subBooks", {
          through: "subscriptions",
          source: "subBook",
          className: "SubBook",
        });
      }
    }
    class Subscription extends Base {
      declare subscriber_id: number | null;
      declare book_id: number | null;
      declare subBook: SubBook | null;
      declare loadBelongsTo: (name: "subBook") => Promise<SubBook | null>;

      static {
        this.attribute("subscriber_id", "integer");
        this.attribute("book_id", "integer");
        this.belongsTo("subBook", {
          foreignKey: "book_id",
          className: "SubBook",
        });
      }
    }
    class SubBook extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    registerModel("Subscriber", Subscriber);
    registerModel("Subscription", Subscription);
    registerModel("SubBook", SubBook);
    const ref = reflectOnAssociation(Subscriber, "subBooks");
    expect(ref).toBeInstanceOf(ThroughReflection);
    expect((ref as ThroughReflection).through).toBe("subscriptions");
    expect((ref as ThroughReflection).source).toBe("subBook");
    expect(ref!.isThrough()).toBe(true);
  });

  it("has and belongs to many reflection", () => {
    class Category extends Base {
      declare name: string | null;
      declare habtmPosts: AssociationProxy<HabtmPost>;

      static {
        this.attribute("name", "string");
        this.hasAndBelongsToMany("habtmPosts", {
          className: "HabtmPost",
        });
      }
    }
    class HabtmPost extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    registerModel("Category", Category);
    registerModel("HabtmPost", HabtmPost);
    const refs = reflectOnAllAssociations(Category, "hasAndBelongsToMany");
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs[0].macro).toBe("hasAndBelongsToMany");
    expect(refs[0].name).toBe("habtmPosts");
  });
  it("columns are returned in the order they were declared", () => {
    class Topic extends Base {
      declare title: string | null;
      declare author_name: string | null;
      declare body: string | null;

      static {
        this.attribute("title", "string");
        this.attribute("author_name", "string");
        this.attribute("body", "string");
      }
    }
    const names = columnNames(Topic);
    expect(names.indexOf("title")).toBeLessThan(names.indexOf("author_name"));
    expect(names.indexOf("author_name")).toBeLessThan(names.indexOf("body"));
  });
  it("content columns", () => {
    class Topic extends Base {}
    const cols = contentColumns(Topic);
    const colNames = cols.map((c) => c.name);
    // Should exclude id (PK) and parent_id (FK ending in _id)
    expect(colNames).not.toContain("id");
    expect(colNames).not.toContain("parent_id");
    // Should include content columns (canonical topics schema)
    expect(colNames).toContain("title");
    expect(colNames).toContain("author_name");
    expect(colNames).toContain("content");
  });
  it("non existent types are identity types", () => {
    class Topic2 extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    const type = Topic2.typeForAttribute("attribute_that_doesnt_exist");
    const object = { sentinel: true };
    expect(type.deserialize(object)).toBe(object);
    expect(type.cast(object)).toBe(object);
    expect(type.serialize(object)).toBe(object);
  });
  it("reflection klass for nested class name", async () => {
    class Author extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Book extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    registerModel("Library::Book", Book);
    registerModel("Author", Author);
    Associations.hasMany.call(Author, "books", { className: "Library::Book" });
    const ref = reflectOnAssociation(Author, "books");
    expect(ref).not.toBeNull();
    expect(ref!.klass).toBe(Book);
  });
  it("irregular reflection class name", async () => {
    class Person extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Address extends Base {
      declare street: string | null;

      static {
        this.attribute("street", "string");
      }
    }
    registerModel("Person", Person);
    registerModel("Address", Address);
    Associations.hasMany.call(Person, "addresses", { className: "Address" });
    const ref = reflectOnAssociation(Person, "addresses");
    expect(ref!.klass).toBe(Address);
  });
  it("reflection klass with same demodularized different modularized name", async () => {
    class NestedUser extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class AdminUser extends Base {
      declare name: string | null;
      declare user: NestedUser | null;
      declare loadHasOne: (name: "user") => Promise<NestedUser | null>;

      static {
        this.attribute("name", "string");
        this.hasOne("user", { className: "Nested::User" });
      }
    }
    registerModel("Nested::User", NestedUser);
    registerModel("Admin::User", AdminUser);
    const ref = reflectOnAssociation(AdminUser, "user");
    expect(ref!.klass).toBe(NestedUser);
  });
  it("reflection klass with same modularized name", async () => {
    class NestedNestedUser extends Base {
      declare name: string | null;
      declare nestedUsers: AssociationProxy<NestedNestedUser>;

      static {
        this.attribute("name", "string");
        this.hasMany("nestedUsers", {});
      }
    }
    registerModel("NestedUser", NestedNestedUser);
    const ref = reflectOnAssociation(NestedNestedUser, "nestedUsers");
    expect(ref!.klass).toBe(NestedNestedUser);
  });
  it("reflect on all autosave associations", () => {
    class Ship extends Base {
      declare name: string | null;
      declare parts: AssociationProxy<Part>;
      declare crews: AssociationProxy<Crew>;

      static {
        this.attribute("name", "string");
        this.hasMany("parts", { autosave: true });
        this.hasMany("crews", {});
      }
    }
    class Part extends Base {
      declare ship_id: number | null;

      static {
        this.attribute("ship_id", "integer");
      }
    }
    class Crew extends Base {
      declare ship_id: number | null;

      static {
        this.attribute("ship_id", "integer");
      }
    }
    registerModel("Ship", Ship);
    registerModel("Part", Part);
    registerModel("Crew", Crew);
    const autosaved = reflectOnAllAutosaveAssociations(Ship);
    expect(autosaved).toHaveLength(1);
    expect(autosaved[0].name).toBe("parts");
  });
  it("association primary key", () => {
    const { Author, Book } = makeModels();
    const ref = reflectOnAssociation(Author, "books") as AssociationReflection;
    expect(ref.associationPrimaryKey).toBe("id");
    // Custom primary key
    class SpecialBook extends Base {
      declare isbn: string | null;
      declare author_id: number | null;

      static {
        this.attribute("isbn", "string");
        this.attribute("author_id", "integer");
        this.primaryKey = "isbn";
      }
    }
    registerModel("SpecialBook", SpecialBook);
    Associations.hasMany.call(Author, "specialBooks", { className: "SpecialBook" });
    const specialRef = reflectOnAssociation(Author, "specialBooks") as AssociationReflection;
    expect(specialRef.associationPrimaryKey).toBe("isbn");
  });
  it("association primary key raises when missing primary key", () => {
    class NoPkModel extends Base {
      static {
        this._primaryKey = "";
      }
    }
    class Owner extends Base {
      declare no_pk_model_id: number | null;

      static {
        this.attribute("no_pk_model_id", "integer");
      }
    }
    registerModel("NoPkModel", NoPkModel);
    registerModel("Owner", Owner);
    Associations.belongsTo.call(Owner, "noPkModel", {});
    const ref = reflectOnAssociation(Owner, "noPkModel") as AssociationReflection;
    expect(() => ref.associationPrimaryKey).toThrow(UnknownPrimaryKey);
  });
  it("active record primary key raises when missing primary key", () => {
    class NoPkOwner extends Base {
      declare targets: AssociationProxy<Target>;

      static {
        this._primaryKey = "";
        this.hasMany("targets", {});
      }
    }
    class Target extends Base {}
    registerModel("NoPkOwner", NoPkOwner);
    registerModel("Target", Target);
    const ref = reflectOnAssociation(NoPkOwner, "targets") as AssociationReflection;
    expect(() => ref.activeRecordPrimaryKey).toThrow(UnknownPrimaryKey);
  });
  it("foreign type", () => {
    class Sponsor extends Base {
      declare sponsorable_id: number | null;
      declare sponsorable_type: string | null;
      declare sponsor_club_id: number | null;
      declare sponsorable: Base | null;
      declare thing: Base | null;
      declare sponsorClub: Base | null;
      declare loadBelongsTo: ((name: "sponsorable") => Promise<Base | null>) &
        ((name: "thing") => Promise<Base | null>) &
        ((name: "sponsorClub") => Promise<Base | null>);

      static {
        this.attribute("sponsorable_id", "integer");
        this.attribute("sponsorable_type", "string");
        this.attribute("sponsor_club_id", "integer");
        this.belongsTo("sponsorable", { polymorphic: true });
        this.belongsTo("thing", {
          polymorphic: true,
          foreignType: "sponsorable_type",
          foreignKey: "sponsorable_id",
        });
        this.belongsTo("sponsorClub", {
          foreignKey: "sponsor_club_id",
        });
      }
    }
    registerModel("Sponsor", Sponsor);
    const polyRef = reflectOnAssociation(Sponsor, "sponsorable");
    expect(polyRef!.foreignType).toBe("sponsorable_type");
    const thingRef = reflectOnAssociation(Sponsor, "thing");
    expect(thingRef!.foreignType).toBe("sponsorable_type");
    const normalRef = reflectOnAssociation(Sponsor, "sponsorClub");
    expect(normalRef!.foreignType).toBeNull();
  });
  it("default association validation", () => {
    class Owner extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Pet extends Base {
      declare owner_id: number | null;

      static {
        this.attribute("owner_id", "integer");
      }
    }
    registerModel("Owner", Owner);
    registerModel("Pet", Pet);
    Associations.hasMany.call(Owner, "pets", {});
    const ref = reflectOnAssociation(Owner, "pets") as AssociationReflection;
    expect(ref.validate).toBe(true);
  });
  it("always validate association if explicit", () => {
    class Owner extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Pet extends Base {
      declare owner_id: number | null;

      static {
        this.attribute("owner_id", "integer");
      }
    }
    registerModel("Owner", Owner);
    registerModel("Pet", Pet);
    Associations.hasMany.call(Owner, "pets", { validate: true });
    const ref = reflectOnAssociation(Owner, "pets") as AssociationReflection;
    expect(ref.validate).toBe(true);
  });
  it("validate association if autosave", () => {
    class Owner extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Pet extends Base {
      declare owner_id: number | null;

      static {
        this.attribute("owner_id", "integer");
      }
    }
    registerModel("Owner", Owner);
    registerModel("Pet", Pet);
    Associations.hasMany.call(Owner, "pets", { autosave: true });
    const ref = reflectOnAssociation(Owner, "pets") as AssociationReflection;
    expect(ref.validate).toBe(true);
  });
  it("never validate association if explicit", () => {
    class Owner extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Pet extends Base {
      declare owner_id: number | null;

      static {
        this.attribute("owner_id", "integer");
      }
    }
    registerModel("Owner", Owner);
    registerModel("Pet", Pet);
    Associations.hasMany.call(Owner, "pets", { validate: false, autosave: true });
    const ref = reflectOnAssociation(Owner, "pets") as AssociationReflection;
    expect(ref.validate).toBe(false);
  });
  it.skip("symbol for class name", () => {
    // UNPORTED: Ruby Symbol type for className has no JS equivalent.
  });
  it("class for class name", () => {
    class Firm extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Client extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    registerModel("Firm", Firm);
    registerModel("Client", Client);
    expect(() =>
      Associations.hasMany.call(Firm, "clients", {
        // @ts-expect-error className must be a string, not a class
        className: Client,
      }),
    ).toThrow(/expecting a string/);
  });
  it("class for source type", () => {
    class NsTag extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class NsPost extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    registerModel("NsTag", NsTag);
    registerModel("NsPost", NsPost);
    expect(() =>
      Associations.hasMany.call(NsTag, "taggedPosts", {
        through: "taggings",
        source: "taggable",
        // @ts-expect-error sourceType must be a string, not a class
        sourceType: NsPost,
      }),
    ).toThrow(ArgumentError);
  });
  it("join table with common prefix", () => {
    class CatalogCategory extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class CatalogProduct extends Base {
      declare name: string | null;
      declare catalogCategories: AssociationProxy<CatalogCategory>;

      static {
        this.attribute("name", "string");
        this.hasAndBelongsToMany("catalogCategories", {
          className: "CatalogCategory",
        });
      }
    }
    registerModel("CatalogCategory", CatalogCategory);
    registerModel("CatalogProduct", CatalogProduct);
    const ref = reflectOnAssociation(CatalogProduct, "catalogCategories");
    // Rails Builder::HasAndBelongsToMany#table_name collapses a shared
    // `[._]`-terminated prefix (see vendor reflection_test.rb:551).
    expect(ref!.joinTable).toBe("catalog_categories_products");
  });

  it("join table with different prefix", () => {
    class CatCategory extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class ContentPage extends Base {
      declare name: string | null;
      declare catCategories: AssociationProxy<CatCategory>;

      static {
        this.attribute("name", "string");
        this.hasAndBelongsToMany("catCategories", {
          className: "CatCategory",
        });
      }
    }
    registerModel("CatCategory", CatCategory);
    registerModel("ContentPage", ContentPage);
    const ref = reflectOnAssociation(ContentPage, "catCategories");
    // Join table derived from model names: pluralize(underscore("ContentPage")) + underscore("catCategories")
    expect(ref!.joinTable).toBe("cat_categories_content_pages");
  });

  it("join table can be overridden", () => {
    class JtCategory extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class JtProduct extends Base {
      declare name: string | null;
      declare jtCategories: AssociationProxy<JtCategory>;

      static {
        this.attribute("name", "string");
        this.hasAndBelongsToMany("jtCategories", {
          className: "JtCategory",
          joinTable: "product_categories",
        });
      }
    }
    registerModel("JtCategory", JtCategory);
    registerModel("JtProduct", JtProduct);
    const ref = reflectOnAssociation(JtProduct, "jtCategories");
    expect(ref!.joinTable).toBe("product_categories");
  });
  it("includes accepts strings", async () => {
    class Hotel extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Department extends Base {
      declare hotel_id: number | null;
      declare name: string | null;

      static {
        this.attribute("hotel_id", "integer");
        this.attribute("name", "string");
      }
    }
    class Chef extends Base {
      declare department_id: number | null;
      declare name: string | null;

      static {
        this.attribute("department_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("Hotel", Hotel);
    registerModel("Department", Department);
    registerModel("Chef", Chef);
    Associations.hasMany.call(Hotel, "departments", { foreignKey: "hotel_id" });
    Associations.hasMany.call(Department, "chefs", { foreignKey: "department_id" });
    const hotel = await Hotel.create({ name: "Grand" });
    const dept = await Department.create({ hotel_id: hotel.id, name: "Kitchen" });
    await Chef.create({ department_id: dept.id, name: "Gordon" });
    // includes should accept string association names
    const hotels = await Hotel.all().includes("departments");
    expect(hotels).toHaveLength(1);
  });
  it("reflect on association accepts symbols", () => {
    const { Author } = makeModels();
    const ref = reflectOnAssociation(Author, "books");
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe("books");
  });
  it("reflect on association accepts strings", () => {
    const { Author } = makeModels();
    const ref = reflectOnAssociation(Author, "books");
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe("books");
  });
  it("reflect on missing source assocation raise exception", () => {
    // Mirrors Rails test/cases/reflection_test.rb: Hotel has_many :lost_items,
    // through: :departments; Department has no :lost_items assoc.
    class MsHotel extends Base {
      declare name: string | null;
      declare departments: AssociationProxy<MsDepartment>;
      declare lostItems: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("departments", {
          className: "MsDepartment",
          foreignKey: "hotel_id",
        });
        this.hasMany("lostItems", {
          through: "departments",
          className: "MsLostItem",
        });
      }
    }
    class MsDepartment extends Base {
      declare hotel_id: number | null;

      static {
        this.attribute("hotel_id", "integer");
      }
    }
    registerModel("MsHotel", MsHotel);
    registerModel("MsDepartment", MsDepartment);

    const ref = reflectOnAssociation(MsHotel, "lostItems") as ThroughReflection;
    expect(ref).not.toBeNull();
    expect(ref.sourceReflection).toBeNull();
    expect(() => (ref as any).checkValidityBang()).toThrow(/Could not find the source association/);
  });
  it.skip("name error from incidental code is not converted to name error for association", () => {
    // UNPORTED: relies on Ruby const_missing mechanism — no JS equivalent.
  });
  it.skip("automatic inverse suppresses name error for association", () => {
    // UNPORTED: relies on Ruby const_missing mechanism — no JS equivalent.
  });
  it.skip("automatic inverse does not suppress name error from incidental code", () => {
    // UNPORTED: relies on Ruby const_missing mechanism — no JS equivalent.
  });

  it("has one and belongs to should find inverse automatically", () => {
    class Car extends Base {
      declare bulb: Bulb | null;
      declare loadHasOne: (name: "bulb") => Promise<Bulb | null>;

      static {
        this.attribute("id", "integer");
        this.hasOne("bulb", {});
      }
    }
    class Bulb extends Base {
      declare car_id: number | null;
      declare car: Car | null;
      declare loadBelongsTo: (name: "car") => Promise<Car | null>;

      static {
        this.attribute("id", "integer");
        this.attribute("car_id", "integer");
        this.belongsTo("car", {});
      }
    }
    registerModel(Car);
    registerModel(Bulb);

    const carRef = reflectOnAssociation(Car, "bulb")!;
    const bulbRef = reflectOnAssociation(Bulb, "car")!;

    expect(carRef.hasInverse()).toBe(true);
    expect(carRef.inverseOf()!.name).toBe("car");

    expect(bulbRef.hasInverse()).toBe(true);
    expect(bulbRef.inverseOf()!.name).toBe("bulb");
  });

  it("has many and belongs to should find inverse automatically", () => {
    class Comment extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    class Rating extends Base {
      declare comment_id: number | null;
      declare comment: Comment | null;
      declare loadBelongsTo: (name: "comment") => Promise<Comment | null>;

      static {
        this.attribute("id", "integer");
        this.attribute("comment_id", "integer");
        this.belongsTo("comment", {});
      }
    }
    registerModel(Comment);
    registerModel(Rating);
    Associations.hasMany.call(Comment, "ratings", {});

    const commentRef = reflectOnAssociation(Comment, "ratings")!;
    expect(commentRef.hasInverse()).toBe(true);
    expect(commentRef.inverseOf()!.name).toBe("comment");
  });

  it("has one and belongs to with non default foreign key should not find inverse automatically", () => {
    class User extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    class Room extends Base {
      declare owner_id: number | null;
      declare owner: User | null;
      declare loadBelongsTo: (name: "owner") => Promise<User | null>;

      static {
        this.attribute("id", "integer");
        this.attribute("owner_id", "integer");
        this.belongsTo("owner", { className: "User", foreignKey: "owner_id" });
      }
    }
    registerModel(User);
    registerModel(Room);
    Associations.hasOne.call(User, "ownedRoom", { foreignKey: "owner_id" });

    const ownerRef = reflectOnAssociation(Room, "owner")!;
    expect(ownerRef.hasInverse()).toBe(false);
  });

  it("through association should not find inverse automatically", () => {
    class Doctor extends Base {
      declare appointments: AssociationProxy<Appointment>;
      declare patients: AssociationProxy<Base>;

      static {
        this.attribute("id", "integer");
        this.hasMany("appointments", {});
        this.hasMany("patients", { through: "appointments" });
      }
    }
    class Appointment extends Base {
      declare doctor_id: number | null;
      declare patient_id: number | null;
      declare doctor: Doctor | null;
      declare patient: Patient | null;
      declare loadBelongsTo: ((name: "doctor") => Promise<Doctor | null>) &
        ((name: "patient") => Promise<Patient | null>);

      static {
        this.attribute("id", "integer");
        this.attribute("doctor_id", "integer");
        this.attribute("patient_id", "integer");
        this.belongsTo("doctor", {});
        this.belongsTo("patient", {});
      }
    }
    class Patient extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    registerModel(Doctor);
    registerModel(Appointment);
    registerModel(Patient);

    const patientsRef = reflectOnAssociation(Doctor, "patients")!;
    expect(patientsRef.hasInverse()).toBe(false);
  });

  it("polymorphic belongs to should not find inverse automatically", () => {
    class Tag extends Base {
      declare taggable_id: number | null;
      declare taggable_type: string | null;

      static {
        this.attribute("id", "integer");
        this.attribute("taggable_id", "integer");
        this.attribute("taggable_type", "string");
      }
    }
    class Post extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    registerModel(Tag);
    registerModel(Post);
    Associations.belongsTo.call(Tag, "taggable", { polymorphic: true });
    Associations.hasMany.call(Post, "tags", { as: "taggable" });

    const taggableRef = reflectOnAssociation(Tag, "taggable")!;
    expect(taggableRef.hasInverse()).toBe(false);
  });

  it("explicit inverse of false disables automatic detection", () => {
    class Parent extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    class Child extends Base {
      declare parent_id: number | null;

      static {
        this.attribute("id", "integer");
        this.attribute("parent_id", "integer");
      }
    }
    registerModel(Parent);
    registerModel(Child);
    Associations.hasMany.call(Parent, "children", { className: "Child", inverseOf: false });
    Associations.belongsTo.call(Child, "parent", {});

    const childrenRef = reflectOnAssociation(Parent, "children")!;
    expect(childrenRef.hasInverse()).toBe(false);
  });

  it("has many with scope should not find inverse automatically unless automatic scope inversing", () => {
    // Without automatic_scope_inversing, scoped associations should not find inverse
    {
      class Company extends Base {
        static {
          this.attribute("id", "integer");
        }
      }
      class Contract extends Base {
        declare company_id: number | null;
        declare company: Company | null;
        declare loadBelongsTo: (name: "company") => Promise<Company | null>;

        static {
          this.attribute("id", "integer");
          this.attribute("company_id", "integer");
          this.belongsTo("company", {});
        }
      }
      registerModel(Company);
      registerModel(Contract);
      const scopeFn = (rel: any) => rel;
      Associations.hasMany.call(Company, "contracts", { scope: scopeFn });

      const contractsRef = reflectOnAssociation(Company, "contracts")!;
      expect(contractsRef.hasInverse()).toBe(false);
    }

    // With automatic_scope_inversing enabled, scoped associations should find inverse
    {
      class Company2 extends Base {
        static {
          this.attribute("id", "integer");
        }
      }
      class Contract2 extends Base {
        declare company2_id: number | null;
        declare company2: Company2 | null;
        declare loadBelongsTo: (name: "company2") => Promise<Company2 | null>;

        static automaticScopeInversing = true;
        static {
          this.attribute("id", "integer");
          this.attribute("company2_id", "integer");
          this.belongsTo("company2", { className: "Company2" });
        }
      }
      registerModel("Company2", Company2);
      registerModel("Contract2", Contract2);
      const scopeFn = (rel: any) => rel;
      Associations.hasMany.call(Company2, "contract2s", { scope: scopeFn, className: "Contract2" });

      const contractsRef = reflectOnAssociation(Company2, "contract2s")!;
      expect(contractsRef.hasInverse()).toBe(true);
      expect(contractsRef.inverseOf()!.name).toBe("company2");
    }
  });

  it("scoped belongs to on inverse side blocks automatic inverse", () => {
    // Scopes on the inverse (belongs_to) side always block automatic detection,
    // even when automatic_scope_inversing is enabled
    class Publisher extends Base {
      declare magazines: AssociationProxy<Magazine>;

      static automaticScopeInversing = true;
      static {
        this.attribute("id", "integer");
        this.hasMany("magazines", {});
      }
    }
    class Magazine extends Base {
      declare publisher_id: number | null;

      static automaticScopeInversing = true;
      static {
        this.attribute("id", "integer");
        this.attribute("publisher_id", "integer");
      }
    }
    registerModel(Publisher);
    registerModel(Magazine);
    const scopeFn = (rel: any) => rel;
    Associations.belongsTo.call(Magazine, "publisher", { scope: scopeFn });

    const magazinesRef = reflectOnAssociation(Publisher, "magazines")!;
    expect(magazinesRef.hasInverse()).toBe(false);
  });

  it("human name", () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    // Model human name should be derived from the class name
    expect(Post.name).toBe("Post");
  });

  it("column string type and limit", () => {
    class Article extends Base {
      declare title: string | null;

      static {
        // Use a table absent from the canonical schema so columnsHash() falls
        // back to _attributeDefinitions instead of the DB schema cache.
        this._tableName = "refl_articles";
        this.attribute("title", "string");
      }
    }
    const cols = (Article as any).columnsHash();
    expect(cols["title"]).toBeDefined();
    expect(cols["title"].type).toBe("string");
  });

  it("column null not null", () => {
    class Article extends Base {
      declare title: string | null;

      static {
        this._tableName = "refl_articles";
        this.attribute("title", "string");
      }
    }
    const cols = (Article as any).columnsHash();
    expect(Object.keys(cols).length).toBeGreaterThan(0);
  });

  it("human name for column", () => {
    class Article extends Base {
      declare body_text: string | null;

      static {
        this._tableName = "refl_articles";
        this.attribute("body_text", "string");
      }
    }
    const cols = (Article as any).columnsHash();
    expect(cols["body_text"]).toBeDefined();
    expect(cols["body_text"].name).toBe("body_text");
  });

  it("integer columns", () => {
    class Article extends Base {
      declare views: number | null;

      static {
        this._tableName = "refl_articles";
        this.attribute("views", "integer");
      }
    }
    const cols = (Article as any).columnsHash();
    expect(cols["views"]).toBeDefined();
    expect(cols["views"].type).toBe("integer");
  });

  it("non existent columns return null object", () => {
    class Article extends Base {
      declare title: string | null;

      static {
        this._tableName = "refl_articles";
        this.attribute("title", "string");
      }
    }
    const cols = (Article as any).columnsHash();
    const nonExistent = cols["does_not_exist"];
    expect(nonExistent).toBeUndefined();
  });

  it("belongs to inferred foreign key from assoc name", () => {
    class Author extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Post extends Base {
      declare author_id: number | null;

      static {
        this.attribute("author_id", "integer");
        Associations.belongsTo.call(this, "author", { className: "Author" });
      }
    }
    const reflection = reflectOnAssociation(Post, "author");
    expect(reflection).not.toBeNull();
    expect(reflection!.macro).toBe("belongsTo");
    expect(reflection!.foreignKey).toBe("author_id");
  });

  it("reflections should return keys as strings", () => {
    class Comment extends Base {
      declare post_id: number | null;

      static {
        this.attribute("post_id", "integer");
      }
    }
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
        Associations.hasMany.call(this, "comments", { className: "Comment" });
      }
    }
    const reflections = reflectOnAllAssociations(Post);
    expect(reflections.length).toBeGreaterThan(0);
    reflections.forEach((r) => expect(typeof r.name).toBe("string"));
  });

  it("type", () => {
    expect(reflectOnAssociation(CanonicalPost, "taggings")!.type).toBe("taggable_type");
    // images declares `foreignType: "imageable_class"` on its `as:` option, so
    // the reflection type must honor it rather than deriving `imageable_type`.
    expect(reflectOnAssociation(CanonicalPost, "images")!.type).toBe("imageable_class");
    expect(reflectOnAssociation(CanonicalPost, "readers")!.type).toBeNull();
  });

  it("collection association", () => {
    class Comment extends Base {
      declare post_id: number | null;

      static {
        this.attribute("post_id", "integer");
      }
    }
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
        Associations.hasMany.call(this, "comments", { className: "Comment" });
      }
    }
    const reflection = reflectOnAssociation(Post, "comments");
    expect(reflection!.isCollection()).toBe(true);
  });

  it("foreign key", () => {
    class Author extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Post extends Base {
      declare author_id: number | null;

      static {
        this.attribute("author_id", "integer");
        Associations.belongsTo.call(this, "author", { className: "Author" });
      }
    }
    const reflection = reflectOnAssociation(Post, "author");
    expect(reflection!.foreignKey).toBe("author_id");
  });

  it("foreign key is inferred from model name", () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    class Comment extends Base {
      declare post_id: number | null;

      static {
        this.attribute("post_id", "integer");
        Associations.belongsTo.call(this, "post", { className: "Post" });
      }
    }
    const reflection = reflectOnAssociation(Comment, "post");
    expect(reflection!.foreignKey).toBe("post_id");
  });

  it("reflection should not raise error when compared to other object", () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    const reflection = reflectOnAssociation(Post, "nonexistent");
    // Should return null, not throw
    expect(reflection).toBeNull();
  });

  it("reflect on missing source assocation", () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    const reflection = reflectOnAssociation(Post, "does_not_exist");
    expect(reflection).toBeNull();
  });

  it("active record primary key", () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.primaryKey).toBe("id");
  });

  it("reflection klass not found with no class name option", () => {
    class Orphan extends Base {
      declare name: string | null;
      declare ghosts: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("ghosts", {});
      }
    }
    const ref = reflectOnAssociation(Orphan, "ghosts");
    expect(ref).not.toBeNull();
    // "Ghost" is not registered, so accessing klass should throw
    expect(() => ref!.klass).toThrow(/not found in registry/);
  });

  it("reflection klass not found with pointer to non existent class name", () => {
    class Orphan2 extends Base {
      declare name: string | null;
      declare items: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("items", { className: "NonExistentModel" });
      }
    }
    const ref = reflectOnAssociation(Orphan2, "items");
    expect(ref).not.toBeNull();
    expect(() => ref!.klass).toThrow(/not found in registry/);
  });

  it("reflection klass requires ar subclass", () => {
    class Parent extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Child extends Base {
      declare parent_id: number | null;

      static {
        this.attribute("parent_id", "integer");
      }
    }
    Associations.hasMany.call(Parent, "children", { className: "Child" });
    registerModel(Child);
    const ref = reflectOnAssociation(Parent, "children");
    expect(ref).not.toBeNull();
    // klass should return a class that extends Base
    expect(ref!.klass).toBe(Child);

    // Non-AR subclass registered under a different name raises ArgumentError
    class NotAModel {}
    modelRegistry.set("NotAModel", NotAModel as unknown as typeof Base);
    try {
      Associations.hasMany.call(Parent, "notModels", { className: "NotAModel" });
      const badRef = reflectOnAssociation(Parent, "notModels");
      expect(() => badRef!.klass).toThrow(ArgumentError);
      expect(() => badRef!.klass).toThrow(/not an ActiveRecord::Base subclass/);
    } finally {
      modelRegistry.delete("NotAModel");
    }
  });

  it("reflection klass with same demodularized name", async () => {
    class Project extends Base {
      declare name: string | null;
      declare tasks: AssociationProxy<Task>;

      static {
        this.attribute("name", "string");
        this.hasMany("tasks", {});
      }
    }
    class Task extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    registerModel("Project", Project);
    registerModel("Task", Task);
    const ref = reflectOnAssociation(Project, "tasks");
    expect(ref!.klass).toBe(Task);
  });

  it("aggregation reflection", () => {
    class Customer extends Base {
      declare address_street: string | null;
      declare address_city: string | null;

      static {
        this.attribute("address_street", "string");
        this.attribute("address_city", "string");
      }
    }
    class Address {
      constructor(
        public street: string,
        public city: string,
      ) {}
    }
    composedOf(Customer, "address", {
      className: Address,
      mapping: [
        ["address_street", "street"],
        ["address_city", "city"],
      ],
    });
    const c = new Customer({ address_street: "123 Main", address_city: "Springfield" });
    const addr = (c as any).address;
    expect(addr).toBeInstanceOf(Address);
    expect(addr.street).toBe("123 Main");
    expect(addr.city).toBe("Springfield");
  });

  it("aggregate reflection computes class raises NameError for missing class", () => {
    class Buyer extends Base {
      declare balance: number | null;

      static {
        this.attribute("balance", "integer");
      }
    }
    // AggregateReflection backs composed_of; a string class_name pointing at a
    // constant that isn't registered must raise NameError (Rails compute_type),
    // matching AssociationReflection#computeClass so NameError-only rescues apply.
    const ref = new AggregateReflection("balance", null, { className: "NoSuchMoney" }, Buyer);
    expect(() => ref.klass).toThrow(NameError);
    expect(() => ref.klass).toThrow(/not found in registry/);
  });

  it("association reflection in modules", async () => {
    // Cross-namespace className resolution over the real company_in_module
    // fixtures (vendor/rails/.../models/company_in_module.rb). The qualified
    // registry keys are DERIVED from each class's `moduleName`, so this also
    // guards that the derivation replaced the hand-written registerModel strings.

    // Unqualified "Client" resolves namespace-relative from MyApplication::Business::Firm
    const firmRef = reflectOnAssociation(MyAppBusinessFirm, "clientsOfFirm");
    expect(firmRef!.klass).toBe(MyAppBusinessClient);
    expect(firmRef!.className).toBe("Client");
    expect(firmRef!.tableName).toBe("companies");

    // Fully qualified class_name resolves absolutely
    const acctFirmRef = reflectOnAssociation(MyAppBillingAccount, "firm");
    expect(acctFirmRef!.klass).toBe(MyAppBusinessFirm);
    expect(acctFirmRef!.className).toBe("MyApplication::Business::Firm");
    expect(acctFirmRef!.tableName).toBe("companies");

    // Fully qualified billing firm
    const qualRef = reflectOnAssociation(MyAppBillingAccount, "qualifiedBillingFirm");
    expect(qualRef!.klass).toBe(MyAppBillingFirm);
    expect(qualRef!.className).toBe("MyApplication::Billing::Firm");
    expect(qualRef!.tableName).toBe("companies");

    // Unqualified "Firm" resolves namespace-relative from MyApplication::Billing::Account
    const unqualRef = reflectOnAssociation(MyAppBillingAccount, "unqualifiedBillingFirm");
    expect(unqualRef!.klass).toBe(MyAppBillingFirm);
    expect(unqualRef!.className).toBe("Firm");
    expect(unqualRef!.tableName).toBe("companies");

    // Fully qualified, nested
    const nestedQualRef = reflectOnAssociation(MyAppBillingAccount, "nestedQualifiedBillingFirm");
    expect(nestedQualRef!.klass).toBe(MyAppBillingNestedFirm);
    expect(nestedQualRef!.className).toBe("MyApplication::Billing::Nested::Firm");
    expect(nestedQualRef!.tableName).toBe("companies");

    // Partially qualified "Nested::Firm" resolves namespace-relative
    const nestedRef = reflectOnAssociation(MyAppBillingAccount, "nestedUnqualifiedBillingFirm");
    expect(nestedRef!.klass).toBe(MyAppBillingNestedFirm);
    expect(nestedRef!.className).toBe("Nested::Firm");
    expect(nestedRef!.tableName).toBe("companies");

    // Runtime: resolveAssocClass uses the reflection layer for namespace-aware
    // resolution — verifies the actual loading path, not only ref.klass
    expect(resolveAssocClass(MyAppBusinessFirm, "clientsOfFirm", "Client")).toBe(
      MyAppBusinessClient,
    );
  });

  it("chain", () => {
    class ReflCategory extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class ReflEssay extends Base {
      declare name: string | null;
      declare writer_id: number | null;
      declare writer_type: string | null;
      declare category_id: number | null;
      declare category: ReflCategory | null;
      declare writer: Base | null;
      declare loadBelongsTo: ((name: "category") => Promise<ReflCategory | null>) &
        ((name: "writer") => Promise<Base | null>);

      static {
        this.attribute("name", "string");
        this.attribute("writer_id", "integer");
        this.attribute("writer_type", "string");
        this.attribute("category_id", "integer");
        this.belongsTo("category", {
          className: "ReflCategory",
          primaryKey: "name",
        });
        this.belongsTo("writer", { primaryKey: "name", polymorphic: true });
      }
    }
    class ReflAuthor extends Base {
      declare name: string | null;
      declare essays: AssociationProxy<ReflEssay>;
      declare essayCategories: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("essays", {
          className: "ReflEssay",
          primaryKey: "name",
          as: "writer",
        });
        this.hasMany("essayCategories", {
          through: "essays",
          source: "category",
        });
      }
    }
    class ReflOrganization extends Base {
      declare name: string | null;
      declare authors: AssociationProxy<ReflAuthor>;
      declare authorEssayCategories: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("authors", {
          className: "ReflAuthor",
          primaryKey: "name",
        });
        this.hasMany("authorEssayCategories", {
          through: "authors",
          source: "essayCategories",
        });
      }
    }
    registerModel("ReflCategory", ReflCategory);
    registerModel("ReflEssay", ReflEssay);
    registerModel("ReflAuthor", ReflAuthor);
    registerModel("ReflOrganization", ReflOrganization);

    const authorEssayCatRef = reflectOnAssociation(ReflOrganization, "authorEssayCategories");
    expect(authorEssayCatRef).toBeInstanceOf(ThroughReflection);

    const chain = (authorEssayCatRef as ThroughReflection).chain;
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(authorEssayCatRef);
    expect(chain[1]).toBe(reflectOnAssociation(ReflAuthor, "essays"));
    expect(chain[2]).toBe(reflectOnAssociation(ReflOrganization, "authors"));
  });

  it("nested?", () => {
    class NPost extends Base {
      declare author_id: number | null;
      declare comments: AssociationProxy<NComment>;
      declare taggings: AssociationProxy<NTagging>;
      declare tags: AssociationProxy<Base>;

      static {
        this.attribute("author_id", "integer");
        this.hasMany("comments", { className: "NComment" });
        this.hasMany("taggings", { className: "NTagging" });
        this.hasMany("tags", { through: "taggings", className: "NTag" });
      }
    }
    class NComment extends Base {
      declare post_id: number | null;
      declare post: NPost | null;
      declare loadBelongsTo: (name: "post") => Promise<NPost | null>;

      static {
        this.attribute("post_id", "integer");
        this.belongsTo("post", { className: "NPost" });
      }
    }
    class NTagging extends Base {
      declare post_id: number | null;
      declare tag_id: number | null;
      declare post: NPost | null;
      declare tag: NTag | null;
      declare loadBelongsTo: ((name: "post") => Promise<NPost | null>) &
        ((name: "tag") => Promise<NTag | null>);

      static {
        this.attribute("post_id", "integer");
        this.attribute("tag_id", "integer");
        this.belongsTo("post", { className: "NPost" });
        this.belongsTo("tag", { className: "NTag" });
      }
    }
    class NTag extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class NAuthor extends Base {
      declare name: string | null;
      declare posts: AssociationProxy<NPost>;
      declare comments: AssociationProxy<Base>;
      declare tags: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("posts", { className: "NPost" });
        this.hasMany("comments", { through: "posts", source: "comments" });
        this.hasMany("tags", { through: "posts", source: "tags" });
      }
    }
    class NCategory extends Base {
      declare name: string | null;
      declare posts: AssociationProxy<NPost>;
      declare postComments: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasAndBelongsToMany("posts", { className: "NPost" });
        this.hasMany("postComments", {
          through: "posts",
          source: "comments",
          className: "NComment",
        });
      }
    }
    registerModel("NPost", NPost);
    registerModel("NComment", NComment);
    registerModel("NTagging", NTagging);
    registerModel("NTag", NTag);
    registerModel("NAuthor", NAuthor);
    registerModel("NCategory", NCategory);

    const commentsRef = reflectOnAssociation(NAuthor, "comments") as ThroughReflection;
    expect(commentsRef.isNested()).toBe(false);

    const tagsRef = reflectOnAssociation(NAuthor, "tags") as ThroughReflection;
    expect(tagsRef.isNested()).toBe(true);

    const postCommentsRef = reflectOnAssociation(NCategory, "postComments") as ThroughReflection;
    expect(postCommentsRef.isNested()).toBe(true);
  });

  it("join table", () => {
    // Rails stubs klass on a has_many reflection; join_table derives from both
    // table names regardless of which side declares the association.
    class DjtCategory extends Base {
      declare name: string | null;
      declare products: AssociationProxy<DjtProduct>;

      static _tableName = "categories";
      static {
        this.attribute("name", "string");
        this.hasMany("products", { className: "DjtProduct" });
      }
    }
    class DjtProduct extends Base {
      declare name: string | null;
      declare categories: AssociationProxy<DjtCategory>;

      static _tableName = "products";
      static {
        this.attribute("name", "string");
        this.hasMany("categories", { className: "DjtCategory" });
      }
    }
    registerModel("DjtCategory", DjtCategory);
    registerModel("DjtProduct", DjtProduct);
    const ref1 = reflectOnAssociation(DjtProduct, "categories");
    expect(ref1!.joinTable).toBe("categories_products");

    const ref2 = reflectOnAssociation(DjtCategory, "products");
    expect(ref2!.joinTable).toBe("categories_products");
  });

  it("includes accepts symbols", async () => {
    class Hotel extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class Department extends Base {
      declare hotel_id: number | null;
      declare name: string | null;

      static {
        this.attribute("hotel_id", "integer");
        this.attribute("name", "string");
      }
    }
    class Chef extends Base {
      declare department_id: number | null;
      declare name: string | null;

      static {
        this.attribute("department_id", "integer");
        this.attribute("name", "string");
      }
    }
    registerModel("Hotel", Hotel);
    registerModel("Department", Department);
    registerModel("Chef", Chef);
    Associations.hasMany.call(Hotel, "departments", { foreignKey: "hotel_id" });
    Associations.hasMany.call(Department, "chefs", { foreignKey: "department_id" });
    const hotel = await Hotel.create({ name: "Grand" });
    const dept = await Department.create({ hotel_id: hotel.id, name: "Kitchen" });
    const chef = await Chef.create({ department_id: dept.id, name: "Gordon" });
    // includes should accept a nested association hash (Rails `[departments: :chefs]`)
    // and actually preload the nested association onto the loaded records.
    const hotels = await Hotel.all().includes({ departments: "chefs" });
    expect(hotels).toHaveLength(1);
    const departments = hotels[0].association("departments").target as Base[];
    expect(departments).toHaveLength(1);
    const chefs = departments[0].association("chefs").target as Base[];
    expect(chefs.map((c) => (c as any).id)).toEqual([chef.id]);
  });

  it("association primary key uses explicit primary key option as first priority", () => {
    class Author extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    Associations.hasMany.call(Author, "books", { primaryKey: "custom_id" });
    const ref = reflectOnAssociation(Author, "books");
    expect(ref).not.toBeNull();
    expect(ref!.options.primaryKey).toBe("custom_id");
  });

  it("belongs to reflection with query constraints infers correct foreign key", () => {
    class BlogPost extends Base {
      declare blog_id: number | null;

      static _primaryKey: string | string[] = ["blog_id", "id"];
      static {
        this.attribute("blog_id", "integer");
        this.attribute("id", "integer");
      }
    }
    class Comment extends Base {
      declare blog_post_id: number | null;

      static {
        this.attribute("id", "integer");
        this.attribute("blog_post_id", "integer");
      }
    }
    registerModel(BlogPost);
    registerModel(Comment);
    Associations.belongsTo.call(Comment, "blogPost", { className: "BlogPost" });

    const ref = reflectOnAssociation(Comment, "blogPost")!;
    expect(ref.foreignKey).toBe("blog_post_id");
    // BelongsTo with composite PK target should infer "id" from [:blog_id, :id]
    expect(ref.associationPrimaryKey).toBe("id");
  });
});

describe("ReflectionTest", () => {
  // Rails: test "columns"
  it("columns", () => {
    class Person extends Base {
      declare name: string | null;
      declare age: number | null;
      declare active: boolean | null;

      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
        this.attribute("age", "integer");
        this.attribute("active", "boolean");
      }
    }

    const cols = columns(Person);
    expect(cols.length).toBe(4);
    expect(cols.map((c) => c.name)).toEqual(["id", "name", "age", "active"]);
  });

  // Rails: test "column_names"
  it("read attribute names", () => {
    class Person extends Base {
      declare name: string | null;

      static {
        this._tableName = "people";
        this.attribute("id", "integer");
        this.attribute("name", "string");
      }
    }

    expect(columnNames(Person)).toEqual(["id", "name"]);
  });

  it("using query constraints warns about changing behavior", () => {
    class Firm extends Base {
      static {
        this.attribute("id", "integer");
      }
    }
    registerModel(Firm);

    expect(() =>
      Associations.hasMany.call(Firm, "clients", {
        queryConstraints: ["firm_id", "firm_name"],
      }),
    ).toThrow(
      "Setting `queryConstraints:` option on `Firm.hasMany :clients` is not allowed. " +
        "To get the same behavior, use the `foreignKey` option instead.",
    );

    expect(() =>
      Associations.hasOne.call(Firm, "account", {
        queryConstraints: ["firm_id", "firm_name"],
      }),
    ).toThrow(
      "Setting `queryConstraints:` option on `Firm.hasOne :account` is not allowed. " +
        "To get the same behavior, use the `foreignKey` option instead.",
    );

    expect(() =>
      Associations.belongsTo.call(Firm, "client", {
        queryConstraints: ["firm_id", "firm_name"],
      }),
    ).toThrow(
      "Setting `queryConstraints:` option on `Firm.belongsTo :client` is not allowed. " +
        "To get the same behavior, use the `foreignKey` option instead.",
    );
  });
});
