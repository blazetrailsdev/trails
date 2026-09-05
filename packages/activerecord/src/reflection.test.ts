import "./support/canonical-model-index.js";
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { describe, it, expect } from "vitest";
import {
  Base,
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
  MyAppBusinessCompany,
} from "./test-helpers/models/company-in-module.js";
import { Post as CanonicalPost } from "./test-helpers/models/post.js";
import { Topic as CanonicalTopic } from "./test-helpers/models/topic.js";
import { Subscriber } from "./test-helpers/models/subscriber.js";
import { NullColumn } from "./connection-adapters/column.js";
import { create as createReflection } from "./reflection.js";
import { Customer } from "./test-helpers/models/customer.js";
import { UserWithInvalidRelation } from "./test-helpers/models/user-with-invalid-relation.js";
import { Organization } from "./test-helpers/models/organization.js";
import { Author } from "./test-helpers/models/author.js";
import { Hotel as CanonicalHotel } from "./test-helpers/models/hotel.js";
import { Department } from "./test-helpers/models/department.js";
import { Chef } from "./test-helpers/models/chef.js";
import { Firm, Client } from "./test-helpers/models/company.js";
import { Sponsor } from "./test-helpers/models/sponsor.js";
import { Category } from "./test-helpers/models/category.js";
import { Edge } from "./test-helpers/models/edge.js";
import { ShardedComment } from "./test-helpers/models/sharded.js";

import { UnknownPrimaryKey, NameError } from "./errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { fixtures } from "./test-fixtures.js";

fixtures(["topics", "subscribers"]);

