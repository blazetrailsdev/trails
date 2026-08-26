/**
 * Trails-specific invariants split out of base.test.ts (RFC 0043).
 *
 * These guard trails-internal behavior with no Rails counterpart in
 * base_test.rb: the _applyScopeAttributes
 * scoping mechanism and the UnknownPrimaryKey error message.
 */
import { describe, it, expect } from "vitest";
import { Base, SubclassNotFound, UnknownPrimaryKey, registerModel } from "./index.js";
import { registerSubclass } from "./inheritance.js";
import { Type } from "@blazetrails/activemodel";
import { fixtures } from "./test-fixtures.js";
import { loadSchema } from "./model-schema.js";
import { Firm } from "./test-helpers/models/company.js";

describe("_applyScopeAttributes — scoping initializeInternalsCallback", () => {
  function makeModel() {
    class User extends Base {
      static {
        this._tableName = "users";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("status", "string");
      }
    }
    return User;
  }

  it("applies current-scope attributes to new instances", async () => {
    const User = makeModel();
    const rel = User.where({ role: "admin" });
    await User.scoping(rel, async () => {
      const u = new User({});
      expect(u.readAttribute("role")).toBe("admin");
    });
  });

  it("explicit constructor attrs take precedence over scope attrs", async () => {
    const User = makeModel();
    const rel = User.where({ role: "admin" });
    await User.scoping(rel, async () => {
      const u = new User({ role: "guest" });
      expect(u.readAttribute("role")).toBe("guest");
    });
  });

  it("scope attrs fill in keys not provided explicitly", async () => {
    const User = makeModel();
    const rel = User.where({ role: "admin", status: "active" });
    await User.scoping(rel, async () => {
      const u = new User({ role: "guest" }); // only role is explicit
      expect(u.readAttribute("role")).toBe("guest"); // explicit wins
      expect(u.readAttribute("status")).toBe("active"); // scope fills in
    });
  });

  it("no scope → no change to constructor attrs", async () => {
    const User = makeModel();
    const u = new User({ role: "user" });
    expect(u.readAttribute("role")).toBe("user");
  });
});

describe("_applyScopeAttributes — multiparameter path", () => {
  it("scope attrs applied in multiparameter constructor path", async () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("starts_on", "date");
      }
    }
    const rel = Event.where({ role: "organizer" });
    await Event.scoping(rel, async () => {
      // Use multiparameter date keys — triggers the multiparameter constructor path
      const e = new Event({ "starts_on(1i)": "2024", "starts_on(2i)": "6", "starts_on(3i)": "15" });
      // Scope attr should be applied (role was not in the explicit multiparams)
      expect(e.readAttribute("role")).toBe("organizer");
    });
  });

  it("explicit multiparameter attrs take precedence over scope attrs with same key", async () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("starts_on", "date");
      }
    }
    const rel = Event.where({ role: "organizer" });
    await Event.scoping(rel, async () => {
      // role is provided explicitly (non-multiparameter key alongside multiparameter keys)
      const e = new Event({
        "starts_on(1i)": "2024",
        "starts_on(2i)": "6",
        "starts_on(3i)": "15",
        role: "guest",
      });
      expect(e.readAttribute("role")).toBe("guest"); // explicit wins
    });
  });

  it("explicit multiparameter attrs take precedence over a scope attr on the same column", async () => {
    class Event extends Base {
      static {
        this._tableName = "events";
        this.attribute("id", "integer");
        this.attribute("role", "string");
        this.attribute("starts_on", "date");
      }
    }
    const rel = Event.where({ starts_on: "2020-01-01" });
    await Event.scoping(rel, async () => {
      // The scope names the same column the multiparameter trio assigns, so the
      // explicit-key set has to carry `starts_on`, not `starts_on(1i)`.
      const e = new Event({
        "starts_on(1i)": "2024",
        "starts_on(2i)": "6",
        "starts_on(3i)": "15",
      });
      expect(String(e.readAttribute("starts_on"))).toContain("2024");
    });
  });
});

