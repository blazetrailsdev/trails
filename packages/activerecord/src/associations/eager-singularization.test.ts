import { describe, it, beforeAll, expect } from "vitest";
import { Base, registerModel } from "../index.js";
import { Associations } from "../associations.js";
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
      static {
        this._tableName = "viri";
        this.attribute("octopus_id", "integer");
        this.attribute("species", "string");
      }
    }
    class Octopus extends Base {
      static {
        this._tableName = "octopi";
        this.attribute("species", "string");
      }
    }
    class Pass extends Base {
      static {
        this._tableName = "passes";
        this.attribute("bus_id", "integer");
        this.attribute("rides", "integer");
      }
    }
    class Bus extends Base {
      static {
        this._tableName = "buses";
        this.attribute("name", "string");
      }
    }
    class Mess extends Base {
      static {
        this._tableName = "messes";
        this.attribute("name", "string");
      }
    }
    class Crisis extends Base {
      static {
        this._tableName = "crises";
        this.attribute("name", "string");
      }
    }
    class Success extends Base {
      static {
        this._tableName = "successes";
        this.attribute("name", "string");
      }
    }
    class Analysis extends Base {
      static {
        this._tableName = "analyses";
        this.attribute("crisis_id", "integer");
        this.attribute("success_id", "integer");
      }
    }
    class Dress extends Base {
      static {
        this._tableName = "dresses";
        this.attribute("crisis_id", "integer");
      }
    }
    class Compress extends Base {
      static {
        this._tableName = "compresses";
        this.attribute("dress_id", "integer");
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

    Associations.belongsTo.call(Virus, "octopus", {
      className: "EsOctopus",
      foreignKey: "octopus_id",
    });
    Associations.hasOne.call(Octopus, "virus", {
      className: "EsVirus",
      foreignKey: "octopus_id",
    });
    Associations.belongsTo.call(Pass, "bus", {
      className: "EsBus",
      foreignKey: "bus_id",
    });
    Associations.hasMany.call(Bus, "passes", {
      className: "EsPass",
      foreignKey: "bus_id",
    });
    Associations.hasAndBelongsToMany.call(Mess, "crises", {
      className: "EsCrisis",
      joinTable: "crises_messes",
      foreignKey: "mess_id",
      associationForeignKey: "crisis_id",
    });
    Associations.hasAndBelongsToMany.call(Crisis, "messes", {
      className: "EsMess",
      joinTable: "crises_messes",
      foreignKey: "crisis_id",
      associationForeignKey: "mess_id",
    });
    Associations.hasMany.call(Crisis, "analyses", {
      className: "EsAnalysis",
      foreignKey: "crisis_id",
      dependent: "destroy",
    });
    Associations.hasMany.call(Crisis, "successes", {
      className: "EsSuccess",
      through: "analyses",
      source: "success",
    });
    Associations.hasMany.call(Crisis, "dresses", {
      className: "EsDress",
      foreignKey: "crisis_id",
      dependent: "destroy",
    });
    Associations.hasMany.call(Crisis, "compresses", {
      className: "EsCompress",
      through: "dresses",
      source: "compresses",
    });
    Associations.belongsTo.call(Analysis, "crisis", {
      className: "EsCrisis",
      foreignKey: "crisis_id",
    });
    Associations.belongsTo.call(Analysis, "success", {
      className: "EsSuccess",
      foreignKey: "success_id",
    });
    Associations.hasMany.call(Success, "analyses", {
      className: "EsAnalysis",
      foreignKey: "success_id",
      dependent: "destroy",
    });
    Associations.hasMany.call(Success, "crises", {
      className: "EsCrisis",
      through: "analyses",
      source: "crisis",
    });
    Associations.belongsTo.call(Dress, "crisis", {
      className: "EsCrisis",
      foreignKey: "crisis_id",
    });
    Associations.hasMany.call(Dress, "compresses", {
      className: "EsCompress",
      foreignKey: "dress_id",
    });
    Associations.belongsTo.call(Compress, "dress", {
      className: "EsDress",
      foreignKey: "dress_id",
    });

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
