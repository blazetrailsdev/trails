import { describe, it, expect, beforeAll } from "vitest";
import { SingularAssociation } from "./associations/singular-association.js";
import { loadSingularTarget } from "./test-helpers/load-singular-target.js";
import { Notifications } from "@blazetrails/activesupport";
import { Base, StrictLoadingViolationError, registerModel } from "./index.js";
import { collectionProxyFor as association } from "./associations.js";
import { fixtures } from "./test-fixtures.js";
import { Developer, AuditLog, AuditLogRequired } from "./test-helpers/models/developer.js";
import { Ship } from "./test-helpers/models/ship.js";
import { ShipPart } from "./test-helpers/models/ship-part.js";
import { Mentor } from "./test-helpers/models/mentor.js";
import { Contract } from "./test-helpers/models/contract.js";
import { Firm } from "./test-helpers/models/company.js";
import { Project } from "./test-helpers/models/project.js";
import { Computer } from "./test-helpers/models/computer.js";
import { Pirate } from "./test-helpers/models/pirate.js";
import { Treasure } from "./test-helpers/models/treasure.js";
import { StrictZine } from "./test-helpers/models/strict-zine.js";
import { Zine } from "./test-helpers/models/zine.js";
import { Interest } from "./test-helpers/models/interest.js";
import {
  actionOnStrictLoadingViolation,
  setActionOnStrictLoadingViolation,
} from "./active-record.js";

function seedPreloadedHolder(record: Base, name: string, value: unknown): void {
  const holder = (record as any).association(name);
  holder.setTarget(value);
}

async function assertLogged(message: string, fn: () => Promise<void>): Promise<void> {
  let logged: string | null = null;
  const sub = Notifications.subscribe("strict_loading_violation.active_record", (event: any) => {
    logged = event.payload.reflection.strictLoadingViolationMessage(event.payload.owner);
  });
  try {
    await fn();
    expect(logged).toEqual(message);
  } finally {
    Notifications.unsubscribe(sub);
  }
}

async function withStrictLoadingByDefault<T>(model: typeof Base, fn: () => Promise<T>): Promise<T> {
  const prev = model.strictLoadingByDefault;
  model.strictLoadingByDefault = true;
  try {
    return await fn();
  } finally {
    model.strictLoadingByDefault = prev;
  }
}