describe("ReflectionTest", () => {
  function makeModels() {
    class RfAuthor extends Base {
      declare name: string | null;
      declare books: AssociationProxy<RfBook>;

      static {
        this.attribute("name", "string");
        this.hasMany("books", { className: "RfBook" });
        this.hasOne("profile", { className: "RfProfile" });
      }
    }
    class RfBook extends Base {
      declare title: string | null;
      declare author_id: number | null;

      static {
        this.attribute("title", "string");
        this.attribute("author_id", "integer");
        this.belongsTo("author", { className: "RfAuthor" });
        this.hasMany("chapters", { className: "RfChapter" });
      }
    }
    class RfChapter extends Base {
      declare title: string | null;
      declare book_id: number | null;

      static {
        this.attribute("title", "string");
        this.attribute("book_id", "integer");
      }
    }
    registerModel(RfAuthor);
    registerModel(RfBook);
    registerModel(RfChapter);
    return { Author: RfAuthor, Book: RfBook, Chapter: RfChapter };
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

    await h2.mocktailDesigners.replace([]);

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

    await a3.bestHardbacks.replace([]);

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
    class RfSubscriber extends Base {
      declare name: string | null;
      declare subscriptions: AssociationProxy<RfSubscription>;
      declare subBooks: AssociationProxy<Base>;

      static {
        this.attribute("name", "string");
        this.hasMany("subscriptions", { className: "RfSubscription" });
        this.hasMany("subBooks", {
          through: "subscriptions",
          source: "subBook",
          className: "SubBook",
        });
      }
    }
    class RfSubscription extends Base {
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
    registerModel("RfSubscriber", RfSubscriber);
    registerModel("RfSubscription", RfSubscription);
    registerModel("SubBook", SubBook);
    const ref = reflectOnAssociation(RfSubscriber, "subBooks");
    expect(ref).toBeInstanceOf(ThroughReflection);
    expect((ref as ThroughReflection).through).toBe("subscriptions");
    expect((ref as ThroughReflection).sourceReflectionName()).toBe("subBook");
    expect(ref!.isThrough()).toBe(true);
  });

  it("has and belongs to many reflection", () => {
    expect(reflectOnAssociation(Category, "posts")!.macro).toBe("hasAndBelongsToMany");
    const refs = reflectOnAllAssociations(Category, "hasAndBelongsToMany");
    expect(refs.length).toBeGreaterThanOrEqual(1);
    expect(refs[0].name).toBe("posts");
  });
  it("columns are returned in the order they were declared", () => {
    const columnNames = CanonicalTopic.columns().map((c: { name: string }) => c.name);
    expect(columnNames).toEqual([
      "id",
      "title",
      "author_name",
      "author_email_address",
      "written_on",
      "bonus_time",
      "last_read",
      "content",
      "important",
      "binary_content",
      "approved",
      "replies_count",
      "unique_replies_count",
      "parent_id",
      "parent_title",
      "type",
      "group",
      "created_at",
      "updated_at",
    ]);
  });
  it("content columns", () => {
    const contentColumns = CanonicalTopic.contentColumns();
    const contentColumnNames = contentColumns.map((c: { name: string }) => c.name);
    expect(contentColumns.length).toBe(14);
    expect(contentColumnNames.sort()).toEqual(
      [
        "title",
        "author_name",
        "author_email_address",
        "written_on",
        "bonus_time",
        "last_read",
        "content",
        "important",
        "binary_content",
        "group",
        "approved",
        "parent_title",
        "created_at",
        "updated_at",
      ].sort(),
    );
  });
  it("non existent columns return null object", () => {
    const column = (CanonicalTopic as any).columnForAttribute("attribute_that_doesnt_exist");
    expect(column).toBeInstanceOf(NullColumn);
    expect(column.name).toBe("attribute_that_doesnt_exist");
    expect(column.sqlType).toBeNull();
    expect(column.type).toBeNull();
  });
  it("non existent types are identity types", () => {
    class Topic2 extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    const type = Topic2.typeForAttribute("attribute_that_doesnt_exist")!;
    const object = { sentinel: true };
    expect(type.deserialize(object)).toBe(object);
    expect(type.cast(object)).toBe(object);
    expect(type.serialize(object)).toBe(object);
  });
  it("reflection klass for nested class name", async () => {
    const anonymous = null as unknown as string;
    const reflection = createReflection(
      "hasMany",
      anonymous,
      null,
      { className: "MyApplication::Business::Company" },
      Customer,
    );
    expect(reflection.klass).toBe(MyAppBusinessCompany);
  });

  it("irregular reflection class name", async () => {
    class RfPerson extends Base {
      declare name: string | null;
      declare addresses: AssociationProxy<RfAddress>;

      static {
        this.attribute("name", "string");
        this.hasMany("addresses", { className: "RfAddress" });
      }
    }
    class RfAddress extends Base {
      declare street: string | null;

      static {
        this.attribute("street", "string");
      }
    }
    registerModel("RfPerson", RfPerson);
    registerModel("RfAddress", RfAddress);
    const ref = reflectOnAssociation(RfPerson, "addresses");
    expect(ref!.klass).toBe(RfAddress);
  });
  it("reflection klass with same demodularized different modularized name", async () => {
    class RfNestedUser extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
      }
    }
    class RfAdminUser extends Base {
      declare name: string | null;
      declare user: RfNestedUser | null;
      declare loadHasOne: (name: "user") => Promise<RfNestedUser | null>;

      static {
        this.attribute("name", "string");
        this.hasOne("user", { className: "RfNested::User" });
      }
    }
    registerModel("RfNested::User", RfNestedUser);
    registerModel("RfAdmin::User", RfAdminUser);
    const ref = reflectOnAssociation(RfAdminUser, "user");
    expect(ref!.klass).toBe(RfNestedUser);
  });
  it("reflection klass with same modularized name", async () => {
    class RfNestedNestedUser extends Base {
      declare name: string | null;
      declare nestedUsers: AssociationProxy<RfNestedNestedUser>;

      static {
        this.attribute("name", "string");
        this.hasMany("nestedUsers", { className: "RfNestedNestedUser" });
      }
    }
    registerModel("RfNestedNestedUser", RfNestedNestedUser);
    const ref = reflectOnAssociation(RfNestedNestedUser, "nestedUsers");
    expect(ref!.klass).toBe(RfNestedNestedUser);
  });
  it("reflect on all autosave associations", () => {
    class RfShip extends Base {
      declare name: string | null;
      declare parts: AssociationProxy<RfPart>;
      declare crews: AssociationProxy<RfCrew>;

      static {
        this.attribute("name", "string");
        this.hasMany("parts", { autosave: true, className: "RfPart" });
        this.hasMany("crews", { className: "RfCrew" });
      }
    }
    class RfPart extends Base {
      declare ship_id: number | null;

      static {
        this.attribute("ship_id", "integer");
      }
    }
    class RfCrew extends Base {
      declare ship_id: number | null;

      static {
        this.attribute("ship_id", "integer");
      }
    }
    registerModel("RfShip", RfShip);
    registerModel("RfPart", RfPart);
    registerModel("RfCrew", RfCrew);
    const autosaved = reflectOnAllAutosaveAssociations(RfShip);
    expect(autosaved).toHaveLength(1);
    expect(autosaved[0].name).toBe("parts");
  });
  it("association primary key", () => {
    const { Author, Book } = makeModels();
    const ref = reflectOnAssociation(Author, "books") as AssociationReflection;
    expect(ref.associationPrimaryKey()).toBe("id");
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
    expect(specialRef.associationPrimaryKey()).toBe("isbn");
  });
  it("association primary key raises when missing primary key", () => {
    const reflection = createReflection(
      "hasMany",
      "edge",
      null,
      {},
      Author,
    ) as AssociationReflection;
    expect(() => reflection.associationPrimaryKey()).toThrow(UnknownPrimaryKey);

    class ThroughSub extends ThroughReflection {
      get sourceReflection(): AssociationReflection {
        return reflection;
      }
    }
    const through = new ThroughSub(reflection);
    expect(() => through.associationPrimaryKey()).toThrow(UnknownPrimaryKey);
  });
  it("active record primary key raises when missing primary key", () => {
    const reflection = createReflection("hasMany", "author", null, {}, Edge);
    expect(() => (reflection as AssociationReflection).activeRecordPrimaryKey).toThrow(
      UnknownPrimaryKey,
    );
  });
  it("foreign type", () => {
    const polyRef = reflectOnAssociation(Sponsor, "sponsorable");
    expect(polyRef!.foreignType).toBe("sponsorable_type");
    const thingRef = reflectOnAssociation(Sponsor, "thing");
    expect(thingRef!.foreignType).toBe("sponsorable_type");
    const normalRef = reflectOnAssociation(Sponsor, "sponsorClub");
    expect(normalRef!.foreignType).toBeNull();
  });
  it("default association validation", () => {
    expect(createReflection("hasMany", "clients", null, {}, Firm).validate).toBe(true);
    expect(createReflection("hasOne", "client", null, {}, Firm).validate).toBe(false);
    expect(createReflection("belongsTo", "client", null, {}, Firm).validate).toBe(false);
  });
  it("always validate association if explicit", () => {
    expect(createReflection("hasOne", "client", null, { validate: true }, Firm).validate).toBe(
      true,
    );
    expect(createReflection("belongsTo", "client", null, { validate: true }, Firm).validate).toBe(
      true,
    );
    expect(createReflection("hasMany", "clients", null, { validate: true }, Firm).validate).toBe(
      true,
    );
  });
  it("validate association if autosave", () => {
    expect(createReflection("hasOne", "client", null, { autosave: true }, Firm).validate).toBe(
      true,
    );
    expect(createReflection("belongsTo", "client", null, { autosave: true }, Firm).validate).toBe(
      true,
    );
    expect(createReflection("hasMany", "clients", null, { autosave: true }, Firm).validate).toBe(
      true,
    );
  });
  it("never validate association if explicit", () => {
    expect(
      createReflection("hasOne", "client", null, { autosave: true, validate: false }, Firm)
        .validate,
    ).toBe(false);
    expect(
      createReflection("belongsTo", "client", null, { autosave: true, validate: false }, Firm)
        .validate,
    ).toBe(false);
    expect(
      createReflection("hasMany", "clients", null, { autosave: true, validate: false }, Firm)
        .validate,
    ).toBe(false);
  });
  it.skip("symbol for class name", () => {});
  it("class for class name", () => {
    expect(() =>
      createReflection(
        "hasMany",
        "clients",
        null,
        { className: Client as unknown as string },
        Firm,
      ),
    ).toThrow(/A class was passed to `:className` but we are expecting a string\./);
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
    const hotel = await CanonicalHotel.create({});
    const dept = await Department.create({ hotel_id: hotel.id });
    await Chef.create({ department_id: dept.id });
    const hotels = await CanonicalHotel.all().includes(":departments");
    expect(hotels).toHaveLength(1);
  });
  it("reflect on association accepts symbols", () => {
    const ref = reflectOnAssociation(CanonicalHotel, "departments");
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe("departments");
  });
  it("reflect on association accepts strings", () => {
    const ref = reflectOnAssociation(CanonicalHotel, "departments");
    expect(ref).not.toBeNull();
    expect(ref!.name).toBe("departments");
  });
  it("reflect on missing source assocation raise exception", () => {
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
  it.skip("name error from incidental code is not converted to name error for association", () => {});
  it("automatic inverse suppresses name error for association", () => {
    const reflection = reflectOnAssociation(UserWithInvalidRelation, "notAClass");
    expect(reflection).not.toBeNull();
    const dup = Object.create(
      Object.getPrototypeOf(reflection),
      Object.getOwnPropertyDescriptors(reflection),
    ) as typeof reflection;
    expect(dup!.hasInverse()).toBe(false);
  });
  it.skip("automatic inverse does not suppress name error from incidental code", () => {});

  it("human name", () => {
    class Post extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    expect(Post.name).toBe("Post");
  });

  it("column string type and limit", async () => {
    await CanonicalTopic.loadSchema();
    expect((CanonicalTopic as any).columnForAttribute("title").type).toBe("string");
    expect(CanonicalTopic.typeForAttribute("title")!.type()).toBe("string");
    expect(CanonicalTopic.typeForAttribute("heading")!.type()).toBe("string");
    expect((CanonicalTopic as any).columnForAttribute("title").limit).toBe(250);
  });

  it("column null not null", async () => {
    await Subscriber.loadSchema();
    expect((Subscriber as any).columnForAttribute("name").null).toBe(true);
    expect((Subscriber as any).columnForAttribute("nick").null).toBe(false);
  });

  it("human name for column", async () => {
    await CanonicalTopic.loadSchema();
    expect((CanonicalTopic as any).columnForAttribute("author_name").humanName()).toBe(
      "Author name",
    );
  });

  it("integer columns", async () => {
    await CanonicalTopic.loadSchema();
    expect(["integer", "big_integer"]).toContain(
      (CanonicalTopic as any).columnForAttribute("id").type,
    );
    expect(["integer", "big_integer"]).toContain(CanonicalTopic.typeForAttribute("id")!.type());
  });

  it("non existent columns return null object", async () => {
    await CanonicalTopic.loadSchema();
    const column = (CanonicalTopic as any).columnForAttribute("attribute_that_doesnt_exist");
    expect(column).toBeInstanceOf(NullColumn);
    expect(column.name).toBe("attribute_that_doesnt_exist");
    expect(column.sqlType).toBeNull();
    expect(column.type).toBeNull();
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
    expect(() => ref!.klass).toThrow(
      "Missing model class Ghost for the Orphan#ghosts association." +
        " You can specify a different model class with the :class_name option.",
    );
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
    expect(() => ref!.klass).toThrow(
      "Missing model class NonExistentModel for the Orphan2#items association.",
    );
    expect(() => ref!.klass).not.toThrow(/:class_name option/);
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
    expect(ref!.klass).toBe(Child);

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
    class RfProject extends Base {
      declare name: string | null;
      declare tasks: AssociationProxy<RfTask>;

      static {
        this.attribute("name", "string");
        this.hasMany("tasks", { className: "RfTask" });
      }
    }
    class RfTask extends Base {
      declare title: string | null;

      static {
        this.attribute("title", "string");
      }
    }
    registerModel("RfProject", RfProject);
    registerModel("RfTask", RfTask);
    const ref = reflectOnAssociation(RfProject, "tasks");
    expect(ref!.klass).toBe(RfTask);
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
    const ref = new AggregateReflection("balance", null, { className: "NoSuchMoney" }, Buyer);
    expect(() => ref.klass).toThrow(NameError);
    expect(() => ref.klass).toThrow(/uninitialized constant NoSuchMoney/);
  });

  it("association reflection in modules", async () => {
    const firmRef = reflectOnAssociation(MyAppBusinessFirm, "clientsOfFirm");
    expect(firmRef!.klass).toBe(MyAppBusinessClient);
    expect(firmRef!.className).toBe("Client");
    expect(firmRef!.tableName).toBe("companies");

    const acctFirmRef = reflectOnAssociation(MyAppBillingAccount, "firm");
    expect(acctFirmRef!.klass).toBe(MyAppBusinessFirm);
    expect(acctFirmRef!.className).toBe("MyApplication::Business::Firm");
    expect(acctFirmRef!.tableName).toBe("companies");

    const qualRef = reflectOnAssociation(MyAppBillingAccount, "qualifiedBillingFirm");
    expect(qualRef!.klass).toBe(MyAppBillingFirm);
    expect(qualRef!.className).toBe("MyApplication::Billing::Firm");
    expect(qualRef!.tableName).toBe("companies");

    const unqualRef = reflectOnAssociation(MyAppBillingAccount, "unqualifiedBillingFirm");
    expect(unqualRef!.klass).toBe(MyAppBillingFirm);
    expect(unqualRef!.className).toBe("Firm");
    expect(unqualRef!.tableName).toBe("companies");

    const nestedQualRef = reflectOnAssociation(MyAppBillingAccount, "nestedQualifiedBillingFirm");
    expect(nestedQualRef!.klass).toBe(MyAppBillingNestedFirm);
    expect(nestedQualRef!.className).toBe("MyApplication::Billing::Nested::Firm");
    expect(nestedQualRef!.tableName).toBe("companies");

    const nestedRef = reflectOnAssociation(MyAppBillingAccount, "nestedUnqualifiedBillingFirm");
    expect(nestedRef!.klass).toBe(MyAppBillingNestedFirm);
    expect(nestedRef!.className).toBe("Nested::Firm");
    expect(nestedRef!.tableName).toBe("companies");

    expect(resolveAssocClass(MyAppBusinessFirm, "clientsOfFirm", "Client")).toBe(
      MyAppBusinessClient,
    );
  });

  it("chain", () => {
    const authorEssayCatRef = reflectOnAssociation(Organization, "authorEssayCategories");
    expect(authorEssayCatRef).toBeInstanceOf(ThroughReflection);

    const chain = (authorEssayCatRef as ThroughReflection).chain;
    expect(chain).toHaveLength(3);
    expect(chain[0]).toBe(authorEssayCatRef);
    expect(chain[1]).toBe(reflectOnAssociation(Author, "essays"));
    expect(chain[2]).toBe(reflectOnAssociation(Organization, "authors"));
  });

  it("nested?", () => {
    const commentsRef = reflectOnAssociation(Author, "comments") as ThroughReflection;
    expect(commentsRef.isNested()).toBe(false);

    const tagsRef = reflectOnAssociation(Author, "tags") as ThroughReflection;
    expect(tagsRef.isNested()).toBe(true);

    const postCommentsRef = reflectOnAssociation(Category, "postComments") as ThroughReflection;
    expect(postCommentsRef.isNested()).toBe(true);
  });

  it("join table", () => {
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
    const hotel = await CanonicalHotel.create({});
    const dept = await Department.create({ hotel_id: hotel.id });
    const chef = await Chef.create({ department_id: dept.id });
    const hotels = await CanonicalHotel.all().includes({ ":departments": ":chefs" });
    expect(hotels).toHaveLength(1);
    const departments = hotels[0].association("departments").target as Base[];
    expect(departments).toHaveLength(1);
    const chefs = departments[0].association("chefs").target as Base[];
    expect(chefs.map((c) => (c as any).id)).toEqual([chef.id]);
  });

  it("association primary key uses explicit primary key option as first priority", () => {
    const ref = reflectOnAssociation(ShardedComment, "blogPostById");
    expect(ref).not.toBeNull();
    expect(ref!.associationPrimaryKey()).toBe("id");
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
    class RfComment extends Base {
      declare blog_post_id: number | null;
      declare blogPost: BlogPost | null;
      declare loadBelongsTo: (name: "blogPost") => Promise<BlogPost | null>;

      static {
        this.attribute("id", "integer");
        this.attribute("blog_post_id", "integer");
        this.belongsTo("blogPost", { className: "BlogPost" });
      }
    }
    registerModel(BlogPost);
    registerModel(RfComment);

    const ref = reflectOnAssociation(RfComment, "blogPost")!;
    expect(ref.foreignKey).toBe("blog_post_id");
    expect(ref.associationPrimaryKey()).toBe("id");
  });
});

describe("ReflectionTest", () => {
  it("columns", () => {
    expect(CanonicalTopic.columns().length).toBe(19);
  });

  it("read attribute names", async () => {
    const first = await CanonicalTopic.find(1);
    expect(first.attributeNames().sort()).toEqual(
      [
        "id",
        "title",
        "author_name",
        "author_email_address",
        "bonus_time",
        "written_on",
        "last_read",
        "content",
        "important",
        "binary_content",
        "group",
        "approved",
        "replies_count",
        "unique_replies_count",
        "parent_id",
        "parent_title",
        "type",
        "created_at",
        "updated_at",
      ].sort(),
    );
  });

  it("using query constraints warns about changing behavior", () => {
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