describe("_applyScopeAttributes — a scope that sets type wins over the STI default", () => {
  // The scope source is not special: ClassMethods#new feeds scope attributes to
  // the same subclass_from_attributes as the explicit ones (inheritance.rb:56-78),
  // and find_sti_class raises unless the resolved constant is self or in
  // descendants (:242-265). An STI ancestor is neither, so the type never
  // reaches the column — this test used to assert the port's build-as-is escape.
  // The class names are unique to this file because the assertion turns on which
  // class the global model registry resolves the stored type to.
  it("scope that sets type overwrites the STI type column", async () => {
    class ScopeStiVehicle extends Base {
      static {
        this._tableName = "vehicles";
        this.attribute("id", "integer");
        this.attribute("type", "string");
      }
    }
    ScopeStiVehicle.inheritanceColumn = "type";
    class ScopeStiCar extends ScopeStiVehicle {}
    registerModel(ScopeStiVehicle);
    registerSubclass(ScopeStiCar);

    const rel = ScopeStiVehicle.where({ type: "ScopeStiVehicle" });
    await ScopeStiVehicle.scoping(rel, async () => {
      expect(() => new ScopeStiCar({})).toThrow(
        new SubclassNotFound(
          "Invalid single-table inheritance type: ScopeStiVehicle is not a subclass of ScopeStiCar",
        ),
      );
    });
  });
});

describe("Base.relation with a cleared inheritance column (trails)", () => {
  fixtures(["companies"]);

  it("skips the type condition when the inheritance column is gone", async () => {
    await Firm.loadSchema();
    expect(Firm.isFinderNeedsTypeCondition()).toBe(true);

    const previous = Firm.inheritanceColumn;
    Firm.inheritanceColumn = null;
    try {
      expect(() => (Firm as unknown as { relation(): unknown }).relation()).not.toThrow();
    } finally {
      Firm.inheritanceColumn = previous;
    }
  });
});

describe("UnknownPrimaryKeyTest", () => {
  it("no-arg constructor produces generic message", () => {
    const err = new UnknownPrimaryKey();
    expect(err.message).toBe("Unknown primary key.");
    expect(err.model).toBeNull();
  });

  it("description is separated by newline+space", () => {
    class Dummy extends Base {}
    const err = new UnknownPrimaryKey(Dummy, "No PK configured.");
    expect(err.message).toBe(
      "Unknown primary key for table dummies in model Dummy.\nNo PK configured.",
    );
    expect(err.model).toBe(Dummy);
  });
});

describe("instantiate override types for absent keys (trails)", () => {
  fixtures([]);

  class Typecast extends Type {
    readonly name = "typecast";
    cast() {
      return "t.lo";
    }
  }

  interface AttrProbe {
    _attributes: {
      getAttribute(name: string): { isInitialized(): boolean; type: unknown };
      isKey(name: string): boolean;
      keys(): string[];
    };
  }
  const seedAttrs = async (): Promise<Record<string, unknown>> => {
    class Topic extends Base {}
    const seed = await Topic.create({ title: "The First Topic" } as Partial<Topic>);
    const attrs = {
      ...(seed as unknown as AttrProbe & { attributes: Record<string, unknown> }).attributes,
    };
    delete attrs.id;
    return attrs;
  };

  // builder.rb's `elsif types.key?(name)` / `else Attribute.uninitialized(name,
  // type)` branch: a schema column absent from the values hash with no default
  // (every non-PK column, since attributes_builder passes
  // `_default_attributes.except(column_names - [primary_key])`) is materialized
  // uninitialized, and `type = additional_types.fetch(name, types[name])`, so a
  // per-query override wins over the declared schema type.
  it("materializes an override type for a schema column absent from the projected row", async () => {
    class Topic extends Base {}
    const attrs = await seedAttrs();
    delete attrs.author_name;

    const topic = Topic.instantiate(attrs, {
      author_name: new Typecast(),
    }) as unknown as AttrProbe;
    const attr = topic._attributes.getAttribute("author_name");
    expect(attr.isInitialized()).toBe(false);
    expect(attr.type).toBeInstanceOf(Typecast);
  });

  // builder.rb only materializes `values.each_key` and `types.each_key`;
  // `additional_types` is consulted only for names already sourced from values
  // or schema `types`. An override-only key that is neither in the row nor a
  // schema column is therefore never materialized (its `default_attribute`
  // falls to the `else Attribute.null` branch) — it must not appear in the set.
  it("does not materialize an override-only key absent from the row and schema", async () => {
    class Topic extends Base {}
    const attrs = await seedAttrs();

    const topic = Topic.instantiate(attrs, {
      computed_col: new Typecast(),
    }) as unknown as AttrProbe;
    expect(topic._attributes.isKey("computed_col")).toBe(false);
    expect(topic._attributes.keys()).not.toContain("computed_col");
  });
});

