import "./support/canonical-model-index.js";
import type { AssociationProxy } from "./associations/collection-proxy.js";
import { describe, it, expect } from "vitest";
import {
  Base,
  reflectOnAssociation,
  ThroughReflection,
  AssociationReflection,
  AggregateReflection,
  registerModel,
} from "./index.js";
import { Associations } from "./associations.js";
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
import { Firm, Client } from "./test-helpers/models/company.js";
import { Sponsor } from "./test-helpers/models/sponsor.js";
import { Category } from "./test-helpers/models/category.js";
import { Edge } from "./test-helpers/models/edge.js";
import { ShardedComment } from "./test-helpers/models/sharded.js";

import { UnknownPrimaryKey, NameError } from "./errors.js";
import { HasManyThroughSourceAssociationNotFoundError } from "./associations/errors.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  assert,
  assertEmpty,
  assertIncludes,
  assertNotEmpty,
  assertNothingRaised,
  assertRaise,
  assertRaises,
} from "@blazetrails/activesupport";
import { PriceEstimate } from "./test-helpers/models/price-estimate.js";
import { Address, Money } from "./test-helpers/models/customer.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Ship } from "./test-helpers/models/ship.js";
import { Account } from "./test-helpers/models/account.js";
import { Company } from "./test-helpers/models/company.js";
import { Essay } from "./test-helpers/models/essay.js";
import { Tag } from "./test-helpers/models/tag.js";
import { BestHardback } from "./test-helpers/models/hardback.js";
import { DrinkDesigner } from "./test-helpers/models/drink-designer.js";
import { Recipe } from "./test-helpers/models/recipe.js";
import { FirstPost } from "./test-helpers/models/post.js";
import { captureSql } from "./testing/sql-capture.js";
import { fixtures } from "./test-fixtures.js";

