import type { AssociationProxy } from "./collection-proxy.js";
import { describe, it, beforeAll, afterAll } from "vitest";
import { Base, registerModel } from "../index.js";
import { assertNothingRaised } from "@blazetrails/activesupport";
import { fixtures } from "../test-fixtures.js";

describe("EagerSingularizationTest", () => {
  fixtures([]);

  beforeAll(async () => {
    await (
      await Base.leaseConnection()
    ).createTable("viri", { force: true }, (t) => {
      t.integer("octopus_id");
      t.string("species");
    });
    await (
      await Base.leaseConnection()
    ).createTable("octopi", { force: true }, (t) => {
      t.string("species");
    });
    await (
      await Base.leaseConnection()
    ).createTable("passes", { force: true }, (t) => {
      t.integer("bus_id");
      t.integer("rides");
    });
    await (
      await Base.leaseConnection()
    ).createTable("buses", { force: true }, (t) => {
      t.string("name");
    });
    await (
      await Base.leaseConnection()
    ).createTable("crises_messes", { id: false, force: true }, (t) => {
      t.integer("crisis_id");
      t.integer("mess_id");
    });
    await (
      await Base.leaseConnection()
    ).createTable("messes", { force: true }, (t) => {
      t.string("name");
    });
    await (
      await Base.leaseConnection()
    ).createTable("crises", { force: true }, (t) => {
      t.string("name");
    });
    await (
      await Base.leaseConnection()
    ).createTable("successes", { force: true }, (t) => {
      t.string("name");
    });
    await (
      await Base.leaseConnection()
    ).createTable("analyses", { force: true }, (t) => {
      t.integer("crisis_id");
      t.integer("success_id");
    });
    await (
      await Base.leaseConnection()
    ).createTable("dresses", { force: true }, (t) => {
      t.integer("crisis_id");
    });
    await (
      await Base.leaseConnection()
    ).createTable("compresses", { force: true }, (t) => {
      t.integer("dress_id");
    });
  });

  afterAll(async () => {
    await (
      await Base.leaseConnection()
    ).dropTable(
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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class Virus extends Base {
    declare octopus_id: number | null;
    declare species: string | null;

    static {
      this.attribute("octopus_id", "integer");
      this.attribute("species", "string");
      this.belongsTo("octopus");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface Virus {
    get octopus(): Octopus | null | Promise<Octopus | null>;
    set octopus(value: Octopus | null);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class Octopus extends Base {
    declare species: string | null;

    static {
      this.attribute("species", "string");
      this.hasOne("virus");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface Octopus {
    get virus(): Virus | null | Promise<Virus | null>;
    set virus(value: Virus | null);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class Pass extends Base {
    declare bus_id: number | null;
    declare rides: number | null;

    static {
      this.attribute("bus_id", "integer");
      this.attribute("rides", "integer");
      this.belongsTo("bus");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface Pass {
    get bus(): Bus | null | Promise<Bus | null>;
    set bus(value: Bus | null);
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class Analysis extends Base {
    declare crisis_id: number | null;
    declare success_id: number | null;

    static {
      this.attribute("crisis_id", "integer");
      this.attribute("success_id", "integer");
      this.belongsTo("crisis");
      this.belongsTo("success");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface Analysis {
    get crisis(): Crisis | null | Promise<Crisis | null>;
    set crisis(value: Crisis | null);
    get success(): Success | null | Promise<Success | null>;
    set success(value: Success | null);
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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class Dress extends Base {
    declare crisis_id: number | null;
    declare compresses: AssociationProxy<Compress>;

    static {
      this.attribute("crisis_id", "integer");
      this.belongsTo("crisis");
      this.hasMany("compresses");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface Dress {
    get crisis(): Crisis | null | Promise<Crisis | null>;
    set crisis(value: Crisis | null);
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class Compress extends Base {
    declare dress_id: number | null;

    static {
      this.attribute("dress_id", "integer");
      this.belongsTo("dress");
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface Compress {
    get dress(): Dress | null | Promise<Dress | null>;
    set dress(value: Dress | null);
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
    await assertNothingRaised(() => Virus.all().includes(":octopus").toArray());
  });

  it("eager no extra singularization has one", async () => {
    await assertNothingRaised(() => Octopus.all().includes(":virus").toArray());
  });

  it("eager no extra singularization has many", async () => {
    await assertNothingRaised(() => Bus.all().includes(":passes").toArray());
  });

  it("eager no extra singularization has and belongs to many", async () => {
    await assertNothingRaised(() =>
      (async () => {
        await Crisis.all().includes(":messes");
        return Mess.all().includes(":crises").toArray();
      })(),
    );
  });

  it("eager no extra singularization has many through belongs to", async () => {
    await assertNothingRaised(() => Crisis.all().includes(":successes").toArray());
  });

  it("eager no extra singularization has many through has many", async () => {
    await assertNothingRaised(() => Crisis.all().includes(":compresses").toArray());
  });
});
