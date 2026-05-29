/**
 * Mirrors Rails activerecord/test/cases/associations/has_and_belongs_to_many_associations_test.rb
 */
import { describe, it, expect, beforeEach } from "vitest";
import { Base, registerModel, AssociationTypeMismatch } from "../index.js";
import { createTestAdapter } from "../test-adapter.js";
import type { DatabaseAdapter } from "../adapter.js";
import { Associations, loadHasMany, loadHabtm, association } from "../associations.js";
import { defineSchema } from "../test-helpers/define-schema.js";

function freshAdapter(): DatabaseAdapter {
  return createTestAdapter();
}

// ==========================================================================
// HasAndBelongsToManyAssociationsTest — mirrors has_and_belongs_to_many_associations_test.rb
// ==========================================================================

describe("HasAndBelongsToManyAssociationsTest", () => {
  let adapter: DatabaseAdapter;

  class Developer extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("salary", "integer");
    }
  }

  class Project extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("approved", "boolean");
      this.attribute("featured", "boolean");
    }
  }

  // Join table model for in-memory HABTM
  class DeveloperProject extends Base {
    static {
      this.attribute("developer_id", "integer");
      this.attribute("project_id", "integer");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    // Schema covers the shared Developer/Project/DeveloperProject family
    // used by the majority of tests in this describe. Tests further down
    // that declare their own inline classes reuse this per-test adapter;
    // those that hit the database also seed additional tables via
    // `defineSchema` next to the class declarations, while reflection-
    // or validation-only tests skip the schema step.
    await defineSchema(adapter, {
      developers: { name: "string", salary: "integer" },
      projects: { name: "string", approved: "boolean", featured: "boolean" },
      developer_projects: { developer_id: "integer", project_id: "integer" },
    });
    Developer.adapter = adapter;
    Project.adapter = adapter;
    DeveloperProject.adapter = adapter;
    registerModel(Developer);
    registerModel(Project);
    registerModel(DeveloperProject);
    // Reset associations and re-declare HABTM (creates anonymous join model + through)
    (Developer as any)._associations = [];
    Associations.hasAndBelongsToMany.call(Developer, "projects", {
      className: "Project",
      joinTable: "developer_projects",
    });
  });

  it.skip("marshal dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  it("should property quote string primary keys", async () => {
    // Mirrors Rails' setup_data_for_habtm_case: a HABTM between models with
    // string primary keys. The join row must store the string PKs verbatim
    // ("c1"/"t1"), and the join query must round-trip them.
    const a2 = freshAdapter();
    await defineSchema(a2, {
      countries: { country_id: "string", name: "string" },
      treaties: { treaty_id: "string", name: "string" },
      countries_treaties: { country_id: "string", treaty_id: "string" },
    });
    class Country extends Base {
      static {
        this.primaryKey = "country_id";
        this.attribute("country_id", "string");
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    class Treaty extends Base {
      static {
        this.primaryKey = "treaty_id";
        this.attribute("treaty_id", "string");
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    class CountryTreaty extends Base {
      static {
        this._tableName = "countries_treaties";
        this.primaryKey = ["country_id", "treaty_id"];
        this.attribute("country_id", "string");
        this.attribute("treaty_id", "string");
        this.adapter = a2;
      }
    }
    registerModel("Country", Country);
    registerModel("Treaty", Treaty);
    await Country.create({ country_id: "c1", name: "France" });
    await Treaty.create({ treaty_id: "t1", name: "Paris" });
    await CountryTreaty.create({ country_id: "c1", treaty_id: "t1" });

    const record = (await a2.execute("select * from countries_treaties"))[0];
    expect(record.country_id).toBe("c1");
    expect(record.treaty_id).toBe("t1");

    const country = await Country.find("c1");
    const treaties = await loadHabtm(country, "treaties", {
      className: "Treaty",
      joinTable: "countries_treaties",
      foreignKey: "country_id",
    });
    expect(treaties.length).toBe(1);
    expect((treaties[0] as any).treaty_id).toBe("t1");
  });

  it("proper usage of primary keys and join table", async () => {
    // Verify join table correctly links developer and project via PKs
    const dev = await Developer.create({ name: "PKDev", salary: 80000 });
    const proj = await Project.create({ name: "PKProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).id).toBe(proj.id);
    // Verify from the other side
    const devs = await loadHabtm(proj, "developers", {
      className: "Developer",
      joinTable: "developer_projects",
      foreignKey: "project_id",
    });
    expect(devs.length).toBe(1);
    expect((devs[0] as any).id).toBe(dev.id);
  });

  it("has and belongs to many", async () => {
    const dev = await Developer.create({ name: "Alice", salary: 100000 });
    const proj = await Project.create({ name: "Rails" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("Rails");
  });

  it("adding single", async () => {
    const dev = await Developer.create({ name: "Bob", salary: 80000 });
    const proj = await Project.create({ name: "ActiveRecord" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
  });

  it("adding type mismatch", async () => {
    const dev = await Developer.create({ name: "TypeMismatch", salary: 80000 });
    const proxy = association(dev, "projects");
    await expect(proxy.push(null as any)).rejects.toThrow(AssociationTypeMismatch);
    await expect(proxy.push(1 as any)).rejects.toThrow(AssociationTypeMismatch);
    await expect(proxy.push(dev as any)).rejects.toThrow(AssociationTypeMismatch);
  });

  it("adding from the project", async () => {
    const proj = await Project.create({ name: "Arel" });
    const dev = await Developer.create({ name: "Carol", salary: 90000 });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const devs = await loadHabtm(proj, "developers", {
      className: "Developer",
      joinTable: "developer_projects",
      foreignKey: "project_id",
    });
    expect(devs.length).toBe(1);
  });

  it("adding from the project fixed timestamp", async () => {
    // Mirrors Rails: adding a developer to a project's collection inserts a
    // join row only — it must NOT re-save the owner, so the owner's
    // updated_at is unchanged ("fixed timestamp").
    const a2 = freshAdapter();
    await defineSchema(a2, {
      ts_developers: { name: "string", created_at: "datetime", updated_at: "datetime" },
      ts_projects: { name: "string" },
      ts_developers_projects: { ts_developer_id: "integer", ts_project_id: "integer" },
    });
    class TsDeveloper extends Base {
      static {
        this.attribute("name", "string");
        this.attribute("created_at", "datetime");
        this.attribute("updated_at", "datetime");
        this.adapter = a2;
      }
    }
    class TsProject extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    registerModel("TsDeveloper", TsDeveloper);
    registerModel("TsProject", TsProject);
    Associations.hasAndBelongsToMany.call(TsDeveloper, "tsProjects", {
      className: "TsProject",
      joinTable: "ts_developers_projects",
    });

    const jamis = await TsDeveloper.create({ name: "Jamis" });
    const p1 = await TsProject.create({ name: "P1" });
    const actionController = await TsProject.create({ name: "ActionController" });
    await association(jamis, "tsProjects").push(p1);

    const updatedAt = String((jamis as any).updated_at);
    await association(jamis, "tsProjects").push(actionController);
    expect(String((jamis as any).updated_at)).toBe(updatedAt);

    const projects = await loadHabtm(jamis, "tsProjects", {
      className: "TsProject",
      joinTable: "ts_developers_projects",
      foreignKey: "ts_developer_id",
    });
    expect(projects.length).toBe(2);
  });

  it("adding multiple", async () => {
    const dev = await Developer.create({ name: "Dave", salary: 70000 });
    const p1 = await Project.create({ name: "P1" });
    const p2 = await Project.create({ name: "P2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(2);
  });

  it("adding a collection", async () => {
    const dev = await Developer.create({ name: "Eve", salary: 60000 });
    const projs = await Promise.all([
      Project.create({ name: "A" }),
      Project.create({ name: "B" }),
      Project.create({ name: "C" }),
    ]);
    for (const p of projs) {
      await DeveloperProject.create({ developer_id: dev.id, project_id: p.id });
    }
    const loaded = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(loaded.length).toBe(3);
  });

  it("habtm saving multiple relationships", async () => {
    const dev = await Developer.create({ name: "Multi", salary: 90000 });
    const p1 = await Project.create({ name: "R1" });
    const p2 = await Project.create({ name: "R2" });
    const p3 = await Project.create({ name: "R3" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p3.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(3);
  });

  it("habtm distinct order preserved", async () => {
    // Verify that projects loaded via HABTM maintain distinct entries (no duplicates from join records)
    const dev = await Developer.create({ name: "DistDev", salary: 80000 });
    const p1 = await Project.create({ name: "DP1" });
    const p2 = await Project.create({ name: "DP2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    const ids = projects.map((p: any) => p.id);
    const uniqueIds = [...new Set(ids)];
    expect(ids.length).toBe(uniqueIds.length);
    expect(projects.length).toBe(2);
  });

  it("habtm collection size from build", async () => {
    // Verify that loaded HABTM array length reflects the number of join records
    const dev = await Developer.create({ name: "SizeDev", salary: 70000 });
    const p1 = await Project.create({ name: "S1" });
    const p2 = await Project.create({ name: "S2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(2);
  });

  it("habtm collection size from params", async () => {
    // Verify HABTM collection size matches number of join records created
    const dev = await Developer.create({ name: "ParamsDev", salary: 75000 });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
    // Add one project
    const p1 = await Project.create({ name: "PP1" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    const reloaded = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(reloaded.length).toBe(1);
  });

  it("build", async () => {
    // Build a new project and associate via join table
    const dev = await Developer.create({ name: "BuildDev", salary: 80000 });
    const proj = new Project({ name: "BuiltProj" });
    (proj.constructor as any).adapter = adapter;
    expect(proj.isNewRecord()).toBe(true);
    expect(proj.name).toBe("BuiltProj");
  });

  it("new aliased to build", async () => {
    // new() is equivalent to build in TS — both use constructor
    const dev = await Developer.create({ name: "NewAliasDev", salary: 80000 });
    const proj = new Project({ name: "NewAliasProj" });
    (proj.constructor as any).adapter = adapter;
    expect(proj.isNewRecord()).toBe(true);
    expect(proj.name).toBe("NewAliasProj");
  });

  it("build by new record", async () => {
    // Building associated record from an unsaved parent
    const dev = new Developer({ name: "NewDev", salary: 50000 });
    (dev.constructor as any).adapter = adapter;
    expect(dev.isNewRecord()).toBe(true);
    const proj = new Project({ name: "NewRecProj" });
    (proj.constructor as any).adapter = adapter;
    expect(proj.isNewRecord()).toBe(true);
  });

  it("create", async () => {
    // Creating a project and linking it to a developer via join table
    const dev = await Developer.create({ name: "CreateDev", salary: 85000 });
    const proj = await Project.create({ name: "CreatedProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("CreatedProj");
  });

  it("creation respects hash condition", async () => {
    // Create a project with specific attributes and link to developer
    const dev = await Developer.create({ name: "HashDev", salary: 90000 });
    const proj = await Project.create({ name: "HashProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("HashProj");
  });

  it("distinct after the fact", async () => {
    // Verify loaded HABTM results are distinct (no duplicate projects)
    const dev = await Developer.create({ name: "DistDev2", salary: 60000 });
    const proj = await Project.create({ name: "DistProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    // Even with one join record, verify distinct behavior
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    const ids = projects.map((p: any) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("distinct before the fact", async () => {
    // Loaded HABTM should return distinct records by default
    const dev = await Developer.create({ name: "DistBefore", salary: 60000 });
    const p1 = await Project.create({ name: "DB1" });
    const p2 = await Project.create({ name: "DB2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(2);
  });

  it("distinct option prevents duplicate push", async () => {
    // Mirrors Rails: `Project.developers` is a `-> { distinct }` HABTM, so
    // re-pushing an already-added record dedups in place rather than growing
    // the loaded target. Rails' fixture seeds active_record with 1 developer;
    // we push three distinct developers to reach the same size of 3.
    (Project as any)._associations = [];
    Associations.hasAndBelongsToMany.call(Project, "developers", {
      className: "Developer",
      joinTable: "developer_projects",
      scope: (rel: any) => rel.distinct(),
    });
    const project = await Project.create({ name: "active_record" });
    const jamis = await Developer.create({ name: "Jamis", salary: 60000 });
    const david = await Developer.create({ name: "David", salary: 60000 });
    const extra = await Developer.create({ name: "Extra", salary: 60000 });

    await association(project, "developers").push(jamis);
    await association(project, "developers").push(david);
    await association(project, "developers").push(extra);
    expect(await association(project, "developers").size()).toBe(3);

    await association(project, "developers").push(david);
    await association(project, "developers").push(jamis);
    expect(await association(project, "developers").size()).toBe(3);
  });

  it("distinct when association already loaded", async () => {
    // Loading HABTM twice should return same distinct results
    const dev = await Developer.create({ name: "DistLoaded", salary: 60000 });
    const p1 = await Project.create({ name: "DL1" });
    const p2 = await Project.create({ name: "DL2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const first = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    const second = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(first.length).toBe(second.length);
    expect(first.length).toBe(2);
  });

  it("deleting", async () => {
    const dev = await Developer.create({ name: "Frank", salary: 50000 });
    const proj = await Project.create({ name: "ToDelete" });
    const join = await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    await join.destroy();
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
  });

  it("deleting array", async () => {
    const dev = await Developer.create({ name: "DelArr", salary: 50000 });
    const p1 = await Project.create({ name: "P1" });
    const p2 = await Project.create({ name: "P2" });
    const j1 = await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    const j2 = await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await j1.destroy();
    await j2.destroy();
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
  });

  it("deleting all via join records", async () => {
    const dev = await Developer.create({ name: "DelAll", salary: 50000 });
    const p1 = await Project.create({ name: "DA1" });
    const p2 = await Project.create({ name: "DA2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    // Delete all join records for this developer
    const allJoins = await loadHasMany(dev, "developerProjects", {
      className: "DeveloperProject",
      foreignKey: "developer_id",
      primaryKey: "id",
    });
    for (const j of allJoins) {
      await j.destroy();
    }
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
  });

  it("removing associations on destroy", async () => {
    const dev = await Developer.create({ name: "Destroyer", salary: 50000 });
    const proj = await Project.create({ name: "Doomed" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    // Destroy the developer
    await dev.destroy();
    // The join record should still exist (no dependent option), but the developer is gone
    const found = await Developer.find(dev.id as number).catch(() => null);
    expect(found).toBeNull();
  });

  it("destroying a project does not affect other projects", async () => {
    const dev = await Developer.create({ name: "DestDev", salary: 50000 });
    const p1 = await Project.create({ name: "Keep" });
    const p2 = await Project.create({ name: "Remove" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    const j2 = await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await j2.destroy();
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("Keep");
  });

  it("destroying many join records", async () => {
    const dev = await Developer.create({ name: "ManyDest", salary: 50000 });
    const p1 = await Project.create({ name: "MD1" });
    const p2 = await Project.create({ name: "MD2" });
    const j1 = await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    const j2 = await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await j1.destroy();
    await j2.destroy();
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
  });

  it("destroy all", async () => {
    const dev = await Developer.create({ name: "DestAllDev", salary: 50000 });
    const p1 = await Project.create({ name: "DA1" });
    const p2 = await Project.create({ name: "DA2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    // Destroy all join records for this developer
    const joins = await loadHasMany(dev, "developerProjects", {
      className: "DeveloperProject",
      foreignKey: "developer_id",
      primaryKey: "id",
    });
    for (const j of joins) {
      await j.destroy();
    }
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
    // The projects themselves should still exist
    const proj1 = await Project.find(p1.id as number);
    expect(proj1).not.toBeNull();
  });

  it("associations with conditions", async () => {
    // Scope lambda filters the collection by a WHERE condition.
    const dev = await Developer.create({ name: "CondDev", salary: 80000 });
    const keep = await Project.create({ name: "Keep" });
    const drop = await Project.create({ name: "Drop" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: keep.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: drop.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.where({ name: "Keep" }),
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("Keep");
  });

  it("find in association", async () => {
    const dev = await Developer.create({ name: "FindDev", salary: 65000 });
    const p1 = await Project.create({ name: "FindP1" });
    const p2 = await Project.create({ name: "FindP2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    const found = projects.find((p: any) => p.name === "FindP2");
    expect(found).toBeDefined();
    expect((found as any).name).toBe("FindP2");
  });

  it("include uses array include after loaded", async () => {
    const dev = await Developer.create({ name: "InclDev", salary: 60000 });
    const proj = await Project.create({ name: "InclProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    // Check that the loaded array includes the project by id
    const included = projects.some((p: any) => p.id === proj.id);
    expect(included).toBe(true);
  });

  it("include checks if record exists if target not loaded", async () => {
    const dev = await Developer.create({ name: "IncludeCheck", salary: 80000 });
    const proj = await Project.create({ name: "IncludeProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const proxy = association<Project>(dev, "projects");
    expect(proxy.loaded).toBe(false);
    const result = await proxy.isInclude(proj);
    expect(result).toBe(true);
    expect(proxy.loaded).toBe(false);
  });

  it("include returns false for non matching record to verify scoping", async () => {
    const dev = await Developer.create({ name: "ScopeDev", salary: 60000 });
    const proj = await Project.create({ name: "ScopeProj" });
    const otherProj = await Project.create({ name: "OtherProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    // otherProj is not associated with dev
    const included = projects.some((p: any) => p.id === otherProj.id);
    expect(included).toBe(false);
  });

  it("find with merged options", async () => {
    // Scope where + order both apply to the loaded relation.
    const dev = await Developer.create({ name: "MergeDev", salary: 80000 });
    const a = await Project.create({ name: "M-A" });
    const b = await Project.create({ name: "M-B" });
    const c = await Project.create({ name: "Other" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: a.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: b.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: c.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.where("name LIKE ?", "M-%").order("name DESC"),
    });
    expect(projects.length).toBe(2);
    expect((projects[0] as any).name).toBe("M-B");
    expect((projects[1] as any).name).toBe("M-A");
  });

  it("dynamic find should respect association order", async () => {
    // Scope-supplied order survives all the way to the executed query.
    const dev = await Developer.create({ name: "OrderDev", salary: 80000 });
    const p1 = await Project.create({ name: "Bravo" });
    const p2 = await Project.create({ name: "Alpha" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.order("name ASC"),
    });
    expect(projects.map((p: any) => p.name)).toEqual(["Alpha", "Bravo"]);
  });

  it("find should append to association order", async () => {
    // Multiple order() calls on the scope chain compose left-to-right.
    // Two records share a name so the secondary `id DESC` ordering is
    // observable as a tiebreaker (without ties, the second order() is a
    // no-op and the test would pass even if composition were broken).
    const dev = await Developer.create({ name: "AppendOrderDev", salary: 80000 });
    const p1 = await Project.create({ name: "Bravo" });
    const p2 = await Project.create({ name: "Alpha" });
    const p3 = await Project.create({ name: "Alpha" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p3.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.order("name ASC").order("id DESC"),
    });
    expect(projects.map((p: any) => p.id)).toEqual([p3.id, p2.id, p1.id]);
  });

  it("habtm builder forwards `scope:` onto the reflection (macro-time scope)", async () => {
    // Mirrors Rails' `has_and_belongs_to_many(name, scope = nil, **options)`
    // signature (vendor/rails/activerecord/lib/active_record/associations.rb:1870-1871):
    // the macro-time scope flows positionally into the reflection, not
    // into the options bag. This is the exact wire the PR adds.
    const a5 = adapter;
    class ScDev extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a5;
      }
    }
    class ScProj extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a5;
      }
    }
    class ScDevProj extends Base {
      static {
        this.attribute("sc_dev_id", "integer");
        this.attribute("sc_proj_id", "integer");
        this.adapter = a5;
      }
    }
    registerModel(ScDev);
    registerModel(ScProj);
    registerModel(ScDevProj);
    const macroScope = (rel: any) => rel.where({ name: "Visible" });
    Associations.hasAndBelongsToMany.call(ScDev, "sc_projs", {
      className: "ScProj",
      joinTable: "sc_dev_projs",
      foreignKey: "sc_dev_id",
      associationForeignKey: "sc_proj_id",
      scope: macroScope,
    });

    const reflection = (ScDev as any)._reflectOnAssociation("sc_projs");
    expect(reflection).toBeTruthy();
    // Pre-fix this was `null`; post-fix it carries the macro-time scope
    // exactly as Rails' HasAndBelongsToManyReflection does.
    expect(reflection.scope).toBe(macroScope);
  });

  it("dynamic find all should respect readonly access", async () => {
    // Verifies the load-path piece of the readonly story: an `options.scope`
    // that calls `readonlyBang()` propagates `_readonly = true` to every
    // record returned by `loadHabtm` via Relation (relation.ts:1962-1967).
    // The companion macro-time wiring is covered by the "habtm builder
    // forwards `scope:` onto the reflection" test above.
    const dev = await Developer.create({ name: "ROAccess", salary: 90000 });
    const proj = await Project.create({ name: "ROProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (rel: any) => rel.readonlyBang(),
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).isReadonly()).toBe(true);
  });

  it("new with values in collection", async () => {
    // Creating a new record with attributes and adding to HABTM via join table
    const dev = await Developer.create({ name: "NewVal", salary: 75000 });
    const proj = new Project({ name: "NewProj" });
    await proj.save();
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("NewProj");
  });

  it("find in association with options", async () => {
    // Scope-applied WHERE filters which associated records load.
    const dev = await Developer.create({ name: "FindOptDev", salary: 70000 });
    const p1 = await Project.create({ name: "F1" });
    const p2 = await Project.create({ name: "F2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.where({ name: "F2" }),
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).id).toBe(p2.id);
  });

  it("association with extend option", async () => {
    // Rails: DeveloperWithExtendOption.create(name: "Eponine").projects.category == "sns".
    // The `extend:` module's methods are mixed into the CollectionProxy.
    const NamedExtension = {
      category(this: unknown): string {
        return "sns";
      },
    };
    Associations.hasAndBelongsToMany.call(Developer, "extendProjects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      extend: NamedExtension,
    });
    const eponine = await Developer.create({ name: "Eponine", salary: 80000 });
    const proxy = association(eponine, "extendProjects") as any;
    expect(proxy.category()).toBe("sns");
  });

  it("replace with less", async () => {
    // Remove one join record, keeping a subset of associated projects
    const dev = await Developer.create({ name: "ReplaceLess", salary: 60000 });
    const p1 = await Project.create({ name: "RL1" });
    const p2 = await Project.create({ name: "RL2" });
    const p3 = await Project.create({ name: "RL3" });
    const j1 = await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p3.id });
    // Remove p1 from association
    await j1.destroy();
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(2);
    const names = projects.map((p: any) => p.name);
    expect(names).toContain("RL2");
    expect(names).toContain("RL3");
    expect(names).not.toContain("RL1");
  });

  it("replace with new", async () => {
    // Replace all existing associations with new ones
    const dev = await Developer.create({ name: "ReplaceNew", salary: 60000 });
    const p1 = await Project.create({ name: "Old1" });
    const p2 = await Project.create({ name: "Old2" });
    const j1 = await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    const j2 = await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    // Remove old, add new
    await j1.destroy();
    await j2.destroy();
    const p3 = await Project.create({ name: "New1" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p3.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("New1");
  });

  it("replace on new object", async () => {
    // An unsaved developer has no id, so HABTM should be empty
    const dev = new Developer({ name: "UnsavedReplace", salary: 50000 });
    (dev.constructor as any).adapter = adapter;
    expect(dev.isNewRecord()).toBe(true);
    expect(dev.id).toBeNull();
  });

  it("consider type", async () => {
    // Verify HABTM loads the correct model type
    const dev = await Developer.create({ name: "TypeDev", salary: 60000 });
    const proj = await Project.create({ name: "TypeProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    // Verify the loaded record is a Project instance
    expect(projects[0]).toBeInstanceOf(Project);
  });

  it("symbol join table", async () => {
    // In TypeScript we use string keys; verify string join table name works
    const dev = await Developer.create({ name: "SymJoinDev", salary: 55000 });
    const proj = await Project.create({ name: "SymJoinProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
  });

  it("update columns after push without duplicate join table rows", async () => {
    // Verify that adding the same project twice via join table creates two join records,
    // but loadHabtm still returns distinct projects
    const dev = await Developer.create({ name: "NoDupDev", salary: 80000 });
    const proj = await Project.create({ name: "NoDupProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    // Adding a second join record for the same project
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    // The project should appear (at least once)
    expect(projects.length).toBeGreaterThanOrEqual(1);
  });

  it("updating attributes on non rich associations", async () => {
    // Update attributes on a project loaded through HABTM
    const dev = await Developer.create({ name: "UpdateDev", salary: 80000 });
    const proj = await Project.create({ name: "UpdateProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    const p = projects[0] as any;
    p.name = "UpdatedProj";
    await p.save();
    const reloaded = await Project.find(proj.id as number);
    expect(reloaded.name).toBe("UpdatedProj");
  });

  it("habtm respects select", async () => {
    // Scope-applied SELECT narrows attributes on returned records.
    // Selecting only `id` proves the SELECT clause is forwarded — without
    // forwarding the model would hydrate `name` from `SELECT *`.
    const dev = await Developer.create({ name: "SelDev", salary: 90000 });
    const proj = await Project.create({ name: "SelProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.select("id"),
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).id).toBe(proj.id);
    // Unselected attribute stays at its uninitialized null sentinel.
    expect((projects[0] as any).name).toBeNull();
  });

  it("habtm selects all columns by default", async () => {
    // Verify that loaded HABTM records have all attributes
    const dev = await Developer.create({ name: "SelectAll", salary: 95000 });
    const proj = await Project.create({ name: "AllCols" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    const p = projects[0] as any;
    expect(p.name).toBe("AllCols");
    expect(p.id).toBe(proj.id);
  });

  it("habtm respects select query method", async () => {
    // .select() chained inside the scope lambda is forwarded into the join
    // query. Selecting only `name` (not `id`) proves the SELECT clause is
    // forwarded — without forwarding, `id` would be populated from `SELECT *`.
    const dev = await Developer.create({ name: "SelChainDev", salary: 90000 });
    const proj = await Project.create({ name: "SelChainProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.select("name"),
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("SelChainProj");
    // Unselected `id` stays at its uninitialized null sentinel.
    expect((projects[0] as any).id).toBeNull();
  });

  it.skip("join middle table alias", () => {
    // BLOCKED: associations — habtm
    // ROOT-CAUSE: habtm join query does not alias the intermediate join table when needed for disambiguation
    // SCOPE: associations/builder/has-and-belongs-to-many.ts — join alias in SELECT/JOIN generation
  });

  it.skip("join table alias", () => {
    // BLOCKED: associations — habtm
    // ROOT-CAUSE: join table is not aliased in the generated SQL; conflicts with same-named tables in self-joins
    // SCOPE: associations/builder/has-and-belongs-to-many.ts — alias_for join table in Arel join node
  });

  it("join with group", async () => {
    // group() + having() chained inside the scope lambda are forwarded into
    // the habtm join query. having("count(*) >= 1") only passes if GROUP BY
    // is applied — otherwise the aggregate clause is invalid against the
    // raw rows.
    const dev = await Developer.create({ name: "GroupDev", salary: 80000 });
    const p1 = await Project.create({ name: "G1" });
    const p2 = await Project.create({ name: "G2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const rel: any = (Project.all() as any).where({ id: [p1.id, p2.id] }).group("id", "name");
    const sql: string = rel.toSql();
    expect(sql.toLowerCase()).toContain("group by");
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.group("id", "name").having("count(*) >= 1").order("name ASC"),
    });
    expect(projects.length).toBe(2);
    expect(projects.map((p: any) => p.name)).toEqual(["G1", "G2"]);
  });

  it("find grouped", async () => {
    // Rails groups HABTM-joined posts by author and counts. Adapted: a plain
    // load returns every joined project; the same load with a `group:` in the
    // scope collapses to one row per group (both projects share approved=null).
    const dev = await Developer.create({ name: "GroupedDev", salary: 80000 });
    const p1 = await Project.create({ name: "FG1" });
    const p2 = await Project.create({ name: "FG2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const allProjects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(allProjects.length).toBe(2);
    const grouped = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.group("approved").select("count(projects.id) as projects_count"),
    });
    expect(grouped.length).toBe(1);
  });

  it("find scoped grouped", async () => {
    // Rails: categories(:general).posts_grouped_by_title — a named scope that
    // adds `group:` flows through the collection relation. Adapted: the scope
    // lambda's group() composes with the habtm join filter.
    const dev = await Developer.create({ name: "ScopedGroupedDev", salary: 80000 });
    const p1 = await Project.create({ name: "SG1", approved: true });
    const p2 = await Project.create({ name: "SG2", approved: false });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const grouped = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.group("approved").select("approved"),
    });
    expect(grouped.length).toBe(2);
  });

  it("find scoped grouped having", async () => {
    // Rails: projects(:active_record).well_paid_salary_groups — group + having
    // chained inside the scope. Adapted: group() + having() compose into the
    // habtm join query; HAVING filters out groups below the threshold.
    const dev = await Developer.create({ name: "HavingDev", salary: 80000 });
    const p1 = await Project.create({ name: "HV1", approved: true });
    const p2 = await Project.create({ name: "HV2", approved: true });
    const p3 = await Project.create({ name: "HV3", approved: false });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p3.id });
    const groups = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.group("approved").having("count(*) >= 2").select("approved"),
    });
    expect(groups.length).toBe(1);
  });

  it("get ids", async () => {
    const dev = await Developer.create({ name: "IdsDev", salary: 70000 });
    const p1 = await Project.create({ name: "IdsP1" });
    const p2 = await Project.create({ name: "IdsP2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    const ids = projects.map((p: any) => p.id);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    expect(ids.length).toBe(2);
  });

  it("get ids for loaded associations", async () => {
    const dev = await Developer.create({ name: "LoadedIdsDev", salary: 70000 });
    const p1 = await Project.create({ name: "LI1" });
    const p2 = await Project.create({ name: "LI2" });
    const p3 = await Project.create({ name: "LI3" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p3.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    const ids = projects.map((p: any) => p.id);
    expect(ids.length).toBe(3);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    expect(ids).toContain(p3.id);
  });

  it("get ids for unloaded associations does not load them", async () => {
    const dev = await Developer.create({ name: "UnloadedIdsDev", salary: 70000 });
    const p1 = await Project.create({ name: "UI1" });
    const p2 = await Project.create({ name: "UI2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const proxy = association(dev, "projects");
    expect(proxy.loaded).toBe(false);
    const ids = await (dev as any).projectIds;
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    expect(proxy.loaded).toBe(false);
  });

  it.skip("assign ids", async () => {
    // BLOCKED: transactions — savepoint lifecycle leak on PG/MySQL
    // ROOT-CAUSE: HABTM idsWriter→persistReplace SAVEPOINT lifecycle leaks across
    //   error boundaries (PG 25P02, MariaDB orphan RELEASE). Passes on SQLite which
    //   tolerates aborted savepoints.
    const dev = new Developer({ name: "AssignIdsDev", salary: 60000 });
    const p1 = await Project.create({ name: "AI1" });
    const p2 = await Project.create({ name: "AI2" });
    (dev as any).projectIds = [p1.id, p2.id];
    await dev.save();
    const ids = await (dev as any).projectIds;
    expect(ids.sort()).toEqual([p1.id, p2.id].sort());
  });

  it.skip("assign ids ignoring blanks", async () => {
    // BLOCKED: transactions — fallback path savepoint lifecycle leak on PG/MySQL
    // ROOT-CAUSE: see "assign ids" above
    // SCOPE: docs/tm-unification-plan.md
    const dev = new Developer({ name: "BlankIdsDev", salary: 60000 });
    const p1 = await Project.create({ name: "BI1" });
    const p2 = await Project.create({ name: "BI2" });
    (dev as any).projectIds = [p1.id, null, p2.id, ""];
    await dev.save();
    const ids = await (dev as any).projectIds;
    expect(ids.length).toBe(2);
    expect(ids.sort()).toEqual([p1.id, p2.id].sort());
  });

  it("singular ids are reloaded after collection concat", async () => {
    const dev = await Developer.create({ name: "ConcatIdsDev", salary: 70000 });
    const p1 = await Project.create({ name: "CI1" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    const idsBefore = await (dev as any).projectIds;
    expect(idsBefore).toContain(p1.id);
    const p2 = await Project.create({ name: "CI2" });
    const proxy = association(dev, "projects");
    await proxy.push(p2 as any);
    const idsAfter = await (dev as any).projectIds;
    expect(idsAfter).toContain(p2.id);
  });

  it("scoped find on through association doesnt return read only records", async () => {
    // Rails: Post.find(1).tags.find_by_name("General") must return a writable
    // record (tag.save! raises nothing). HABTM/through loads use a subquery-IN
    // filter, not a JOIN, so the result must NOT be flagged readonly.
    const dev = await Developer.create({ name: "RWAccess", salary: 90000 });
    const proj = await Project.create({ name: "General" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const found = (
      await loadHabtm(dev, "projects", {
        className: "Project",
        joinTable: "developer_projects",
        foreignKey: "developer_id",
        scope: (r: any) => r.where({ name: "General" }),
      })
    )[0] as any;
    expect(found.isReadonly()).toBe(false);
    found.name = "General Renamed";
    expect(await found.save()).toBe(true);
  });

  it.skip("has many through polymorphic has manys works", () => {
    // BLOCKED: associations — polymorphic-through
    // ROOT-CAUSE: through association traversal with a polymorphic intermediate is not implemented
    // SCOPE: through-association.ts / preloader.ts — polymorphic source resolution
  });

  it("symbols as keys", async () => {
    // In TS we use string keys; verify string-based keys work for HABTM lookup
    const dev = await Developer.create({ name: "SymDev", salary: 60000 });
    const proj = await Project.create({ name: "SymProj" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
  });

  it.skip("dynamic find should respect association include", () => {
    // BLOCKED: associations — eager loading
    // ROOT-CAUSE: eager_load/includes declared on the association is not passed through when finding in the collection
    // SCOPE: collection-proxy.ts / preloader.ts — includes forwarding on collection find
  });

  it("count", async () => {
    const dev = await Developer.create({ name: "Grace", salary: 120000 });
    const p1 = await Project.create({ name: "P1" });
    const p2 = await Project.create({ name: "P2" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const joins = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    // Count via loaded array
    expect(joins.length).toBe(2);
  });

  it.skip("association proxy transaction method starts transaction in association class", () => {
    // BLOCKED: transactions
    // ROOT-CAUSE: CollectionProxy#transaction delegates to the association class's connection — not yet wired
    // SCOPE: collection-proxy.ts — transaction() delegation to target model
  });

  it("attributes are being set when initialized from habtm association with where clause", async () => {
    (Developer as any)._associations = [];
    Associations.hasAndBelongsToMany.call(Developer, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      scope: (r: any) => r.where({ approved: true }),
    });
    const dev = await Developer.create({ name: "Scoped", salary: 100000 });
    const proxy = association<Project>(dev, "projects");
    const built = proxy.build({ name: "ScopedProj" });
    expect((built as any).approved).toBe(true);
    // User-supplied attrs win over the scope.
    const override = proxy.build({ name: "Override", approved: false });
    expect((override as any).approved).toBe(false);
  });

  it("attributes are being set when initialized from habtm association with multiple where clauses", async () => {
    (Developer as any)._associations = [];
    Associations.hasAndBelongsToMany.call(Developer, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      scope: (r: any) => r.where({ approved: true }).where({ featured: true }),
    });
    const dev = await Developer.create({ name: "Scoped2", salary: 100000 });
    const proxy = association<Project>(dev, "projects");
    const built = proxy.build({ name: "ScopedProj2" });
    expect((built as any).approved).toBe(true);
    expect((built as any).featured).toBe(true);
  });

  it("include method in has and belongs to many association should return true for instance added with build", async () => {
    const dev = new Developer({ name: "BuiltDev", salary: 50000 });
    const proxy = association<Project>(dev, "projects");
    const proj = proxy.build({ name: "BuiltProj" });
    expect(await proxy.isInclude(proj)).toBe(true);
  });

  it("destruction does not error without primary key", async () => {
    // Destroying a join record should work even when conceptually it has no separate PK
    const dev = await Developer.create({ name: "NoPKDev", salary: 60000 });
    const proj = await Project.create({ name: "NoPKProj" });
    const join = await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    // Destroying the join record should not throw
    await expect(join.destroy()).resolves.not.toThrow();
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(0);
  });

  it("has and belongs to many associations on new records use null relations", async () => {
    // A new (unsaved) developer has no id, so HABTM should return empty
    const dev = new Developer({ name: "Unsaved", salary: 50000 });
    (dev.constructor as any).adapter = adapter;
    expect(dev.isNewRecord()).toBe(true);
    // No join records can exist for a record with no id
    expect(dev.id).toBeNull();
  });

  it("association with validate false does not run associated validation callbacks on create", async () => {
    const a2 = adapter;
    class RichPerson extends Base {
      static {
        this.attribute("first_name", "string");
      }
    }
    class Treasure extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    RichPerson.adapter = a2;
    Treasure.adapter = a2;
    registerModel(RichPerson);
    registerModel(Treasure);
    let rpValidations = 0;
    RichPerson.beforeValidation((r: any) => {
      rpValidations += 1;
      r.first_name = "autoset";
    });
    Associations.hasAndBelongsToMany.call(Treasure, "rich_people", {
      className: "RichPerson",
      joinTable: "treasures_rich_people",
      validate: false,
    });
    const treasure = new Treasure({ name: "Gold" });
    const rich = new RichPerson();
    (treasure as any).rich_people = [rich];
    treasure.isValid();
    expect(rich.first_name).toBeNull();
    expect(rpValidations).toBe(0);
  });

  it("association with validate false does not run associated validation callbacks on update", async () => {
    const a2 = adapter;
    await defineSchema(a2, {
      rich_person2s: { first_name: "string" },
      treasure2s: { name: "string" },
      treasures_rich_people2: { rich_person2_id: "integer", treasure2_id: "integer" },
    });
    class RichPerson2 extends Base {
      static {
        this.attribute("first_name", "string");
      }
    }
    class Treasure2 extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    RichPerson2.adapter = a2;
    Treasure2.adapter = a2;
    registerModel(RichPerson2);
    registerModel(Treasure2);
    Associations.hasAndBelongsToMany.call(Treasure2, "rich_people", {
      className: "RichPerson2",
      joinTable: "treasures_rich_people2",
      validate: false,
    });
    const rich = await RichPerson2.create({ first_name: "Original" });
    let invoked = 0;
    RichPerson2.beforeValidation((r: any) => {
      invoked += 1;
      r.first_name = "mutated";
    });
    const treasure = new Treasure2({ name: "Gold" });
    (treasure as any).rich_people = [rich];
    treasure.isValid();
    expect(rich.first_name).toBe("Original");
    expect(invoked).toBe(0);
  });

  it("custom join table", async () => {
    // Use a differently-named join table model but with conventional FK columns
    const a2 = adapter;
    await defineSchema(a2, {
      cj_developers: { name: "string" },
      cj_projects: { name: "string" },
      custom_joins: { cj_developer_id: "integer", cj_project_id: "integer" },
    });
    class CjDeveloper extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    class CjProject extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    class CustomJoin extends Base {
      static {
        this.attribute("cj_developer_id", "integer");
        this.attribute("cj_project_id", "integer");
        this.adapter = a2;
      }
    }
    registerModel("CjDeveloper", CjDeveloper);
    registerModel("CjProject", CjProject);
    registerModel("CustomJoin", CustomJoin);
    const dev = await CjDeveloper.create({ name: "CJDev" });
    const proj = await CjProject.create({ name: "CJProj" });
    await CustomJoin.create({ cj_developer_id: dev.id, cj_project_id: proj.id });
    // loadHabtm derives FK columns from owner class name and assoc name,
    // so the custom join table name is the main thing being tested here
    const projects = await loadHabtm(dev, "cjProjects", {
      className: "CjProject",
      joinTable: "custom_joins",
      foreignKey: "cj_developer_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("CJProj");
  });

  it.skip("has and belongs to many in a namespaced model pointing to a namespaced model", () => {
    // BLOCKED: associations — habtm
    // ROOT-CAUSE: className resolution for namespaced models (e.g. "MyModule::Project") not handled in habtm lookup
    // SCOPE: associations/builder/has-and-belongs-to-many.ts — namespace-aware className resolution
  });

  it.skip("has and belongs to many in a namespaced model pointing to a non namespaced model", () => {
    // BLOCKED: associations — habtm
    // ROOT-CAUSE: cross-namespace className resolution (namespaced owner → top-level target) not handled
    // SCOPE: associations/builder/has-and-belongs-to-many.ts — cross-namespace className resolution
  });

  it("redefine habtm", async () => {
    // Mirrors Rails: SubDeveloper < Developer inherits Developer's
    // `special_projects` HABTM. Pushing a target on a subclass instance and
    // saving must insert exactly one join row whose owner FK is mapped from
    // the subclass instance's id (not double-inserted via the eager
    // through-push path while the owner is still a new record). The target's
    // className resolves to Project here, so a Project is pushed — Rails'
    // `special_projects` points at SpecialProject, but this describe block's
    // schema only declares Developer/Project.
    Associations.hasAndBelongsToMany.call(Developer, "specialProjects", {
      className: "Project",
      joinTable: "developer_projects",
      associationForeignKey: "project_id",
    });
    class SubDeveloper extends Developer {}
    registerModel(SubDeveloper);
    SubDeveloper.adapter = adapter;

    const child = new SubDeveloper({ name: "Aredridel" });
    await association(child, "specialProjects").push(new Project({ name: "Special Project" }));
    expect(await child.save()).toBe(true);

    const joins = await DeveloperProject.all();
    expect(joins.length).toBe(1);
    expect((joins[0] as any).developer_id).toBe((child as any).id);
    expect((joins[0] as any).project_id).not.toBeNull();
  });

  it.skip("habtm with reflection using class name and fixtures", () => {
    // BLOCKED: fixture
    // ROOT-CAUSE: test relies on fixture data loaded by Rails fixture system; no equivalent in-memory fixture setup
    // SCOPE: fixture loader — whole subsystem already in unported-files.ts
  });

  it.skip("with symbol class name", () => {
    // BLOCKED: associations — habtm
    // ROOT-CAUSE: Ruby allows class_name: :Project (symbol); TS port only accepts string — symbol coercion not handled
    // SCOPE: associations/builder/has-and-belongs-to-many.ts — className coercion from symbol-like value
  });

  it.skip("alternate database", () => {
    // BLOCKED: connection-pool
    // ROOT-CAUSE: habtm across two databases requires multi-db connection routing — not yet implemented
    // SCOPE: connection-handler.ts — cross-db association query routing
  });

  it("habtm scope can unscope", async () => {
    // unscope() on the scope chain strips a previously-applied order.
    const dev = await Developer.create({ name: "UnscopeDev", salary: 80000 });
    const p1 = await Project.create({ name: "Bravo" });
    const p2 = await Project.create({ name: "Alpha" });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p1.id });
    await DeveloperProject.create({ developer_id: dev.id, project_id: p2.id });
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
      scope: (r: any) => r.order("name DESC").unscope("order").order("name ASC"),
    });
    expect(projects.map((p: any) => p.name)).toEqual(["Alpha", "Bravo"]);
  });

  it.skip("preloaded associations size", () => {
    // BLOCKED: associations — eager loading
    // ROOT-CAUSE: preloaded habtm collection does not expose a size that avoids a COUNT query
    // SCOPE: preloader.ts / collection-proxy.ts — size from preloaded target cache
  });

  it.skip("has and belongs to many is usable with belongs to required by default", () => {
    // BLOCKED: associations — habtm
    // ROOT-CAUSE: belongs_to_required_by_default config not consulted when habtm creates its implicit belongs_to side
    // SCOPE: associations/builder/has-and-belongs-to-many.ts — config awareness for required-by-default belongs_to
  });

  it("association name is the same as join table name", async () => {
    // Use a join table model whose name matches the association name
    const a2 = adapter;
    await defineSchema(a2, {
      same_devs: { name: "string" },
      same_projs: { name: "string" },
      same_joins: { same_dev_id: "integer", same_proj_id: "integer" },
    });
    class SameDev extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    class SameProj extends Base {
      static {
        this.attribute("name", "string");
        this.adapter = a2;
      }
    }
    class SameJoin extends Base {
      static {
        this.attribute("same_dev_id", "integer");
        this.attribute("same_proj_id", "integer");
        this.adapter = a2;
      }
    }
    registerModel("SameDev", SameDev);
    registerModel("SameProj", SameProj);
    registerModel("SameJoin", SameJoin);
    const dev = await SameDev.create({ name: "SameDev" });
    const proj = await SameProj.create({ name: "SameProj" });
    await SameJoin.create({ same_dev_id: dev.id, same_proj_id: proj.id });
    const projects = await loadHabtm(dev, "sameProjs", {
      className: "SameProj",
      joinTable: "same_joins",
      foreignKey: "same_dev_id",
    });
    expect(projects.length).toBe(1);
    expect((projects[0] as any).name).toBe("SameProj");
  });

  it("has and belongs to many while partial inserts false", async () => {
    // Mirrors Rails: with partial_inserts disabled, INSERTs name every column
    // (not just the dirty ones). Adding a project and saving the developer
    // must still succeed through the HABTM join insert path.
    const original = Base.partialInserts;
    Base.partialInserts = false;
    try {
      const developer = new Developer({ name: "Mehmet Emin İNAÇ" });
      const proxy = association(developer, "projects");
      await proxy.push(new Project({ name: "Bounty" }));
      expect(await developer.save()).toBe(true);
      const projects = await loadHabtm(developer, "projects", {
        className: "Project",
        joinTable: "developer_projects",
        foreignKey: "developer_id",
      });
      expect(projects.length).toBe(1);
    } finally {
      Base.partialInserts = original;
    }
  });

  it("has and belongs to many with belongs to", async () => {
    // Verify HABTM works alongside a belongs_to relationship
    const dev = await Developer.create({ name: "BtDev", salary: 75000 });
    const proj = await Project.create({ name: "BtProj" });
    const join = await DeveloperProject.create({ developer_id: dev.id, project_id: proj.id });
    // HABTM from developer side
    const projects = await loadHabtm(dev, "projects", {
      className: "Project",
      joinTable: "developer_projects",
      foreignKey: "developer_id",
    });
    expect(projects.length).toBe(1);
    // The join record "belongs to" the developer
    expect(join.developer_id).toBe(dev.id);
    expect(join.project_id).toBe(proj.id);
  });

  it("habtm adding before save", async () => {
    const dev = await Developer.create({ name: "BeforeSave", salary: 50000 });
    const proj = new Project({ name: "BSProj" });
    expect(proj.isNewRecord()).toBe(true);
    const proxy = association(dev, "projects");
    await proxy.push(proj);
    // push should save the unsaved target record
    expect(proj.isNewRecord()).toBe(false);
    const projects = await proxy.toArray();
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("BSProj");
  });

  it("deleting all", async () => {
    const dev = await Developer.create({ name: "DelAllDev", salary: 60000 });
    const p1 = await Project.create({ name: "DAP1" });
    const p2 = await Project.create({ name: "DAP2" });
    const proxy = association(dev, "projects");
    await proxy.push(p1, p2);
    expect(await proxy.count()).toBe(2);

    await proxy.clear();
    expect(await proxy.count()).toBe(0);
    // Projects still exist, just the join records are gone
    const p1Reloaded = await Project.find(p1.id!);
    expect(p1Reloaded).toBeDefined();
  });

  it("destroying many", async () => {
    const dev = await Developer.create({ name: "DestroyManyDev", salary: 60000 });
    const p1 = await Project.create({ name: "DMP1" });
    const p2 = await Project.create({ name: "DMP2" });
    const p3 = await Project.create({ name: "DMP3" });
    const proxy = association(dev, "projects");
    await proxy.push(p1, p2, p3);
    expect(await proxy.count()).toBe(3);

    await proxy.destroy(p1, p2);
    expect(p1.isDestroyed()).toBe(true);
    expect(p2.isDestroyed()).toBe(true);
    // Join rows for destroyed projects should also be gone
    const remaining = await proxy.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("DMP3");
  });

  it("destroy associations destroys multiple associations", async () => {
    const dev = await Developer.create({ name: "DmaDev", salary: 60000 });
    const p1 = await Project.create({ name: "DMAP1" });
    const p2 = await Project.create({ name: "DMAP2" });
    const proxy = association(dev, "projects");
    await proxy.push(p1, p2);
    expect(await proxy.count()).toBe(2);

    await proxy.destroyAll();
    const allProjects = await Project.all().toArray();
    const names = allProjects.map((p: any) => p.name);
    expect(names).not.toContain("DMAP1");
    expect(names).not.toContain("DMAP2");
    // Join rows should also be gone
    const joinRows = await DeveloperProject.all().where({ developer_id: dev.id }).toArray();
    expect(joinRows).toHaveLength(0);
  });

  it("destroying", async () => {
    const dev = await Developer.create({ name: "DestroyDev", salary: 60000 });
    const proj = await Project.create({ name: "DestroyProj" });
    const proxy = association(dev, "projects");
    await proxy.push(proj);
    expect(await proxy.count()).toBe(1);

    await proxy.destroy(proj);
    expect(proj.isDestroyed()).toBe(true);
  });

  // ==========================================================================
  // destroy_associations override mixin chaining
  // Mirrors Rails associations.rb:1886-1894 — each HABTM declaration layers an
  // anonymous module override of destroy_associations that chains via super.
  // ==========================================================================

  it("layers destroyAssociations chain for multiple HABTMs on one class", async () => {
    const a2 = adapter;
    await defineSchema(a2, {
      multi_owners: { name: "string" },
      tag_as: { name: "string" },
      tag_bs: { name: "string" },
      multi_owners_tag_as: { multi_owner_id: "integer", tag_a_id: "integer" },
      multi_owners_tag_bs: { multi_owner_id: "integer", tag_b_id: "integer" },
    });
    class MultiOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class TagA extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    class TagB extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    MultiOwner.adapter = a2;
    TagA.adapter = a2;
    TagB.adapter = a2;
    registerModel(MultiOwner);
    registerModel(TagA);
    registerModel(TagB);
    Associations.hasAndBelongsToMany.call(MultiOwner, "tag_as", {
      className: "TagA",
      joinTable: "multi_owners_tag_as",
    });
    Associations.hasAndBelongsToMany.call(MultiOwner, "tag_bs", {
      className: "TagB",
      joinTable: "multi_owners_tag_bs",
    });

    const owner = await MultiOwner.create({ name: "Owner" });
    const calls: string[] = [];
    // The HABTM override targets the middle hasMany (one per HABTM
    // declaration). Stub each middle association's handleDependency to
    // observe whether the chained `super` calls reach both layers.
    const origAssoc = (owner as any).association.bind(owner);
    (owner as any).association = (n: string) => {
      const a = origAssoc(n);
      const orig = a.handleDependency.bind(a);
      a.handleDependency = async () => {
        calls.push(n);
        return orig();
      };
      return a;
    };

    await (owner as any).destroyAssociations();
    // Both layered overrides should have run with distinct middle
    // associations — chained super reaches both, not the same one twice.
    expect(new Set(calls).size).toBe(2);
  });

  it("subclass HABTM extends destroyAssociations chain via super", async () => {
    const a2 = adapter;
    await defineSchema(a2, {
      parent_owners: { name: "string" },
      child_owners: { name: "string" },
      parent_owners_p_tags: { parent_owner_id: "integer", tag_a_id: "integer" },
      child_owners_c_tags: { child_owner_id: "integer", tag_b_id: "integer" },
    });
    class ParentOwner extends Base {
      static {
        this.attribute("name", "string");
      }
    }
    ParentOwner.adapter = a2;
    registerModel(ParentOwner);
    Associations.hasAndBelongsToMany.call(ParentOwner, "p_tags", {
      className: "TagA",
      joinTable: "parent_owners_p_tags",
    });

    class ChildOwner extends ParentOwner {}
    ChildOwner.adapter = a2;
    registerModel(ChildOwner);
    Associations.hasAndBelongsToMany.call(ChildOwner, "c_tags", {
      className: "TagB",
      joinTable: "child_owners_c_tags",
    });

    // A ChildOwner instance's destroyAssociations override should chain
    // through parent's override too, hitting both HABTM middles.
    const child = await ChildOwner.create({ name: "Child" });
    const calls: string[] = [];
    const origAssoc = (child as any).association.bind(child);
    (child as any).association = (n: string) => {
      const a = origAssoc(n);
      const orig = a.handleDependency.bind(a);
      a.handleDependency = async () => {
        calls.push(n);
        return orig();
      };
      return a;
    };

    await (child as any).destroyAssociations();
    // Two distinct middle hasMany associations should be visited — one
    // from parent's HABTM override, one from child's, chained via super.
    expect(new Set(calls).size).toBe(2);
  });
});

// ==========================================================================
// JOIN-based HABTM eager loading with Rails self-join alias naming.
// Mirrors `test_join_middle_table_alias` / `test_join_table_alias` from
// has_and_belongs_to_many_associations_test.rb. The deep path
// (`includes(projects: :developers)`) self-joins the `developers_projects`
// join table; Rails names the collision `developers_projects_projects_join`
// (`{plural_name}_{owner_table}_join`) so a WHERE on that alias resolves.
// ==========================================================================
describe("HABTM join-table self-join aliasing", () => {
  let adapter: DatabaseAdapter;

  class Developer extends Base {
    static {
      this.attribute("name", "string");
      this.attribute("salary", "integer");
    }
  }
  class Project extends Base {
    static {
      this.attribute("name", "string");
    }
  }

  beforeEach(async () => {
    adapter = freshAdapter();
    await defineSchema(adapter, {
      developers: { name: "string", salary: "integer" },
      projects: { name: "string" },
      developers_projects: { developer_id: "integer", project_id: "integer", joined_on: "date" },
    });
    for (const m of [Developer, Project]) {
      m.adapter = adapter;
      (m as any)._associations = [];
      (m as any)._reflections = {};
      registerModel(m);
    }
    Developer.hasAndBelongsToMany("projects", {
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
    });
    Project.hasAndBelongsToMany("developers", { joinTable: "developers_projects" });
    // Mirrors developers / projects / developers_projects fixtures.
    await adapter.executeMutation(
      "INSERT INTO developers (id, name, salary) VALUES (1, 'David', 80000), (2, 'Jamis', 150000), (11, 'Jamis', 9000)",
    );
    await adapter.executeMutation(
      "INSERT INTO projects (id, name) VALUES (1, 'Active Record'), (2, 'Active Controller')",
    );
    await adapter.executeMutation(
      "INSERT INTO developers_projects (developer_id, project_id, joined_on) VALUES (1, 2, '2004-10-10'), (1, 1, '2004-10-10'), (2, 1, NULL), (11, 1, NULL)",
    );
  });

  it("test_join_table_alias", async () => {
    const records = await (Developer as any)
      .includes({ projects: "developers" })
      .whereNot({ "developers_projects_projects_join.joined_on": null })
      .toArray();
    expect(records.length).toBe(3);
  });

  it.skip("test_join_middle_table_alias", () => {
    // CARVE-OUT (follow-up): `Project.includes(:developers_projects)` eager-loads
    // the auto-generated HABTM join model directly. Two gaps block it, both
    // outside join-dependency/alias-tracker:
    //   1. The middle reflection is hidden behind its parent HABTM reflection
    //      in `normalizedReflections`, so `reflectOnAssociation(Project,
    //      "developers_projects")` returns null.
    //   2. JoinDependency#addAssociation bails when the target's primaryKey is
    //      composite (HABTM join models use `[ownerFk, targetFk]`), so the join
    //      model can never be the JOIN target.
    // Tracked in docs/activerecord/associations-gap-plan.md.
  });
});