describe("BasicsTest (trails)", () => {
  fixtures(["posts"]);

  it("columnNames raises TableNotSpecified on an abstract class", () => {
    // Rails column_names has no abstract-class fallback — load_schema! raises
    // TableNotSpecified. Guards against reintroducing the attribute-walk branch.
    class AbstractIntrospected extends Base {
      static {
        this.abstractClass = true;
        this.attribute("name", "string");
      }
    }
    expect(() => AbstractIntrospected.columnNames()).toThrow(
      "AbstractIntrospected has no table configured",
    );
  });

  it("an abstract subclass of a concrete model reflects the inherited table", async () => {
    // `reset_table_name`'s `abstract_class?` arm is `superclass.table_name`
    // (model_schema.rb:293-294), and `load_schema!` raises only `unless
    // table_name` (model_schema.rb:587-590) — so `AbstractStiPost < Post`
    // (test/models/post.rb:232-234) reflects `posts`, type column included.
    const { AbstractStiPost } = await import("./test-helpers/models/post.js");
    expect(AbstractStiPost.tableName).toBe("posts");
    await AbstractStiPost.loadSchema();
    expect(Object.keys(AbstractStiPost.columnsHash())).toContain("type");
  });
});

describe("attribute_names table_exists? guard (trails)", () => {
  fixtures([]);

  it("attributeNames is [] for a declared attribute once the cache resolves the table absent", async () => {
    class DeclaredNonExistent extends Base {
      static tableName = "non_existent_tables";
      static {
        this.attribute("name", "string");
      }
    }
    // Populate the schema cache's dataSourceExists=false entry — the sync
    // stand-in for Rails' table_exists? DB hit (attribute_methods.rb:236-241).
    expect(await DeclaredNonExistent.tableExists()).toBe(false);
    expect(DeclaredNonExistent.attributeNames()).toEqual([]);
  });
});

