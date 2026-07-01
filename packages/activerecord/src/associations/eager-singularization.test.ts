/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 *
 * Mirrors associations/eager_singularization_test.rb. The tables under test
 * (viri/octopi/passes/buses/crises_messes/messes/crises/successes/analyses/
 * dresses/compresses) are deliberately irregular plurals with no schema.rb
 * analog; Rails creates them dynamically in setup and drops them in teardown.
 * We mirror that with MigrationContext createTable/dropTable — the model table
 * names derive from the inflector exactly as in Rails (no _tableName hacks).
 */
import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { Base, registerModel } from "../index.js";
import { MigrationContext } from "../migration.js";
import { setupFixtures } from "../test-helpers/fixtures.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("EagerSingularizationTest", () => {
  setupFixtures();
  useHandlerTransactionalFixtures();

  let ctx: MigrationContext;

  beforeAll(async () => {
    ctx = new MigrationContext(Base.connection);
    await ctx.createTable("viri", { force: true }, (t) => {
      t.integer("octopus_id");
      t.string("species");
    });
    await ctx.createTable("octopi", { force: true }, (t) => {
      t.string("species");
    });
    await ctx.createTable("passes", { force: true }, (t) => {
      t.integer("bus_id");
      t.integer("rides");
    });
    await ctx.createTable("buses", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("crises_messes", { id: false, force: true }, (t) => {
      t.integer("crisis_id");
      t.integer("mess_id");
    });
    await ctx.createTable("messes", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("crises", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("successes", { force: true }, (t) => {
      t.string("name");
    });
    await ctx.createTable("analyses", { force: true }, (t) => {
      t.integer("crisis_id");
      t.integer("success_id");
    });
    await ctx.createTable("dresses", { force: true }, (t) => {
      t.integer("crisis_id");
    });
    await ctx.createTable("compresses", { force: true }, (t) => {
      t.integer("dress_id");
    });
  });

  afterAll(async () => {
    await ctx.dropTable(
      "viri",
      "octopi",
      "passes",
      "buses",
      "crises_messes",
      "messes",
      "crises",
      "successes",
      "analyses",
      "dresses",
      "compresses",
      { ifExists: true },
    );
  });

  class Virus extends Base {
    declare octopus_id: number | null;
    declare species: string | null;
    declare octopus: Octopus | null;

    static {
      this.attribute("octopus_id", "integer");
      this.attribute("species", "string");
      this.belongsTo("octopus");
    }
  }
  class Octopus extends Base {
    declare species: string | null;
    declare virus: Virus | null;

    static {
      this.attribute("species", "string");
      this.hasOne("virus");
    }
  }
  class Pass extends Base {
    declare bus_id: number | null;
    declare rides: number | null;
    declare bus: Bus | null;

    static {
      this.attribute("bus_id", "integer");
      this.attribute("rides", "integer");
      this.belongsTo("bus");
    }
  }
  class Bus extends Base {
    declare name: string | null;
    declare passes: AssociationProxy<Pass>;

    static {
      this.attribute("name", "string");
      this.hasMany("passes");
    }
  }
  class Mess extends Base {
    declare name: string | null;
    declare crises: AssociationProxy<Crisis>;

    static {
      this.attribute("name", "string");
      this.hasAndBelongsToMany("crises");
    }
  }
  class Crisis extends Base {
    declare name: string | null;
    declare messes: AssociationProxy<Mess>;
    declare analyses: AssociationProxy<Analysis>;
    declare successes: AssociationProxy<Success>;
    declare dresses: AssociationProxy<Dress>;
    declare compresses: AssociationProxy<Compress>;

    static {
      this.attribute("name", "string");
      this.hasAndBelongsToMany("messes");
      this.hasMany("analyses", { dependent: "destroy" });
      this.hasMany("successes", { through: "analyses" });
      this.hasMany("dresses", { dependent: "destroy" });
      this.hasMany("compresses", { through: "dresses" });
    }
  }
  class Analysis extends Base {
    declare crisis_id: number | null;
    declare success_id: number | null;
    declare crisis: Crisis | null;
    declare success: Success | null;

    static {
      this.attribute("crisis_id", "integer");
      this.attribute("success_id", "integer");
      this.belongsTo("crisis");
      this.belongsTo("success");
    }
  }
  class Success extends Base {
    declare name: string | null;
    declare analyses: AssociationProxy<Analysis>;
    declare crises: AssociationProxy<Crisis>;

    static {
      this.attribute("name", "string");
      this.hasMany("analyses", { dependent: "destroy" });
      this.hasMany("crises", { through: "analyses" });
    }
  }
  class Dress extends Base {
    declare crisis_id: number | null;
    declare crisis: Crisis | null;
    declare compresses: AssociationProxy<Compress>;

    static {
      this.attribute("crisis_id", "integer");
      this.belongsTo("crisis");
      this.hasMany("compresses");
    }
  }
  class Compress extends Base {
    declare dress_id: number | null;
    declare dress: Dress | null;

    static {
      this.attribute("dress_id", "integer");
      this.belongsTo("dress");
    }
  }

  registerModel("Virus", Virus);
  registerModel("Octopus", Octopus);
  registerModel("Pass", Pass);
  registerModel("Bus", Bus);
  registerModel("Mess", Mess);
  registerModel("Crisis", Crisis);
  registerModel("Success", Success);
  registerModel("Analysis", Analysis);
  registerModel("Dress", Dress);
  registerModel("Compress", Compress);

  it("eager no extra singularization belongs to", async () => {
    await expect(Virus.all().includes("octopus").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has one", async () => {
    await expect(Octopus.all().includes("virus").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has many", async () => {
    await expect(Bus.all().includes("passes").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has and belongs to many", async () => {
    await expect(Crisis.all().includes("messes").toArray()).resolves.toBeDefined();
    await expect(Mess.all().includes("crises").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has many through belongs to", async () => {
    await expect(Crisis.all().includes("successes").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has many through has many", async () => {
    await expect(Crisis.all().includes("compresses").toArray()).resolves.toBeDefined();
  });
});
