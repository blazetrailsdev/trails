import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, beforeAll, expect } from "vitest";
import { Base, registerModel } from "../index.js";
import { defineSchema } from "../test-helpers/define-schema.js";
import { setupHandlerSuite } from "../test-helpers/setup-handler-suite.js";
import { useHandlerTransactionalFixtures } from "../test-helpers/use-handler-transactional-fixtures.js";

describe("EagerSingularizationTest", () => {
  setupHandlerSuite();
  useHandlerTransactionalFixtures();

  beforeAll(async () => {
    // These tables are deliberately irregular plurals (viri/octopi/messes/
    // crises/…) to exercise singularization edge cases; they are test-local by
    // design and have no canonical-schema counterpart.
    /* eslint-disable blazetrails/require-canonical-schema */
    await defineSchema({
      viri: { octopus_id: "integer", species: "string" },
      octopi: { species: "string" },
      passes: { bus_id: "integer", rides: "integer" },
      buses: { name: "string" },
      crises_messes: {
        columns: { crisis_id: "integer", mess_id: "integer" },
        primaryKey: false,
      },
      messes: { name: "string" },
      crises: { name: "string" },
      successes: { name: "string" },
      analyses: { crisis_id: "integer", success_id: "integer" },
      dresses: { crisis_id: "integer" },
      compresses: { dress_id: "integer" },
    });
    /* eslint-enable blazetrails/require-canonical-schema */
  });

  function makeModels() {
    class Virus extends Base {
      declare octopus_id: number | null;
      declare species: string | null;
      declare octopus: Octopus | null;
      declare loadBelongsTo: (name: "octopus") => Promise<Octopus | null>;

      static {
        this._tableName = "viri";
        this.attribute("octopus_id", "integer");
        this.attribute("species", "string");
        this.belongsTo("octopus", {
          className: "EsOctopus",
          foreignKey: "octopus_id",
        });
      }
    }
    class Octopus extends Base {
      declare species: string | null;
      declare virus: Virus | null;
      declare loadHasOne: (name: "virus") => Promise<Virus | null>;

      static {
        this._tableName = "octopi";
        this.attribute("species", "string");
        this.hasOne("virus", {
          className: "EsVirus",
          foreignKey: "octopus_id",
        });
      }
    }
    class Pass extends Base {
      declare bus_id: number | null;
      declare rides: number | null;
      declare bus: Bus | null;
      declare loadBelongsTo: (name: "bus") => Promise<Bus | null>;

      static {
        this._tableName = "passes";
        this.attribute("bus_id", "integer");
        this.attribute("rides", "integer");
        this.belongsTo("bus", {
          className: "EsBus",
          foreignKey: "bus_id",
        });
      }
    }
    class Bus extends Base {
      declare name: string | null;
      declare passes: AssociationProxy<Pass>;

      static {
        this._tableName = "buses";
        this.attribute("name", "string");
        this.hasMany("passes", {
          className: "EsPass",
          foreignKey: "bus_id",
        });
      }
    }
    class Mess extends Base {
      declare name: string | null;
      declare crises: AssociationProxy<Crisis>;

      static {
        this._tableName = "messes";
        this.attribute("name", "string");
        this.hasAndBelongsToMany("crises", {
          className: "EsCrisis",
          joinTable: "crises_messes",
          foreignKey: "mess_id",
          associationForeignKey: "crisis_id",
        });
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
        this._tableName = "crises";
        this.attribute("name", "string");
        this.hasAndBelongsToMany("messes", {
          className: "EsMess",
          joinTable: "crises_messes",
          foreignKey: "crisis_id",
          associationForeignKey: "mess_id",
        });
        this.hasMany("analyses", {
          className: "EsAnalysis",
          foreignKey: "crisis_id",
          dependent: "destroy",
        });
        this.hasMany("successes", {
          className: "EsSuccess",
          through: "analyses",
          source: "success",
        });
        this.hasMany("dresses", {
          className: "EsDress",
          foreignKey: "crisis_id",
          dependent: "destroy",
        });
        this.hasMany("compresses", {
          className: "EsCompress",
          through: "dresses",
          source: "compresses",
        });
      }
    }
    class Success extends Base {
      declare name: string | null;
      declare analyses: AssociationProxy<Analysis>;
      declare crises: AssociationProxy<Crisis>;

      static {
        this._tableName = "successes";
        this.attribute("name", "string");
        this.hasMany("analyses", {
          className: "EsAnalysis",
          foreignKey: "success_id",
          dependent: "destroy",
        });
        this.hasMany("crises", {
          className: "EsCrisis",
          through: "analyses",
          source: "crisis",
        });
      }
    }
    class Analysis extends Base {
      declare crisis_id: number | null;
      declare success_id: number | null;
      declare crisis: Crisis | null;
      declare success: Success | null;
      declare loadBelongsTo: ((name: "crisis") => Promise<Crisis | null>) &
        ((name: "success") => Promise<Success | null>);

      static {
        this._tableName = "analyses";
        this.attribute("crisis_id", "integer");
        this.attribute("success_id", "integer");
        this.belongsTo("crisis", {
          className: "EsCrisis",
          foreignKey: "crisis_id",
        });
        this.belongsTo("success", {
          className: "EsSuccess",
          foreignKey: "success_id",
        });
      }
    }
    class Dress extends Base {
      declare crisis_id: number | null;
      declare crisis: Crisis | null;
      declare compresses: AssociationProxy<Compress>;
      declare loadBelongsTo: (name: "crisis") => Promise<Crisis | null>;

      static {
        this._tableName = "dresses";
        this.attribute("crisis_id", "integer");
        this.belongsTo("crisis", {
          className: "EsCrisis",
          foreignKey: "crisis_id",
        });
        this.hasMany("compresses", {
          className: "EsCompress",
          foreignKey: "dress_id",
        });
      }
    }
    class Compress extends Base {
      declare dress_id: number | null;
      declare dress: Dress | null;
      declare loadBelongsTo: (name: "dress") => Promise<Dress | null>;

      static {
        this._tableName = "compresses";
        this.attribute("dress_id", "integer");
        this.belongsTo("dress", {
          className: "EsDress",
          foreignKey: "dress_id",
        });
      }
    }

    registerModel("EsVirus", Virus);
    registerModel("EsOctopus", Octopus);
    registerModel("EsPass", Pass);
    registerModel("EsBus", Bus);
    registerModel("EsMess", Mess);
    registerModel("EsCrisis", Crisis);
    registerModel("EsSuccess", Success);
    registerModel("EsAnalysis", Analysis);
    registerModel("EsDress", Dress);
    registerModel("EsCompress", Compress);

    return { Virus, Octopus, Pass, Bus, Mess, Crisis, Success };
  }

  it("eager no extra singularization belongs to", async () => {
    const { Virus } = makeModels();
    await expect(Virus.all().includes("octopus").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has one", async () => {
    const { Octopus } = makeModels();
    await expect(Octopus.all().includes("virus").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has many", async () => {
    const { Bus } = makeModels();
    await expect(Bus.all().includes("passes").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has and belongs to many", async () => {
    const { Crisis, Mess } = makeModels();
    await expect(Crisis.all().includes("messes").toArray()).resolves.toBeDefined();
    await expect(Mess.all().includes("crises").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has many through belongs to", async () => {
    const { Crisis } = makeModels();
    await expect(Crisis.all().includes("successes").toArray()).resolves.toBeDefined();
  });

  it("eager no extra singularization has many through has many", async () => {
    const { Crisis } = makeModels();
    await expect(Crisis.all().includes("compresses").toArray()).resolves.toBeDefined();
  });
});
