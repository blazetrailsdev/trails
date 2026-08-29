import { describe, it, expect, beforeAll } from "vitest";
import { loadSingularTarget } from "./test-helpers/load-singular-target.js";
import { Notifications } from "@blazetrails/activesupport";
import { ActiveRecord, Base, StrictLoadingViolationError, registerModel } from "./index.js";
import { association } from "./associations.js";
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

function seedPreloadedHolder(record: Base, name: string, value: unknown): void {
  const holder = (record as any).association(name);
  holder.setTarget(value);
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
    expect(developer!.isStrictLoading()).toBe(false);

    developer!.strictLoadingBang();
    expect(developer!.isStrictLoading()).toBe(true);

    await expect(association(developer!, "auditLogs").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );

    developer!.strictLoadingBang(false);
    expect(developer!.isStrictLoading()).toBe(false);

    await association(developer!, "auditLogs");

    developer!.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(developer!.isStrictLoadingNPlusOneOnly()).toBe(true);
  });

  it("strict loading n plus one only mode with has many", async () => {
    const developer = await Developer.first();
    const firm = await Firm.create({ name: "NASA" });
    const project = await Project.create({ name: "Apollo", firm_id: firm.id });
    await association(developer!, "projects").concat(project);

    await developer!.reload();

    developer!.strictLoadingBang(true, { mode: "n_plus_one_only" });
    expect(developer!.isStrictLoading()).toBe(true);

    const projects = await association(developer!, "projects");

    expect(projects.every((p) => p.isStrictLoading())).toBe(true);
    await expect(
      (projects[projects.length - 1] as any).association("firm").loadTarget(),
    ).rejects.toThrow(StrictLoadingViolationError);

    const projectsExt = await association(developer!, "projectsExtendedByName");
    expect(projectsExt.every((p) => p.isStrictLoading())).toBe(true);
    await expect(
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
    expect(developer!.isStrictLoading()).toBe(true);

    const loadedShip = (await (developer as any).association("ship").loadTarget()) as Ship;
    const parts = await association(loadedShip, "parts");

    expect(loadedShip.isStrictLoading()).toBe(false);
    expect(parts.every((p) => p.isStrictLoading())).toBe(true);
    await expect((parts[0] as any).association("trinkets").loadTarget()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("strict loading n plus one only mode does not eager load child associations", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang(true, { mode: "n_plus_one_only" });
    await developer!.projects.first();

    expect(developer!.projects.loaded).toBe(false);

    const project = await developer!.projects.first();
    await project!.firm;
  });

  it("default mode is all", async () => {
    const developer = await Developer.first();
    expect(developer!.isStrictLoadingAll()).toBe(true);
  });

  it("default mode can be changed globally", async () => {
    class NplDeveloper extends Base {
      static {
        this._tableName = "developers";
        this.strictLoadingMode = "n_plus_one_only";
      }
    }
    const developer = new NplDeveloper();
    expect(developer.isStrictLoadingNPlusOneOnly()).toBe(true);
  });

  it("strict loading", async () => {
    const allDevs = await Developer.all();
    expect(allDevs.every((d) => !d.isStrictLoading())).toBe(true);
    const strictDevs = await Developer.all().strictLoading();
    expect(strictDevs.every((d) => d.isStrictLoading())).toBe(true);
  });

  it("strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const allDevs = await Developer.all();
      expect(allDevs.every((d) => d.isStrictLoading())).toBe(true);
      const nonStrictDevs = await Developer.all().strictLoading(false);
      expect(nonStrictDevs.every((d) => !d.isStrictLoading())).toBe(true);
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
    expect(new Model1().isStrictLoading()).toBe(true);
    expect(new Model2().isStrictLoading()).toBe(false);
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
      expect(new Model1().isStrictLoading()).toBe(true);
      expect(new Model2().isStrictLoading()).toBe(false);
    });
  });

  it("raises if strict loading and lazy loading", async () => {
    const dev = await Developer.all().strictLoading().first();
    expect(dev!.isStrictLoading()).toBe(true);

    await expect(association(dev!, "auditLogs").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises if strict loading by default and lazy loading", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev = await Developer.first();
      expect(dev!.isStrictLoading()).toBe(true);

      await expect(association(dev!, "auditLogs").toArray()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("strict loading is ignored in validation context", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      expect(developer!.isStrictLoading()).toBe(true);

      await AuditLogRequired.create({
        developer_id: developer!.id,
        message: "i am a message",
      });
    });
  });

  it("strict loading with reflection is ignored in validation context", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      expect(developer!.isStrictLoading()).toBe(true);

      (developer as any).association("requiredAuditLogs").build({ message: "I am message" });
      await developer!.save();
    });
  });

  it("strict loading on concat is ignored", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    await association(developer!, "auditLogs").concat(new AuditLog({ message: "message" }));
    expect(developer!.isStrictLoading()).toBe(true);
  });

  it("strict loading on build is ignored", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    expect(() =>
      (developer as any).association("auditLogs").build({ message: "message" }),
    ).not.toThrow();
    expect(developer!.isStrictLoading()).toBe(true);
  });

  it("strict loading on writer is ignored", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    await association(developer!, "auditLogs").replace([new AuditLog({ message: "message" })]);
    expect(developer!.isStrictLoading()).toBe(true);
  });

  it("strict loading with new record on concat is ignored", async () => {
    const developer = new Developer({ id: developers("david").id, name: "Test" });
    developer.strictLoadingBang();

    await association(developer, "auditLogs").concat(new AuditLog({ message: "message" }));
    expect(developer.isStrictLoading()).toBe(true);
  });

  it("strict loading with new record on build is ignored", async () => {
    const developer = new Developer({ id: developers("david").id, name: "Test" });
    developer.strictLoadingBang();

    expect(() =>
      (developer as any).association("auditLogs").build({ message: "message" }),
    ).not.toThrow();
    expect(developer.isStrictLoading()).toBe(true);
  });

  it("strict loading with new record on writer is ignored", async () => {
    const developer = new Developer({ id: developers("david").id, name: "Test" });
    developer.strictLoadingBang();

    await association(developer, "auditLogs").replace([new AuditLog({ message: "message" })]);
    expect(developer.isStrictLoading()).toBe(true);
  });

  it("strict loading has one reload", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      const ship = await Ship.create({
        name: "The Great Ship",
        developer_id: developer!.id,
      });

      const preloaded = (await Developer.all().includes(":ship").first())!;
      expect(preloaded.isStrictLoading()).toBe(true);
      const loaded = await loadSingularTarget(preloaded, "ship");
      expect(loaded?.id).toBe(ship.id);

      await preloaded.reload();

      const reloaded = await loadSingularTarget(preloaded, "ship");
      expect(reloaded?.id).toBe(ship.id);
    });
  });

  it("strict loading with has many", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev = await Developer.first();
      await AuditLog.create({ developer_id: dev!.id, message: "M" });

      const devs = await Developer.all().includes(":auditLogs");

      for (const d of devs) {
        await association(d, "auditLogs");
      }

      for (const d of devs) {
        await d.reload();
      }

      for (const d of devs) {
        await association(d, "auditLogs");
      }
    });
  });

  it("strict loading with has many singular association and reload", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev0 = await Developer.first();
      await AuditLog.create({ developer_id: dev0!.id, message: "M" });

      const dev = (await Developer.all().includes(":auditLogs").first())!;
      await association(dev, "auditLogs");

      await dev.reload();

      await association(dev, "auditLogs");
    });
  });

  it("strict loading with has many through cascade down to middle records", async () => {
    const dev = await Developer.first();
    const firm = await Firm.create({ name: "NASA" });
    const contract = await Contract.create({ developer_id: dev!.id, company_id: firm.id });
    await association(dev!, "contracts").concat(contract);

    const loaded = await Developer.all().strictLoading().includes(":firms").first();
    expect(loaded!.isStrictLoading()).toBe(true);

    const firms = (loaded as any).association("firms").target ?? [];
    expect(firms.length).toBeGreaterThan(0);

    await expect(association(firms[0], "contracts").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );
    await expect(association(loaded!, "contracts").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );
    await expect(loadSingularTarget(loaded!, "ship")).rejects.toThrow(StrictLoadingViolationError);
  });

  it("strict loading with has one through does not prevent creation of association", async () => {
    const firm = new Firm({ name: "SuperFirm" });
    firm.strictLoadingBang();
    const computer = new Computer({ extendedWarranty: 1 });
    computer.strictLoadingBang();

    (computer.association("firm") as any).writer(firm);
    ((computer as any).developer as Developer).name = "Joe";
    (firm.association("leadDeveloper") as any).writer((computer as any).developer);

    await computer.save();
    expect(computer.isNewRecord()).toBe(false);
  });

  it("preload audit logs are strict loading because parent is strict loading", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().includes(":auditLogs").strictLoading().first())!;
    expect(dev.isStrictLoading()).toBe(true);

    const logs = (dev as any).association("auditLogs").target ?? [];
    expect(logs).toHaveLength(3);
    expect(logs.every((l: any) => l._strictLoading)).toBe(true);
  });

  it("preload audit logs are strict loading because it is strict loading by default", async () => {
    await withStrictLoadingByDefault(AuditLog, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      const dev = (await Developer.all().includes(":auditLogs").first())!;
      expect(dev.isStrictLoading()).toBe(false);

      const logs = (dev as any).association("auditLogs").target ?? [];
      expect(logs).toHaveLength(3);
      expect(logs.every((l: any) => l._strictLoading)).toBe(true);
    });
  });

  it("eager load audit logs are strict loading because parent is strict loading in hm relation", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().eagerLoad(":strictLoadingAuditLogs").first())!;
    const logs = (dev as any).association("strictLoadingAuditLogs").target ?? [];
    expect(logs).toHaveLength(3);
    expect(logs.every((l: any) => l._strictLoading)).toBe(true);

    const dev2 = (await Developer.all().eagerLoad(":auditLogs").strictLoading(false).first())!;
    const logs2 = (dev2 as any).association("auditLogs").target ?? [];
    expect(logs2.every((l: any) => !l._strictLoading)).toBe(true);
  });

  it("eager load audit logs are strict loading because parent is strict loading", async () => {
    const developer = await Developer.first();
    for (let i = 0; i < 3; i++) {
      await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
    }

    const dev = (await Developer.all().eagerLoad(":auditLogs").strictLoading().first())!;
    expect(dev.isStrictLoading()).toBe(true);
    const logs = (dev as any).association("auditLogs").target ?? [];
    expect(logs).toHaveLength(3);
    expect(logs.every((l: any) => l._strictLoading)).toBe(true);

    const dev2 = (await Developer.all().eagerLoad(":auditLogs").strictLoading(false).first())!;
    expect(dev2.isStrictLoading()).toBe(false);
    const logs2 = (dev2 as any).association("auditLogs").target ?? [];
    expect(logs2.every((l: any) => !l._strictLoading)).toBe(true);
  });

  it("eager load audit logs are strict loading because it is strict loading by default", async () => {
    await withStrictLoadingByDefault(AuditLog, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      const dev = (await Developer.all().eagerLoad(":auditLogs").first())!;
      expect(dev.isStrictLoading()).toBe(false);
      expect((await AuditLog.last())?.isStrictLoading()).toBe(true);

      const logs = (dev as any).association("auditLogs").target ?? [];
      expect(logs).toHaveLength(3);
      expect(logs.every((l: Base) => l.isStrictLoading())).toBe(true);
    });
  });

  it("raises on unloaded relation methods if strict loading", async () => {
    const dev = await Developer.all().strictLoading().first();
    expect(dev!.isStrictLoading()).toBe(true);

    await expect(association(dev!, "auditLogs").first()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on unloaded relation methods if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const dev = await Developer.first();
      expect(dev!.isStrictLoading()).toBe(true);

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

      const loaded = await loadSingularTarget(developer!, "strictLoadingOffMentor");
      expect(loaded?.id).toBe(mentor.id);
    });
  });

  it("does not raise on eager loading a strict loading belongs to relation", async () => {
    const mentor = await Mentor.create({ name: "Mentor" });
    const first = await Developer.first();
    await first!.updateColumn("mentor_id", mentor.id);

    const developer = (await Developer.all().includes(":strictLoadingMentor").first())!;

    const loaded = await loadSingularTarget(developer, "strictLoadingMentor");
    expect(loaded?.id).toBe(mentor.id);
  });

  it("does not raise on eager loading a belongs to relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const mentor = await Mentor.create({ name: "Mentor" });
      const first = await Developer.first();
      await first!.updateColumn("mentor_id", mentor.id);

      const developer = (await Developer.all().includes(":mentor").first())!;
      const loaded = await loadSingularTarget(developer, "mentor");
      expect(loaded?.id).toBe(mentor.id);
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
    const loaded = await loadSingularTarget(developer, "strictLoadingShip");
    expect(loaded).not.toBeNull();
  });

  it("does not raise on eager loading a has one relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const ship = await Ship.first();
      await ship!.updateColumn("developer_id", developers("david").id);

      const developer = (await Developer.all().includes(":ship").first())!;
      const loaded = await loadSingularTarget(developer, "ship");
      expect(loaded).not.toBeNull();
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
    const first = await association(dev, "strictLoadingOptAuditLogs").first();
    expect(first).not.toBeNull();
  });

  it("does not raise on eager loading a has many relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      for (let i = 0; i < 3; i++) {
        await AuditLog.create({ developer_id: developer!.id, message: "I am message" });
      }

      const dev = (await Developer.all().includes(":auditLogs").first())!;
      const first = await association(dev, "auditLogs").first();
      expect(first).not.toBeNull();
    });
  });

  it("raises on lazy loading a strict loading habtm relation", async () => {
    const developer = await Developer.first();
    const project = await Project.first();
    await association(developer!, "projects").concat(project!);

    expect((developer as any).association("strictLoadingProjects").isLoaded()).toBe(false);

    await expect(association(developer!, "strictLoadingProjects").first()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("raises on lazy loading a habtm relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      const project = await Project.first();
      await association(developer!, "projects").concat(project!);

      expect(association(developer!, "projects").loaded).toBe(false);

      await expect(association(developer!, "projects").first()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    });
  });

  it("does not raise on eager loading a strict loading habtm relation", async () => {
    const developer = await Developer.first();
    await association(developer!, "projects").concat((await Project.first())!);

    const dev = (await Developer.all().includes(":strictLoadingProjects").first())!;
    const first = await association(dev, "strictLoadingProjects").first();
    expect(first).not.toBeNull();
  });

  it("does not raise on eager loading a habtm relation if strict loading by default", async () => {
    await withStrictLoadingByDefault(Developer, async () => {
      const developer = await Developer.first();
      await association(developer!, "projects").concat((await Project.first())!);

      const dev = (await Developer.all().includes(":projects").first())!;
      const first = await association(dev, "projects").first();
      expect(first).not.toBeNull();
    });
  });

  it("strict loading violation raises by default", async () => {
    expect(ActiveRecord.actionOnStrictLoadingViolation).toBe("raise");

    const developer = await Developer.first();
    expect(developer!.isStrictLoading()).toBe(false);

    developer!.strictLoadingBang();
    expect(developer!.isStrictLoading()).toBe(true);

    await expect(association(developer!, "auditLogs").toArray()).rejects.toThrow(
      StrictLoadingViolationError,
    );
  });

  it("strict loading violation can log instead of raise", async () => {
    const developer = await Developer.first();
    developer!.strictLoadingBang();

    ActiveRecord.actionOnStrictLoadingViolation = "log";
    expect(ActiveRecord.actionOnStrictLoadingViolation).toBe("log");
    let logged = false;
    const sub = Notifications.subscribe("strict_loading_violation.active_record", () => {
      logged = true;
    });
    try {
      await association(developer!, "auditLogs");
      expect(logged).toBe(true);
    } finally {
      Notifications.unsubscribe(sub);
      ActiveRecord.actionOnStrictLoadingViolation = "raise";
    }
  });

  it("strict loading violation on polymorphic relation", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr!" });
    await Treasure.create({ name: "Ruby", looter_id: pirate.id, looter_type: "Pirate" });

    const treasure = (await Treasure.last())!;
    treasure.strictLoadingBang();
    expect(treasure.isStrictLoading()).toBe(true);

    await expect(loadSingularTarget(treasure, "looter")).rejects.toThrow(
      "`Treasure` is marked for strict_loading. " +
        "The polymorphic association named `:looter` cannot be lazily loaded.",
    );
  });

  it("strict loading violation logs on polymorphic relation", async () => {
    const pirate = await Pirate.create({ catchphrase: "Arrr!" });
    await Treasure.create({ name: "Ruby", looter_id: pirate.id, looter_type: "Pirate" });

    const treasure = (await Treasure.last())!;
    treasure.strictLoadingBang();
    expect(treasure.isStrictLoading()).toBe(true);

    ActiveRecord.actionOnStrictLoadingViolation = "log";
    let logged: string | null = null;
    const sub = Notifications.subscribe("strict_loading_violation.active_record", (event: any) => {
      logged = event.payload.reflection.strictLoadingViolationMessage(event.payload.owner);
    });
    try {
      await loadSingularTarget(treasure, "looter");
      expect(logged).toBe(
        "`Treasure` is marked for strict_loading. " +
          "The polymorphic association named `:looter` cannot be lazily loaded.",
      );
    } finally {
      Notifications.unsubscribe(sub);
      ActiveRecord.actionOnStrictLoadingViolation = "raise";
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
      expect(fixtureZine.isStrictLoading()).toBe(false);

      await association(fixtureZine, "interests");

      const fresh = await StrictZine.find(strictZines("going_out").id);
      expect(fresh.isStrictLoading()).toBe(true);
      await expect(association(fresh, "interests").toArray()).rejects.toThrow(
        StrictLoadingViolationError,
      );
    } finally {
      StrictZine.strictLoadingByDefault = prevDefault;
    }
  });
});