// Rails removes ignored columns only from schema/default `attribute_types`
// (`columns_hash.except(*ignored_columns)`), NOT from a raw result row: a
// `SELECT *` that projects an ignored column still lands it in `@attributes`
// (LazyAttributeSet keys off `values`), so `read_attribute` returns it and
// `method_missing` responds to the accessor (`@attributes.key?` → true).
// A load that does not project the column leaves its slot uninitialized, so
// `key?` is false. These guard the trails analogs (dynamic reader install +
// narrow-to-uninitialized) against regressing to a schema-membership gate.
describe("ignored columns follow Rails' value-keyed attribute set (trails)", () => {
  fixtures([]);

  // `ignored_columns=` (model_schema.rb:366-369) calls only
  // `reload_schema_from_cache` (:553-571), which nils the memos and clears
  // `@schema_loaded`. It never calls `undefine_attribute_methods` — only
  // `reset_column_information` (:523-530) does — so an accessor generated
  // BEFORE the ignore survives it in Ruby. Rails' own coverage matches: the
  // methods assertions (base_test.rb:1796-1806) use models that ignore in the
  // class body, and the post-generation assignment (base_test.rb:1844-1846)
  // asserts `column_names` only.
  it("assigning ignoredColumns after generation leaves the generated accessor live", async () => {
    class Developer extends Base {
      static tableName = "developers";
    }
    expect(Developer.columnNames()).toContain("first_name");

    Developer.ignoredColumns = ["first_name"];

    expect(Developer.columnNames()).not.toContain("first_name");
    expect("first_name" in Developer.prototype).toBe(true);
  });

  it("a plain ignored column projected by a raw SELECT * is readable and responds", async () => {
    class Topic extends Base {
      static tableName = "topics";
      static {
        this.ignoredColumns = ["author_name"];
      }
    }
    await Base.connection.execute("INSERT INTO topics (title, author_name) VALUES ('hi', 'bob')");
    const [topic] = await Topic.findBySql("SELECT * FROM topics");
    // Rails: values-keyed @attributes ⇒ read_attribute returns it, and
    // method_missing responds (the trails dynamic reader).
    expect(
      (topic as unknown as { readAttribute(n: string): unknown }).readAttribute("author_name"),
    ).toBe("bob");
    expect((topic as unknown as Record<string, unknown>).author_name).toBe("bob");
    expect("author_name" in topic).toBe(true);
  });

  it("an ignored column not projected by the query leaves an uninitialized slot", async () => {
    class Topic extends Base {
      static tableName = "topics";
      static {
        this.ignoredColumns = ["author_name"];
      }
    }
    await Base.connection.execute("INSERT INTO topics (title, author_name) VALUES ('hi', 'bob')");
    // The default select drops ignored columns, so the row never carries it —
    // Rails' key? is false and no accessor responds.
    const topic = (await Topic.first())!;
    expect("author_name" in topic).toBe(false);
    expect([
      ...(topic as unknown as { _attributes: { keys(): Iterable<string> } })._attributes.keys(),
    ]).not.toContain("author_name");
  });

  it("an STI subclass's own ignoredColumns does not read the base's columns memo", () => {
    class Company extends Base {
      static override tableName = "companies";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Firm extends Company {
      static {
        this.ignoredColumns = ["rating"];
      }
    }
    expect(Company.columns().map((c: { name: string }) => c.name)).toContain("rating");
    expect(Firm.columns().map((c: { name: string }) => c.name)).not.toContain("rating");
    expect(Firm.columnNames()).not.toContain("rating");
    expect(Company.columns().map((c: { name: string }) => c.name)).toContain("rating");
  });

  it("an STI subclass's own ignoredColumns memoizes per class and reloads with the base", async () => {
    class Company extends Base {
      static override tableName = "companies";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Firm extends Company {
      static {
        registerSubclass(this);
        this.ignoredColumns = ["rating"];
      }
    }
    const first = Firm.columnsHash();
    expect(Firm.columnsHash()).toBe(first);
    expect(Firm.columns()).toBe(Firm.columns());
    expect(Company.columnsHash()).not.toBe(first);

    void Company.resetColumnInformation();
    await Company.loadSchema();
    const afterReset = Firm.columnsHash();
    expect(afterReset).not.toBe(first);
    expect(Object.keys(afterReset)).not.toContain("rating");
    expect(Firm.columns().map((c: { name: string }) => c.name)).not.toContain("rating");
    expect(Company.columnNames()).toContain("rating");
  });

  it("a subclass that ignores every column memoizes and serves an empty columns list", () => {
    class Company extends Base {
      static override tableName = "companies";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Firm extends Company {
      static {
        this.ignoredColumns = Company.columnNames();
      }
    }
    const cols = Firm.columns();
    expect(cols).toEqual([]);
    expect(Firm.columns()).toBe(cols);
  });

  it("an STI subclass's own columns memo is rebuilt when the base re-reflects", async () => {
    class Company extends Base {
      static override tableName = "companies";
      static {
        this.inheritanceColumn = "type";
      }
    }
    class Firm extends Company {
      static {
        registerSubclass(this);
        this.ignoredColumns = ["rating"];
      }
    }
    (loadSchema as (this: unknown) => void).call(Company);
    const first = Firm.columnsHash();
    expect(Firm.columnsHash()).toBe(first);

    const cache = Company.connection.internalSchemaCache as unknown as {
      clearDataSourceCacheBang(conn: unknown, name: string): void;
      getCachedColumnsHash(name: string): unknown;
    };
    cache.clearDataSourceCacheBang(null, "companies");
    expect(cache.getCachedColumnsHash("companies")).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(Company, "_schemaLoaded")).toBe(true);

    // The async load re-warms the cleared cache; before re-reflecting it drops
    // the stale view the way Rails nils its schema ivars — recursively, so the
    // subclass memo below goes with it (model_schema.rb:553-568).
    await Company.loadSchema();

    expect(Company.columnNames()).toContain("rating");

    const rebuilt = Firm.columnsHash();
    expect(rebuilt).not.toBe(first);
    expect(Object.keys(rebuilt)).not.toContain("rating");
    expect(Object.keys(Company.columnsHash())).toContain("rating");
  });

  it("an ignored column still declared via attribute() casts and responds on SELECT *", async () => {
    const { AttributedDeveloper } = await import("./test-helpers/models/developer.js");
    const dev = await AttributedDeveloper.create();
    await dev.updateColumn("name", "name");
    const loaded = await AttributedDeveloper.where({ id: dev.id }).select("*").first();
    // Rails asserts `loaded.name == "Developer: name"` (base_test.rb): the
    // projected value casts through DeveloperName and the accessor responds.
    expect((loaded as unknown as Record<string, unknown>).name).toBe("Developer: name");
    expect((loaded as unknown as { readAttribute(n: string): unknown }).readAttribute("name")).toBe(
      "Developer: name",
    );
  });

  it("a declared-then-ignored column not projected keeps its declared slot after reload", async () => {
    const { AttributedDeveloper } = await import("./test-helpers/models/developer.js");
    const dev = await AttributedDeveloper.create();
    await dev.updateColumn("name", "name");
    await dev.reload();
    // A declared attribute IS in `types`, so an unprojected slot takes
    // `default_attribute`'s `types.key?` arm, which ASSIGNS `@attributes[name]`
    // (attribute_set/builder.rb:82-87) — the `else` arm's `Attribute.null` is
    // returned but never assigned, which is why only a plain ignored column
    // (the case above) drops out of the set.
    expect("name" in dev).toBe(true);
  });
});