fixtures(["topics", "customers", "companies", "subscribers", "priceEstimates"]);

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class ScChef extends Base {
      declare department_id: number | null;
      declare employable_id: number | null;
      declare employable_type: string | null;

      static {
        this.attribute("department_id", "integer");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", { polymorphic: true });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface ScChef {
      get employable(): Base | null | Promise<Base | null>;
      set employable(value: Base | null);
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class SC2ChefList extends Base {
      declare employable_list_id: number | null;
      declare employable_list_type: string | null;
      declare employable_id: number | null;
      declare employable_type: string | null;

      static {
        this.attribute("employable_list_id", "integer");
        this.attribute("employable_list_type", "string");
        this.attribute("employable_id", "integer");
        this.attribute("employable_type", "string");
        this.belongsTo("employable", { polymorphic: true });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface SC2ChefList {
      get employable(): Base | null | Promise<Base | null>;
      set employable(value: Base | null);
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
    const author = await Author.create({ name: "John Doe" });
    const hardback = await BestHardback.create();
    await author.bestHardbacks.push(hardback);

    expect((await author.bestHardbacks).map((r) => r.id)).toEqual([hardback.id]);
    expect((await (await author.reload()).bestHardbacks).map((r) => r.id)).toEqual([hardback.id]);

    await author.bestHardbacks.replace([]);

    assertEmpty(await author.bestHardbacks);
    assertEmpty(await (await author.reload()).bestHardbacks);
  });
  it("scope chain of polymorphic association does not leak into other hmt associations", async () => {
    const hotel = await CanonicalHotel.create();
    const department = await hotel.departments.create();
    const drink = await department.chefs.create({ employable: await DrinkDesigner.create() });
    await Recipe.create({ chef_id: drink.id, hotel_id: hotel.id });

    const expectedSql = await captureSql(async () => {
      await hotel.recipes;
    });

    CanonicalHotel.reflectOnAssociation("recipes")!.clearAssociationScopeCache();
    await hotel.reload();
    await hotel.drinkDesigners;
    const loadedSql = await captureSql(async () => {
      await hotel.recipes;
    });

    expect(loadedSql).toEqual(expectedSql);
  });

  it("has many reflection", () => {
    const reflectionForClients = <AssociationReflection>(
      createReflection("hasMany", "clients", null, { order: "id", dependent: "destroy" }, Firm)
    );

    expect(reflectionForClients.equals(Firm.reflectOnAssociation("clients"))).toBe(true);

    expect(Firm.reflectOnAssociation("clients")!.klass).toBe(Client);
    expect(Firm.reflectOnAssociation("clients")!.tableName).toBe("companies");

    expect(Firm.reflectOnAssociation("clientsOfFirm")!.klass).toBe(Client);
    expect(Firm.reflectOnAssociation("clientsOfFirm")!.tableName).toBe("companies");
  });
  it("has one reflection", () => {
    const reflectionForAccount = <AssociationReflection>(
      createReflection(
        "hasOne",
        "account",
        null,
        { foreignKey: "firm_id", dependent: "destroy" },
        Firm,
      )
    );
    expect(reflectionForAccount.equals(Firm.reflectOnAssociation("account"))).toBe(true);

    expect(Firm.reflectOnAssociation("account")!.klass).toBe(Account);
    expect(Firm.reflectOnAssociation("account")!.tableName).toBe("accounts");
  });
  it("has many through reflection", () => {
    expect(Subscriber.reflectOnAssociation("books")).toBeInstanceOf(ThroughReflection);
  });

  it("has and belongs to many reflection", () => {
    expect(Category.reflections()["posts"].macro).toBe("hasAndBelongsToMany");
    expect(Category.reflectOnAllAssociations("hasAndBelongsToMany")[0].name).toBe("posts");
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
  it("non existent types are identity types", async () => {
    const first = await CanonicalTopic.find(1);
    let type = first.typeForAttribute("attribute_that_doesnt_exist")!;
    const object = new Object();

    expect(type.deserialize(object)).toBe(object);
    expect(type.cast(object)).toBe(object);
    expect(type.serialize(object)).toBe(object);

    type = first.typeForAttribute("attribute_that_doesnt_exist")!;
    expect(type.deserialize(object)).toBe(object);
    expect(type.cast(object)).toBe(object);
    expect(type.serialize(object)).toBe(object);
  });
  it("reflection klass for nested class name", async () => {
    const reflection = createReflection(
      "hasMany",
      null as unknown as string,
      null,
      { className: "MyApplication::Business::Company" },
      Customer,
    );
    await assertNothingRaised(() => {
      expect(reflection.klass).toBe(MyAppBusinessCompany);
    });
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class RfAdminUser extends Base {
      declare name: string | null;

      static {
        this.attribute("name", "string");
        this.hasOne("user", { className: "RfNested::User" });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface RfAdminUser {
      get user(): RfNestedUser | null | Promise<RfNestedUser | null>;
      set user(value: RfNestedUser | null);
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
    const expected = Pirate.reflectOnAllAssociations().filter((r) => r.options.autosave);
    const received = Pirate.reflectOnAllAutosaveAssociations();

    assertNotEmpty(received);
    expect(received.length).not.toBe(Pirate.reflectOnAllAssociations().length);
    expect(received).toEqual(expected);
  });
  it("association primary key", () => {
    expect(String(Author.reflectOnAssociation("posts")!.associationPrimaryKey())).toBe("id");
    expect(String(Author.reflectOnAssociation("essay")!.associationPrimaryKey())).toBe("id");
    expect(String(Essay.reflectOnAssociation("writer")!.associationPrimaryKey())).toBe("name");

    expect(String(Author.reflectOnAssociation("subscribers")!.associationPrimaryKey())).toBe(
      "nick",
    );
    expect(String(Author.reflectOnAssociation("essayCategory")!.associationPrimaryKey())).toBe(
      "name",
    );
    expect(String(Author.reflectOnAssociation("tagsWithPrimaryKey")!.associationPrimaryKey())).toBe(
      "custom_primary_key",
    );
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
    expect(createReflection("hasMany", "clients", null, {}, Firm).validate).toBeTruthy();

    expect(createReflection("hasOne", "client", null, {}, Firm).validate).toBeFalsy();
    expect(createReflection("belongsTo", "client", null, {}, Firm).validate).toBeFalsy();
  });
  it("always validate association if explicit", () => {
    expect(
      createReflection("hasOne", "client", null, { validate: true }, Firm).validate,
    ).toBeTruthy();
    expect(
      createReflection("belongsTo", "client", null, { validate: true }, Firm).validate,
    ).toBeTruthy();
    expect(
      createReflection("hasMany", "clients", null, { validate: true }, Firm).validate,
    ).toBeTruthy();
  });
  it("validate association if autosave", () => {
    expect(
      createReflection("hasOne", "client", null, { autosave: true }, Firm).validate,
    ).toBeTruthy();
    expect(
      createReflection("belongsTo", "client", null, { autosave: true }, Firm).validate,
    ).toBeTruthy();
    expect(
      createReflection("hasMany", "clients", null, { autosave: true }, Firm).validate,
    ).toBeTruthy();
  });
  it("never validate association if explicit", () => {
    expect(
      createReflection("hasOne", "client", null, { autosave: true, validate: false }, Firm)
        .validate,
    ).toBeFalsy();
    expect(
      createReflection("belongsTo", "client", null, { autosave: true, validate: false }, Firm)
        .validate,
    ).toBeFalsy();
    expect(
      createReflection("hasMany", "clients", null, { autosave: true, validate: false }, Firm)
        .validate,
    ).toBeFalsy();
  });
  it.skip("symbol for class name", () => {});
  it("class for class name", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      createReflection(
        "hasMany",
        "clients",
        null,
        { className: Client as unknown as string },
        Firm,
      );
    });
    expect(error.message).toBe("A class was passed to `:className` but we are expecting a string.");
  });
  it("class for source type", async () => {
    const error = await assertRaises([ArgumentError], {}, () => {
      createReflection(
        "hasMany",
        "taggedPosts",
        null,
        { through: "taggings", source: "taggable", sourceType: CanonicalPost as unknown as string },
        Tag,
      );
    });
    expect(error.message).toBe(
      "A class was passed to `:sourceType` but we are expecting a string.",
    );
  });
  it("join table with common prefix", () => {
    const category: Pick<typeof Base, "tableName" | "pluralizeTableNames"> = {
      tableName: "catalog_categories",
      pluralizeTableNames: true,
    };
    const product: Pick<typeof Base, "tableName" | "pluralizeTableNames"> = {
      tableName: "catalog_products",
      pluralizeTableNames: true,
    };

    let reflection = createReflection("hasMany", "categories", null, {}, product as typeof Base);
    Object.defineProperty(reflection, "klass", { value: category });
    expect(reflection.joinTable).toBe("catalog_categories_products");

    reflection = createReflection("hasMany", "products", null, {}, category as typeof Base);
    Object.defineProperty(reflection, "klass", { value: product });
    expect(reflection.joinTable).toBe("catalog_categories_products");
  });

  it("join table with different prefix", () => {
    const category: Pick<typeof Base, "tableName" | "pluralizeTableNames"> = {
      tableName: "catalog_categories",
      pluralizeTableNames: true,
    };
    const page: Pick<typeof Base, "tableName" | "pluralizeTableNames"> = {
      tableName: "content_pages",
      pluralizeTableNames: true,
    };

    let reflection = createReflection("hasMany", "categories", null, {}, page as typeof Base);
    Object.defineProperty(reflection, "klass", { value: category });
    expect(reflection.joinTable).toBe("catalog_categories_content_pages");

    reflection = createReflection("hasMany", "pages", null, {}, category as typeof Base);
    Object.defineProperty(reflection, "klass", { value: page });
    expect(reflection.joinTable).toBe("catalog_categories_content_pages");
  });

  it("join table can be overridden", () => {
    const category: Pick<typeof Base, "tableName" | "pluralizeTableNames"> = {
      tableName: "categories",
      pluralizeTableNames: true,
    };
    const product: Pick<typeof Base, "tableName" | "pluralizeTableNames"> = {
      tableName: "products",
      pluralizeTableNames: true,
    };

    let reflection = createReflection(
      "hasMany",
      "categories",
      null,
      { joinTable: "product_categories" },
      product as typeof Base,
    );
    Object.defineProperty(reflection, "klass", { value: category });
    expect(reflection.joinTable).toBe("product_categories");

    reflection = createReflection(
      "hasMany",
      "products",
      null,
      { joinTable: "product_categories" },
      category as typeof Base,
    );
    Object.defineProperty(reflection, "klass", { value: product });
    expect(reflection.joinTable).toBe("product_categories");
  });
  it("includes accepts strings", async () => {
    const hotel = await CanonicalHotel.create();
    const department = await hotel.departments.create();
    await department.chefs.create();

    await assertNothingRaised(async () => {
      expect(
        (await (await CanonicalHotel.includes([{ departments: "chefs" }]).first())!.chefs).map(
          (r) => r.id,
        ),
      ).toEqual((await department.chefs).map((r) => r.id));
    });
  });
  it("reflect on association accepts symbols", async () => {
    await assertNothingRaised(() => {
      expect(CanonicalHotel.reflectOnAssociation("departments")!.name).toBe("departments");
    });
  });
  it("reflect on association accepts strings", async () => {
    await assertNothingRaised(() => {
      expect(CanonicalHotel.reflectOnAssociation("departments")!.name).toBe("departments");
    });
  });
  it("reflect on missing source assocation raise exception", () => {
    expect(() => CanonicalHotel.reflectOnAssociation("lostItems")!.checkValidityBang()).toThrow(
      HasManyThroughSourceAssociationNotFoundError,
    );
  });
  it.skip("name error from incidental code is not converted to name error for association", () => {});
  it("automatic inverse suppresses name error for association", () => {
    const reflection = UserWithInvalidRelation.reflectOnAssociation("notAClass")!;
    const dup = Object.create(
      Object.getPrototypeOf(reflection),
      Object.getOwnPropertyDescriptors(reflection),
    ) as typeof reflection;
    expect(dup.hasInverse()).toBeFalsy();
  });
  it.skip("automatic inverse does not suppress name error from incidental code", () => {});

  it("human name", () => {
    expect(PriceEstimate.modelName.human()).toBe("Price estimate");
    expect(Subscriber.modelName.human()).toBe("Subscriber");
  });

  it("column string type and limit", async () => {
    const first = await CanonicalTopic.find(1);
    expect(first.columnForAttribute("title").type).toBe("string");
    expect(first.columnForAttribute("title").type).toBe("string");
    expect(first.typeForAttribute("title")!.type()).toBe("string");
    expect(first.typeForAttribute("title")!.type()).toBe("string");
    expect(first.typeForAttribute("heading")!.type()).toBe("string");
    expect(first.typeForAttribute("heading")!.type()).toBe("string");
    expect(first.columnForAttribute("title").limit).toBe(250);
  });

  it("column null not null", async () => {
    const subscriber = (await Subscriber.first())!;
    expect(subscriber.columnForAttribute("name").null).toBeTruthy();
    expect(subscriber.columnForAttribute("nick").null).toBeFalsy();
  });

  it("human name for column", async () => {
    await CanonicalTopic.loadSchema();
    expect((CanonicalTopic as any).columnForAttribute("author_name").humanName()).toBe(
      "Author name",
    );
  });

  it("integer columns", async () => {
    const first = await CanonicalTopic.find(1);
    expect(first.columnForAttribute("id").type).toBe("integer");
    expect(first.columnForAttribute("id").type).toBe("integer");
    expect(first.typeForAttribute("id")!.type()).toBe("integer");
    expect(first.typeForAttribute("id")!.type()).toBe("integer");
  });

  it("non existent columns return null object", async () => {
    const first = await CanonicalTopic.find(1);
    let column = first.columnForAttribute("attribute_that_doesnt_exist");
    expect(column).toBeInstanceOf(NullColumn);
    expect(column.name).toBe("attribute_that_doesnt_exist");
    expect(column.sqlType).toBeNull();
    expect(column.type).toBeNull();

    column = first.columnForAttribute("attribute_that_doesnt_exist");
    expect(column).toBeInstanceOf(NullColumn);
  });

  it("belongs to inferred foreign key from assoc name", () => {
    Company.belongsTo("foo");
    expect(Company.reflectOnAssociation("foo")!.foreignKey()).toBe("foo_id");
    Company.belongsTo("bar", { className: "Xyzzy" });
    expect(Company.reflectOnAssociation("bar")!.foreignKey()).toBe("bar_id");
    Company.belongsTo("baz", { className: "Xyzzy", foreignKey: "xyzzy_id" });
    expect(Company.reflectOnAssociation("baz")!.foreignKey()).toBe("xyzzy_id");
  });

  it("reflections should return keys as strings", () => {
    expect(
      Object.keys(Category.reflections()).every((k) => typeof k === "string"),
      "Model.reflections is expected to return string for keys",
    ).toBeTruthy();
  });

  it("type", () => {
    expect(reflectOnAssociation(CanonicalPost, "taggings")!.type).toBe("taggable_type");
    expect(reflectOnAssociation(CanonicalPost, "images")!.type).toBe("imageable_class");
    expect(reflectOnAssociation(CanonicalPost, "readers")!.type).toBeNull();
  });

  it("collection association", () => {
    expect(Pirate.reflectOnAssociation("birds")!.isCollection()).toBeTruthy();
    expect(Pirate.reflectOnAssociation("parrots")!.isCollection()).toBeTruthy();

    expect(Pirate.reflectOnAssociation("ship")!.isCollection()).toBeFalsy();
    expect(Ship.reflectOnAssociation("pirate")!.isCollection()).toBeFalsy();
  });

  it("foreign key", () => {
    expect(String(Author.reflectOnAssociation("posts")!.foreignKey())).toBe("author_id");
    expect(String(CanonicalPost.reflectOnAssociation("categorizations")!.foreignKey())).toBe(
      "category_id",
    );
    expect(String(FirstPost.reflectOnAssociation("commentWithInverse")!.foreignKey())).toBe(
      "comment_id",
    );
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
    expect(reflection!.foreignKey()).toBe("post_id");
  });

  it("reflection should not raise error when compared to other object", () => {
    expect(Firm._reflections["clients"]).not.toEqual(new Object());
  });

  it("reflect on missing source assocation", async () => {
    await assertNothingRaised(() => {
      expect(
        (CanonicalHotel.reflectOnAssociation("lostItems") as ThroughReflection).sourceReflection,
      ).toBeNull();
    });
  });

  it("active record primary key", () => {
    expect(String(Subscriber.reflectOnAssociation("subscriptions")!.activeRecordPrimaryKey)).toBe(
      "nick",
    );
    expect(String(Author.reflectOnAssociation("essay")!.activeRecordPrimaryKey)).toBe("name");
  });

  it("reflection klass not found with no class name option", async () => {
    const error = (await assertRaise([NameError], {}, () => {
      void UserWithInvalidRelation.reflectOnAssociation("notAClass")!.klass;
    })) as NameError;

    expect(error.constantName).toBe("NotAClass");
    expect(error.message).toMatch(/missing/i);
    expect(error.message).toMatch("NotAClass");
    expect(error.message).toMatch("UserWithInvalidRelation#notAClass");
    expect(error.message).toMatch(":class_name");
  });

  it("reflection klass not found with pointer to non existent class name", async () => {
    const error = (await assertRaise([NameError], {}, () => {
      void UserWithInvalidRelation.reflectOnAssociation("classNameProvidedNotAClass")!.klass;
    })) as NameError;

    expect(error.constantName).toBe("NotAClass");
    expect(error.message).toMatch(/missing/i);
    expect(error.message).toMatch(/\bNotAClass\b/);
    expect(error.message).toMatch("UserWithInvalidRelation#classNameProvidedNotAClass");
    expect(error.message).not.toMatch(":class_name");
  });

  it("reflection klass requires ar subclass", async () => {
    for (const rel of [
      "accountInvalid",
      "accountClassName",
      "infoInvalids",
      "infosClassName",
      "infosThroughClassName",
    ]) {
      const error = await assertRaise([ArgumentError], {}, () => {
        void UserWithInvalidRelation.reflectOnAssociation(rel)!.klass;
      });

      expect(error.message).toMatch("not an ActiveRecord::Base subclass");
      expect(error.message).toMatch(`UserWithInvalidRelation#${rel}`);
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
    const reflectionForAddress = new AggregateReflection(
      "address",
      null,
      {
        mapping: [
          ["address_street", "street"],
          ["address_city", "city"],
          ["address_country", "country"],
        ],
      },
      Customer,
    );

    const reflectionForBalance = new AggregateReflection(
      "balance",
      null,
      { className: "Money", mapping: ["balance", "amount"] },
      Customer,
    );

    const reflectionForGpsLocation = new AggregateReflection("gpsLocation", null, {}, Customer);

    assertIncludes(Customer.reflectOnAllAggregations(), reflectionForGpsLocation);
    assertIncludes(Customer.reflectOnAllAggregations(), reflectionForBalance);
    assertIncludes(Customer.reflectOnAllAggregations(), reflectionForAddress);

    expect(reflectionForAddress.equals(Customer.reflectOnAggregation("address"))).toBe(true);

    expect(Customer.reflectOnAggregation("address")!.klass).toBe(Address);

    expect(Customer.reflectOnAggregation("balance")!.klass).toBe(Money);
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

  it("association reflection in modules", () => {
    Base.storeFullStiClass = false;
    try {
      assertReflection(MyAppBusinessFirm, "clientsOfFirm", {
        klass: MyAppBusinessClient,
        className: "Client",
        tableName: "companies",
      });

      assertReflection(MyAppBillingAccount, "firm", {
        klass: MyAppBusinessFirm,
        className: "MyApplication::Business::Firm",
        tableName: "companies",
      });

      assertReflection(MyAppBillingAccount, "qualifiedBillingFirm", {
        klass: MyAppBillingFirm,
        className: "MyApplication::Billing::Firm",
        tableName: "companies",
      });

      assertReflection(MyAppBillingAccount, "unqualifiedBillingFirm", {
        klass: MyAppBillingFirm,
        className: "Firm",
        tableName: "companies",
      });

      assertReflection(MyAppBillingAccount, "nestedQualifiedBillingFirm", {
        klass: MyAppBillingNestedFirm,
        className: "MyApplication::Billing::Nested::Firm",
        tableName: "companies",
      });

      assertReflection(MyAppBillingAccount, "nestedUnqualifiedBillingFirm", {
        klass: MyAppBillingNestedFirm,
        className: "Nested::Firm",
        tableName: "companies",
      });
    } finally {
      Base.storeFullStiClass = true;
    }
  });

  it("chain", () => {
    const expected = [
      Organization.reflectOnAssociation("authorEssayCategories"),
      Author.reflectOnAssociation("essays"),
      Organization.reflectOnAssociation("authors"),
    ];
    const actual = Organization.reflectOnAssociation("authorEssayCategories")!.chain;

    expect(actual).toEqual(expected);
  });

  it("nested?", () => {
    expect(Author.reflectOnAssociation("comments")!.isNested()).toBeFalsy();
    expect(Author.reflectOnAssociation("tags")!.isNested()).toBeTruthy();

    expect(Category.reflectOnAssociation("postComments")!.isNested()).toBeTruthy();
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
    const hotel = await CanonicalHotel.create();
    const department = await hotel.departments.create();
    await department.chefs.create();

    await assertNothingRaised(async () => {
      expect(
        (await (await CanonicalHotel.includes([{ departments: "chefs" }]).first())!.chefs).map(
          (r) => r.id,
        ),
      ).toEqual((await department.chefs).map((r) => r.id));
    });
  });

  it("association primary key uses explicit primary key option as first priority", () => {
    const actual = ShardedComment.reflectOnAssociation("blogPostById")!.associationPrimaryKey();
    expect(actual).toBe("id");
  });

  it("belongs to reflection with query constraints infers correct foreign key", () => {
    const blogForeignKey = ShardedComment.reflectOnAssociation("blog")!.foreignKey();
    const blogPostForeignKey = ShardedComment.reflectOnAssociation("blogPost")!.foreignKey();

    expect(blogForeignKey).toBe("blog_id");
    expect(blogPostForeignKey).toEqual(["blog_id", "blog_post_id"]);
  });

  function assertReflection(
    klass: typeof Base,
    association: string,
    options: Partial<Record<keyof AssociationReflection, unknown>>,
  ) {
    const reflection = klass.reflectOnAssociation(association);
    assert(reflection);
    for (const [method, value] of Object.entries(options)) {
      expect(Reflect.get(reflection!, method)).toEqual(value);
    }
  }
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
