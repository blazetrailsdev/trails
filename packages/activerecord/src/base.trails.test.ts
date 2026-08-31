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
      const u = new User({ role: "guest" });
      expect(u.readAttribute("role")).toBe("guest");
      expect(u.readAttribute("status")).toBe("active");
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
      const e = new Event({ "starts_on(1i)": "2024", "starts_on(2i)": "6", "starts_on(3i)": "15" });
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
      const e = new Event({
        "starts_on(1i)": "2024",
        "starts_on(2i)": "6",
        "starts_on(3i)": "15",
        role: "guest",
      });
      expect(e.readAttribute("role")).toBe("guest");
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
    expect(await DeclaredNonExistent.tableExists()).toBe(false);
    expect(DeclaredNonExistent.attributeNames()).toEqual([]);
  });
});

describe("ignored columns follow Rails' value-keyed attribute set (trails)", () => {
  fixtures([]);

  it("assigning ignoredColumns after generation leaves the generated accessor live", async () => {
    class Developer extends Base {
      static tableName = "developers";
    }
    expect(Developer.columnNames()).toContain("first_name");
    Developer.defineAttributeMethods();

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

    expect(Object.prototype.hasOwnProperty.call(Company, "_schemaLoaded")).toBe(true);

    await Company.resetColumnInformation();
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
    expect("name" in dev).toBe(true);
  });
});