describe("StrictLoadingTest", () => {
  const { developers, ships } = fixtures(["developers", "developersProjects", "projects", "ships"]);

  beforeAll(() => {
    registerModel(Developer);
    registerModel(AuditLog);
    registerModel(AuditLogRequired);
    registerModel(Ship);
    registerModel(ShipPart);
    registerModel(Mentor);
    registerModel(Contract);
    registerModel(Firm);
    registerModel(Project);
    registerModel(Computer);
    registerModel(Pirate);
    registerModel(Treasure);
  });

  it("strict loading!", async () => {
    const developer = await Developer.first();
    expect(developer!.isStrictLoading()).toBeFalsy();

    expect(developer!.strictLoadingBang()).toBeTruthy();
    expect(developer!.isStrictLoading()).toBeTruthy();

    await expect(association(developer!, "auditLogs").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );

    expect(developer!.strictLoadingBang(false)).toBeFalsy();
    expect(developer!.isStrictLoading()).toBeFalsy();

    await expect(association(developer!, "auditLogs").toArray()).resolves.not.toThrow();

    expect(developer!.strictLoadingBang(true, { mode: "n_plus_one_only" })).toBeTruthy();
    expect(developer!.isStrictLoadingNPlusOneOnly()).toBeTruthy();
  });

  it("strict loading n plus one only mode with has many", async () => {
    const developer = await Developer.first();
    const firm = await Firm.create({ name: "NASA" });
    const project = await Project.create({ name: "Apollo", firm_id: firm.id });
    await association(developer!, "projects").concat(project);

    await developer!.reload();

    developer!.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(developer!.isStrictLoading()).toBeTruthy();

    await expect(association(developer!, "projects").toArray()).resolves.not.toThrow();

    const projects = await association(developer!, "projects");
    expect(projects.every((p) => p.isStrictLoading())).toBeTruthy();
    await expect(async () =>
      (projects[projects.length - 1] as any).association("firm").loadTarget(),
    ).rejects.toThrow(StrictLoadingViolationError);

    await expect(
      association(developer!, "projectsExtendedByName").toArray(),
    ).resolves.not.toThrow();

    const projectsExt = await association(developer!, "projectsExtendedByName");
    expect(projectsExt.every((p) => p.isStrictLoading())).toBeTruthy();
    await expect(async () =>
      (projectsExt[projectsExt.length - 1] as any).association("firm").loadTarget(),
    ).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading n plus one only mode with belongs to", async () => {
    const developer = await Developer.first();
    const ship = await Ship.first();
    await ShipPart.create({ name: "Stern", ship_id: ship!.id });

    await ship!.updateColumn("developer_id", developer!.id);
    await developer!.reload();

    developer!.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(developer!.isStrictLoading()).toBeTruthy();

    const loadedShip = (await (developer as any).association("ship").loadTarget()) as Ship;
    await expect(association(loadedShip, "parts").toArray()).resolves.not.toThrow();

    const parts = await association(loadedShip, "parts");
    expect(loadedShip.isStrictLoading()).toBeFalsy();
    expect(parts.every((p) => p.isStrictLoading())).toBeTruthy();
    await expect((parts[0] as any).association("trinkets").loadTarget()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("strict loading n plus one only mode does not eager load child associations", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang(true, { mode: "n_plus_one_only" });
    await developer!.projects.first();

    expect(developer!.projects.loaded).toBeFalsy();

    const project = await developer!.projects.first();
    await expect(Promise.resolve(project!.firm)).resolves.not.toThrow();
  });

  it("default mode is all", async () => {
    const developer = await Developer.first();
    expect(developer!.isStrictLoadingAll()).toBeTruthy();
  });

  it("default mode can be changed globally", async () => {
    class NplDeveloper extends Base {
      static {
        this._tableName = "developers";
        this.strictLoadingMode = "n_plus_one_only";
      }
    }
    const developer = new NplDeveloper();
    expect(developer.isStrictLoadingNPlusOneOnly()).toBeTruthy();
  });

  it("strict loading", async () => {
    for (const d of await Developer.all()) expect(d.isStrictLoading()).toBeFalsy();
    for (const d of await Developer.all().strictLoading()) expect(d.isStrictLoading()).toBeTruthy();
  });

  it("strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      for (const d of await Developer.all()) expect(d.isStrictLoading()).toBeTruthy();
      for (const d of await Developer.all().strictLoading(false))
        expect(d.isStrictLoading()).toBeFalsy();
    });
  });

  it("strict loading by default can be set per model", () => {
    class Model1 extends Base {
      static {
        this._tableName = "developers";
        this.strictLoadingByDefault = true;
      }
    }
    class Model2 extends Base {
      static {
        this._tableName = "developers";
        this.strictLoadingByDefault = false;
      }
    }
    expect(new Model1().isStrictLoading()).toBeTruthy();
    expect(new Model2().isStrictLoading()).toBeFalsy();
  });

  it("strict loading by default is inheritable", async () => {
    await withStrictLoadingByDefault(Base, async () => {
      class Model1 extends Base {
        static {
          this._tableName = "developers";
        }
      }
      class Model2 extends Base {
        static {
          this._tableName = "developers";
          this.strictLoadingByDefault = false;
        }
      }
      expect(new Model1().isStrictLoading()).toBeTruthy();
      expect(new Model2().isStrictLoading()).toBeFalsy();
    });
  });

  it("raises if strict loading and lazy loading", async () => {
    const dev = await Developer.all().strictLoading().first();
    expect(dev!.isStrictLoading()).toBeTruthy();

    await expect(association(dev!, "auditLogs").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises if strict loading by default and lazy loading", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev = await Developer.first();
      expect(dev!.isStrictLoading()).toBeTruthy();

      await expect(association(dev!, "auditLogs").toArray()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("strict loading is ignored in validation context", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      expect(developer!.isStrictLoading()).toBeTruthy();

      await expect(
        AuditLogRequired.create({
          developer_id: developer!.id,
          message: "i am a message",
        }),
      ).resolves.not.toThrow();
    });
  });

  it("strict loading with reflection is ignored in validation context", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      expect(developer!.isStrictLoading()).toBeTruthy();

      (developer as any).association("requiredAuditLogs").build({ message: "I am message" });
      await developer!.save();
    });
  });

  it("strict loading on concat is ignored", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    await expect(
      association(developer!, "auditLogs").concat(new AuditLog({ message: "message" })),
    ).resolves.not.toThrow();
  });

  it("strict loading on build is ignored", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    expect(() =>
      (developer as any).association("auditLogs").build({ message: "message" }),
    ).not.toThrow();
  });

  it("strict loading on writer is ignored", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    await expect(
      association(developer!, "auditLogs").replace([new AuditLog({ message: "message" })]),
    ).resolves.not.toThrow();
  });

  it("strict loading with new record on concat is ignored", async () => {
    const developer = new Developer({ id: developers("david").id, name: "Test" });
    developer.strictLoadingBang();

    await expect(
      association(developer, "auditLogs").concat(new AuditLog({ message: "message" })),
    ).resolves.not.toThrow();
  });

  it("strict loading with new record on build is ignored", async () => {
    const developer = new Developer({ id: developers("david").id, name: "Test" });
    developer.strictLoadingBang();

    expect(() =>
      (developer as any).association("auditLogs").build({ message: "message" }),
    ).not.toThrow();
  });

  it("strict loading with new record on writer is ignored", async () => {
    const developer = new Developer({ id: developers("david").id, name: "Test" });
    developer.strictLoadingBang();

    await expect(
      association(developer, "auditLogs").replace([new AuditLog({ message: "message" })]),
    ).resolves.not.toThrow();
  });

  it("strict loading has one reload", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      const ship = await Ship.create({
        name: "The Great Ship",
        developer_id: developer!.id,
      });

      const preloaded = (await Developer.all().includes(":ship").first())!;
      expect(preloaded.isStrictLoading()).toBeTruthy();
      const loaded = await loadSingularTarget(preloaded, "ship");
      expect(loaded?.id).toBe(ship.id);

      await preloaded.reload();

      await expect(
        (async () => {
          const reloaded = await loadSingularTarget(preloaded, "ship");
          expect(reloaded?.id).toBe(ship.id);
        })(),
      ).resolves.not.toThrow();
    });
  });

  it("strict loading with has many", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev = await Developer.first();
      await AuditLog.create({ developer_id: dev!.id, message: "M" });

      const devs = await Developer.all().includes(":auditLogs");

      await expect(
        Promise.all(devs.map((d) => association(d, "auditLogs").toArray())),
      ).resolves.not.toThrow();

      for (const d of devs) {
        await d.reload();
      }

      await expect(
        Promise.all(devs.map((d) => association(d, "auditLogs").toArray())),
      ).resolves.not.toThrow();
    });
  });

  it("strict loading with has many singular association and reload", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev0 = await Developer.first();
      await AuditLog.create({ developer_id: dev0!.id, message: "M" });

      const dev = (await Developer.all().includes(":auditLogs").first())!;
      await expect(association(dev, "auditLogs").toArray()).resolves.not.toThrow();

      await dev.reload();

      await expect(association(dev, "auditLogs").toArray()).resolves.not.toThrow();
    });
  });

  it("strict loading with has many through cascade down to middle records", async () => {
    const dev = await Developer.first();
    const firm = await Firm.create({ name: "NASA" });
    const contract = await Contract.create({ developer_id: dev!.id, company_id: firm.id });
    await association(dev!, "contracts").concat(contract);

    const loaded = await Developer.all().strictLoading().includes(":firms").first();
    expect(loaded!.isStrictLoading()).toBeTruthy();

    const firms = (loaded as any).association("firms").target ?? [];

    for (const block of [
      () => association(firms[0], "contracts").first(),
      () => association(loaded!, "contracts").first(),
      () => loadSingularTarget(loaded!, "ship"),
    ]) {
      await expect(block()).rejects.toThrow(StrictLoadingViolationError);
    }
  });

  it("strict loading with has one through does not prevent creation of association", async () => {
    const firm = new Firm({ name: "SuperFirm" });
    firm.strictLoadingBang();
    const computer = new Computer({ extendedWarranty: 1 });
    computer.strictLoadingBang();

    await (computer.association("firm") as SingularAssociation).writer(firm);
    ((computer as any).developer as Developer).name = "Joe";
    await (firm.association("leadDeveloper") as SingularAssociation).writer(
      (computer as any).developer,
    );

    await expect(computer.save()).resolves.not.toThrow();
  });

  it("preload audit logs are strict loading because parent is strict loading", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().includes(":auditLogs").strictLoading().first())!;
    expect(dev.isStrictLoading()).toBeTruthy();

    const logs = (dev as any).association("auditLogs").target ?? [];
    expect(logs.every((l: any) => l._strictLoading)).toBeTruthy();
  });

  it("preload audit logs are strict loading because it is strict loading by default", async () => {
    await withStrictLoadingByDefault(AuditLog, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      const dev = (await Developer.all().includes(":auditLogs").first())!;
      expect(dev.isStrictLoading()).toBeFalsy();

      const logs = (dev as any).association("auditLogs").target ?? [];
      expect(logs.every((l: any) => l._strictLoading)).toBeTruthy();
    });
  });

  it("eager load audit logs are strict loading because parent is strict loading in hm relation", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().eagerLoad(":strictLoadingAuditLogs").first())!;
    const logs = (dev as any).association("strictLoadingAuditLogs").target ?? [];
    expect(logs.every((l: any) => l._strictLoading)).toBeTruthy();

    const dev2 = (await Developer.all().eagerLoad(":auditLogs").strictLoading(false).first())!;
    const logs2 = (dev2 as any).association("auditLogs").target ?? [];
    expect(logs2.every((l: any) => !l._strictLoading)).toBeTruthy();
  });

  it("eager load audit logs are strict loading because parent is strict loading", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().eagerLoad(":auditLogs").strictLoading().first())!;
    expect(dev.isStrictLoading()).toBeTruthy();
    const logs = (dev as any).association("auditLogs").target ?? [];
    expect(logs.every((l: any) => l._strictLoading)).toBeTruthy();

    const dev2 = (await Developer.all().eagerLoad(":auditLogs").strictLoading(false).first())!;
    expect(dev2.isStrictLoading()).toBeFalsy();
    const logs2 = (dev2 as any).association("auditLogs").target ?? [];
    expect(logs2.every((l: any) => !l._strictLoading)).toBeTruthy();
  });

  it("eager load audit logs are strict loading because it is strict loading by default", async () => {
    await withStrictLoadingByDefault(AuditLog, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      const dev = (await Developer.all().eagerLoad(":auditLogs").first())!;
      expect(dev.isStrictLoading()).toBeFalsy();
      expect((await AuditLog.last())?.isStrictLoading()).toBeTruthy();

      const logs = (dev as any).association("auditLogs").target ?? [];
      expect(logs.every((l: Base) => l.isStrictLoading())).toBeTruthy();
    });
  });

  it("raises on unloaded relation methods if strict loading", async () => {
    const dev = await Developer.all().strictLoading().first();
    expect(dev!.isStrictLoading()).toBeTruthy();

    await expect(association(dev!, "auditLogs").first()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on unloaded relation methods if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev = await Developer.first();
      expect(dev!.isStrictLoading()).toBeTruthy();

      await expect(association(dev!, "auditLogs").first()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("raises on lazy loading a strict loading belongs to relation", async () => {
    const mentor = await Mentor.create({ name: "Mentor" });
    const developer = await Developer.first();
    await developer!.updateColumn("mentor_id", mentor.id);

    await expect(loadSingularTarget(developer!, "strictLoadingMentor")).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a belongs to relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const mentor = await Mentor.create({ name: "Mentor" });
      const developer = await Developer.first();
      await developer!.updateColumn("mentor_id", mentor.id);

      await expect(loadSingularTarget(developer!, "mentor")).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("strict loading can be turned off on an association in a model with strict loading on", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const mentor = await Mentor.create({ name: "Mentor" });
      const developer = await Developer.first();
      await developer!.updateColumn("mentor_id", mentor.id);

      await expect(loadSingularTarget(developer!, "strictLoadingOffMentor")).resolves.not.toThrow();
    });
  });

  it("does not raise on eager loading a strict loading belongs to relation", async () => {
    const mentor = await Mentor.create({ name: "Mentor" });
    const first = await Developer.first();
    await first!.updateColumn("mentor_id", mentor.id);

    const developer = (await Developer.all().includes(":strictLoadingMentor").first())!;

    await expect(loadSingularTarget(developer, "strictLoadingMentor")).resolves.not.toThrow();
  });

  it("does not raise on eager loading a belongs to relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const mentor = await Mentor.create({ name: "Mentor" });
      const first = await Developer.first();
      await first!.updateColumn("mentor_id", mentor.id);

      const developer = (await Developer.all().includes(":mentor").first())!;
      await expect(loadSingularTarget(developer, "mentor")).resolves.not.toThrow();
    });
  });

  it("raises on lazy loading a strict loading has one relation", async () => {
    const developer = await Developer.first();
    const ship = await Ship.first();
    await ship!.updateColumn("developer_id", developer!.id);

    await expect(loadSingularTarget(developer!, "strictLoadingShip")).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a has one relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      const ship = await Ship.first();
      await ship!.updateColumn("developer_id", developer!.id);

      await expect(loadSingularTarget(developer!, "ship")).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("does not raise on eager loading a strict loading has one relation", async () => {
    const ship = await Ship.first();
    await ship!.updateColumn("developer_id", developers("david").id);

    const developer = (await Developer.all().includes(":strictLoadingShip").first())!;
    await expect(loadSingularTarget(developer, "strictLoadingShip")).resolves.not.toThrow();
  });

  it("does not raise on eager loading a has one relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const ship = await Ship.first();
      await ship!.updateColumn("developer_id", developers("david").id);

      const developer = (await Developer.all().includes(":ship").first())!;
      await expect(loadSingularTarget(developer, "ship")).resolves.not.toThrow();
    });
  });

  it("raises on lazy loading a strict loading has many relation", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    await expect(association(developer!, "strictLoadingOptAuditLogs").first()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a has many relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      await expect(association(developer!, "auditLogs").first()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("does not raise on eager loading a strict loading has many relation", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().includes(":strictLoadingOptAuditLogs").first())!;
    await expect(association(dev, "strictLoadingOptAuditLogs").first()).resolves.not.toThrow();
  });

  it("does not raise on eager loading a has many relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      const dev = (await Developer.all().includes(":auditLogs").first())!;
      await expect(association(dev, "auditLogs").first()).resolves.not.toThrow();
    });
  });

  it("raises on lazy loading a strict loading habtm relation", async () => {
    const developer = await Developer.first();
    const project = await Project.first();
    await association(developer!, "projects").concat(project!);

    expect((developer as any).association("strictLoadingProjects").isLoaded()).toBeFalsy();

    await expect(association(developer!, "strictLoadingProjects").first()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a habtm relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      const project = await Project.first();
      await association(developer!, "projects").concat(project!);

      expect(association(developer!, "projects").loaded).toBeFalsy();

      await expect(association(developer!, "projects").first()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("does not raise on eager loading a strict loading habtm relation", async () => {
    const developer = await Developer.first();
    await association(developer!, "projects").concat((await Project.first())!);

    const dev = (await Developer.all().includes(":strictLoadingProjects").first())!;
    await expect(association(dev, "strictLoadingProjects").first()).resolves.not.toThrow();
  });

  it("does not raise on eager loading a habtm relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      await association(developer!, "projects").concat((await Project.first())!);

      const dev = (await Developer.all().includes(":projects").first())!;
      await expect(association(dev, "projects").first()).resolves.not.toThrow();
    });
  });

  it("strict loading violation raises by default", async () => {
    expect(actionOnStrictLoadingViolation()).toBe("raise");

    const developer = await Developer.first();
    expect(developer!.isStrictLoading()).toBeFalsy();

    developer!.strictLoadingBang();
    expect(developer!.isStrictLoading()).toBeTruthy();

    await expect(association(developer!, "auditLogs").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("strict loading violation can log instead of raise", async () => {
    const oldValue = actionOnStrictLoadingViolation();
    setActionOnStrictLoadingViolation("log");
    try {
      expect(actionOnStrictLoadingViolation()).toBe("log");

      const developer = await Developer.first();
      expect(developer!.isStrictLoading()).toBeFalsy();

      developer!.strictLoadingBang();
      expect(developer!.isStrictLoading()).toBeTruthy();

      const expectedLog =
        "`Developer` is marked for strict_loading. " +
        "The AuditLog association named `:auditLogs` cannot be lazily loaded.";
      await assertLogged(expectedLog, async () => {
        await association(developer!, "auditLogs");
      });
    } finally {
      setActionOnStrictLoadingViolation(oldValue);
    }
  });

  it("strict loading violation on polymorphic relation", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr!" });
    await Treasure.create({ name: "Ruby", looter_id: pirate.id, looter_type: "Pirate" });

    const treasure = (await Treasure.last())!;
    treasure.strictLoadingBang();
    expect(treasure.isStrictLoading()).toBeTruthy();

    let error: Error | undefined;
    await expect(
      loadSingularTarget(treasure, "looter").catch((e: Error) => {
        error = e;
        throw e;
      }),
    ).rejects.toThrow(StrictLoadingViolationError);

    const expectedErrorMessage =
      "`Treasure` is marked for strict_loading. " +
      "The polymorphic association named `:looter` cannot be lazily loaded.";

    expect(error!.message).toEqual(expectedErrorMessage);
  });

  it("strict loading violation logs on polymorphic relation", async () => {
    const oldValue = actionOnStrictLoadingViolation();
    setActionOnStrictLoadingViolation("log");
    try {
      expect(actionOnStrictLoadingViolation()).toBe("log");

      const pirate = await Pirate.create({ catchphrase: "Arrr!" });
      await Treasure.create({ name: "Ruby", looter_id: pirate.id, looter_type: "Pirate" });

      const treasure = (await Treasure.last())!;
      treasure.strictLoadingBang();
      expect(treasure.isStrictLoading()).toBeTruthy();

      const expectedLog =
        "`Treasure` is marked for strict_loading. " +
        "The polymorphic association named `:looter` cannot be lazily loaded.";
      await assertLogged(expectedLog, async () => {
        await loadSingularTarget(treasure, "looter");
      });
    } finally {
      setActionOnStrictLoadingViolation(oldValue);
    }
  });
});

describe("StrictLoadingFixturesTest", () => {
  const { strictZines } = fixtures(["strictZines"]);

  beforeAll(() => {
    registerModel(StrictZine);
    registerModel(Zine);
    registerModel(Interest);
  });

  it("strict loading violations are ignored on fixtures", async () => {
    const prevDefault = StrictZine.strictLoadingByDefault;
    StrictZine.strictLoadingByDefault = false;
    const fixtureZine = await StrictZine.find(strictZines("going_out").id);
    StrictZine.strictLoadingByDefault = true;

    try {
      await expect(association(fixtureZine, "interests").toArray()).resolves.not.toThrow();

      const fresh = await StrictZine.find(strictZines("going_out").id);
      await expect(association(fresh, "interests").toArray()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    } finally {
      StrictZine.strictLoadingByDefault = prevDefault;
    }
  });
});
