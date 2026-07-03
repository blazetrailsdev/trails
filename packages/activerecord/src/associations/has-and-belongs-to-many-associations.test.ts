/**
 * Mirrors Rails activerecord/test/cases/associations/has_and_belongs_to_many_associations_test.rb
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { Base, registerModel, AssociationTypeMismatch, ReadOnlyRecord } from "../index.js";
import { assertNoQueries, assertQueriesCount } from "../testing/query-assertions.js";
import { fixtures } from "../test-helpers/fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import { Project, SpecialProject } from "../test-helpers/models/project.js";
import {
  Developer,
  SubDeveloper,
  DeveloperWithBeforeDestroyRaise,
  AuditLog,
  LazyBlockDeveloperCalledDavid,
} from "../test-helpers/models/developer.js";
import { acceptsNestedAttributesFor } from "../nested-attributes.js";
import { Mentor } from "../test-helpers/models/mentor.js";
import { Tag } from "../test-helpers/models/tag.js";
import { Tagging } from "../test-helpers/models/tagging.js";
import { Category } from "../test-helpers/models/category.js";
import { Post } from "../test-helpers/models/post.js";
import { Author } from "../test-helpers/models/author.js";
import { Categorization } from "../test-helpers/models/categorization.js";
import { Country } from "../test-helpers/models/country.js";
import { Treaty } from "../test-helpers/models/treaty.js";
import { Vertex } from "../test-helpers/models/vertex.js";
import { Student } from "../test-helpers/models/student.js";
import { Lesson } from "../test-helpers/models/lesson.js";
import { User } from "../test-helpers/models/user.js";
import { Parrot } from "../test-helpers/models/parrot.js";
import { Pirate } from "../test-helpers/models/pirate.js";
import { Treasure } from "../test-helpers/models/treasure.js";
import { PriceEstimate } from "../test-helpers/models/price-estimate.js";
import { RichPerson } from "../test-helpers/models/person.js";
import { Job } from "../test-helpers/models/job.js";
import { Computer } from "../test-helpers/models/computer.js";
import { PublisherArticle, PublisherMagazine } from "../test-helpers/models/publisher.js";
import { Professor } from "../test-helpers/models/professor.js";
import { Course } from "../test-helpers/models/course.js";
import { setupSecondPool } from "../test-helpers/setup-second-pool.js";
import { isSqliteRun } from "../test-helpers/sqlite-template.js";

// Test-file-local models mirroring the Rails fixture file's inline class
// definitions (has_and_belongs_to_many_associations_test.rb:63-90).
class ProjectWithSymbolsForKeys extends Base {
  static {
    this.tableName = "projects";
    this.hasAndBelongsToMany("developers", {
      className: "DeveloperWithSymbolsForKeys",
      joinTable: "developers_projects",
      foreignKey: "project_id",
      associationForeignKey: "developer_id",
    });
  }
}

class DeveloperWithSymbolsForKeys extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      className: "ProjectWithSymbolsForKeys",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      foreignKey: "developer_id",
    });
  }
}

class DeveloperWithSymbolClassName extends Developer {
  static {
    // Rails: `class_name: :ProjectWithSymbolsForKeys` (a Symbol). The faithful
    // JS analogue of a Ruby symbol is `Symbol("…")`; the HABTM builder coerces
    // it to its description, mirroring Rails' `class_name.to_s`.
    this.hasAndBelongsToMany("projects", {
      className: Symbol("ProjectWithSymbolsForKeys") as unknown as string,
    });
  }
}

class DeveloperForProjectWithAfterCreateHook extends Base {
  static {
    this.tableName = "developers";
    this.hasAndBelongsToMany("projects", {
      className: "ProjectWithAfterCreateHook",
      joinTable: "developers_projects",
      associationForeignKey: "project_id",
      foreignKey: "developer_id",
    });
  }
}

class ProjectWithAfterCreateHook extends Base {
  static {
    this.tableName = "projects";
    this.hasAndBelongsToMany("developers", {
      className: "DeveloperForProjectWithAfterCreateHook",
      joinTable: "developers_projects",
      foreignKey: "project_id",
      associationForeignKey: "developer_id",
    });

    // Rails: `after_create :add_david` → `david.projects << self`.
    this.afterCreate(async function (record: any) {
      const david = await DeveloperForProjectWithAfterCreateHook.findBy({ name: "David" });
      await (david as any).projects.push(record);
    });
  }
}

class DeveloperWithExtendOption extends Developer {
  // Rails: `module NamedExtension; def category; "sns"; end; end`.
  static namedExtension = {
    category(): string {
      return "sns";
    },
  };

  static {
    this.hasAndBelongsToMany("projects", { extend: DeveloperWithExtendOption.namedExtension });
  }
}

class ProjectUnscopingDavidDefaultScope extends Base {
  static {
    this.tableName = "projects";
    this.hasAndBelongsToMany("developers", {
      scope: (q: any) => q.unscope({ where: "name" }),
      className: "LazyBlockDeveloperCalledDavid",
      joinTable: "developers_projects",
      foreignKey: "project_id",
      associationForeignKey: "developer_id",
    });
  }
}

class Kitchen extends Base {
  static {
    this.hasOne("sink");
  }
}

class Sink extends Base {
  static {
    this.hasAndBelongsToMany("sources", {
      joinTable: "edges",
      className: "Source",
      foreignKey: "sink_id",
      associationForeignKey: "source_id",
    });
    this.belongsTo("kitchen");
  }
}
acceptsNestedAttributesFor(Sink, "kitchen");

class Source extends Base {
  static {
    this.tableName = "humans";
    this.hasAndBelongsToMany("sinks", {
      joinTable: "edges",
      className: "Sink",
      foreignKey: "source_id",
      associationForeignKey: "sink_id",
    });
  }
}

// ==========================================================================
// HasAndBelongsToManyAssociationsTest — mirrors
// has_and_belongs_to_many_associations_test.rb, ported onto the canonical
// Developer/Project models + developers_projects fixtures.
// ==========================================================================
describe("HasAndBelongsToManyAssociationsTest", () => {
  const { developers, projects, computers } = fixtures(
    [
      "developers",
      "projects",
      "developersProjects",
      "computers",
      "categories",
      "posts",
      "categoriesPosts",
      "authors",
      "categorizations",
      "tags",
      "taggings",
      "parrots",
      "pirates",
      "parrotsPirates",
      "treasures",
      "parrotsTreasures",
      "priceEstimates",
    ],
    { schema: canonicalSchema },
  );

  beforeAll(async () => {
    for (const m of [
      Developer,
      SubDeveloper,
      DeveloperWithBeforeDestroyRaise,
      AuditLog,
      Mentor,
      Project,
      SpecialProject,
      Category,
      Post,
      Author,
      Categorization,
      Country,
      Treaty,
      Vertex,
      Student,
      Lesson,
      User,
      Job,
      Parrot,
      Pirate,
      Treasure,
      RichPerson,
      Tag,
      Tagging,
      Computer,
      PublisherArticle,
      PublisherMagazine,
      ProjectWithSymbolsForKeys,
      DeveloperWithSymbolsForKeys,
      DeveloperWithSymbolClassName,
      DeveloperForProjectWithAfterCreateHook,
      ProjectWithAfterCreateHook,
      DeveloperWithExtendOption,
      ProjectUnscopingDavidDefaultScope,
      LazyBlockDeveloperCalledDavid,
      Kitchen,
      Sink,
      Source,
      PriceEstimate,
    ]) {
      registerModel(m as any);
    }
    await Country.loadSchema();
    await Treaty.loadSchema();
  });

  it.skip("marshal dump", () => {
    // PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — marshal
  });

  it("should property quote string primary keys", async () => {
    const country = await Country.create({ country_id: "c1", name: "India" });
    const treaty = Treaty.new({ treaty_id: "t1", name: "peace" });
    await country.treaties.push(treaty);

    const con = Base.connection;
    const rows = await con.selectRows("select * from countries_treaties");
    const record = rows[rows.length - 1] as string[];
    expect(record[0]).toBe("c1");
    expect(record[1]).toBe("t1");
  });

  it("proper usage of primary keys and join table", async () => {
    const country = await Country.create({ country_id: "c1", name: "India" });
    const treaty = Treaty.new({ treaty_id: "t1", name: "peace" });
    await country.treaties.push(treaty);

    expect(Country.primaryKey).toBe("country_id");
    expect(Treaty.primaryKey).toBe("treaty_id");

    const found = await Country.first();
    expect(await found!.treaties.count()).toBe(1);
  });

  it("has and belongs to many", async () => {
    const david = await Developer.find(1);
    expect((await david.projects.toArray()).length).toBeGreaterThan(0);
    expect(await david.projects.size()).toBe(2);

    const activeRecord = await Project.find(1);
    const devs = await activeRecord.developers.toArray();
    expect(devs.length).toBe(3);
    expect(devs.map((d) => d.id)).toContain(david.id);
  });

  it("adding single", async () => {
    const jamis = await Developer.find(2);
    await jamis.projects.reload();
    const actionController = await Project.find(2);
    expect(await jamis.projects.size()).toBe(1);
    expect(await actionController.developers.size()).toBe(1);

    await jamis.projects.push(actionController);

    expect(await jamis.projects.size()).toBe(2);
    expect(await (await jamis.projects.reload()).size()).toBe(2);
    expect(await (await actionController.developers.reload()).size()).toBe(2);
  });

  it("adding type mismatch", async () => {
    const jamis = await Developer.find(2);
    await expect(jamis.projects.push(null as any)).rejects.toThrow(AssociationTypeMismatch);
    await expect(jamis.projects.push(1 as any)).rejects.toThrow(AssociationTypeMismatch);
  });

  it("adding from the project", async () => {
    const jamis = await Developer.find(2);
    const actionController = await Project.find(2);
    await actionController.developers.reload();
    expect(await jamis.projects.size()).toBe(1);
    expect(await actionController.developers.size()).toBe(1);

    await actionController.developers.push(jamis);

    expect(await (await jamis.projects.reload()).size()).toBe(2);
    expect(await actionController.developers.size()).toBe(2);
    expect(await (await actionController.developers.reload()).size()).toBe(2);
  });

  it("adding from the project fixed timestamp", async () => {
    const jamis = await Developer.find(2);
    const actionController = await Project.find(2);
    await actionController.developers.reload();
    const updatedAt = String((jamis as any).updated_at);

    await actionController.developers.push(jamis);

    expect(String((jamis as any).updated_at)).toBe(updatedAt);
    expect(await (await jamis.projects.reload()).size()).toBe(2);
    expect(await actionController.developers.size()).toBe(2);
    expect(await (await actionController.developers.reload()).size()).toBe(2);
  });

  it("adding multiple", async () => {
    const aredridel = await Developer.create({ name: "Aredridel", salary: 50000 });
    await aredridel.projects.reload();
    await aredridel.projects.push(await Project.find(1), await Project.find(2));
    expect(await aredridel.projects.size()).toBe(2);
    expect(await (await aredridel.projects.reload()).size()).toBe(2);
  });

  it("adding a collection", async () => {
    const aredridel = await Developer.create({ name: "Aredridel", salary: 50000 });
    await aredridel.projects.reload();
    await aredridel.projects.concat(await Project.find(1), await Project.find(2));
    expect(await aredridel.projects.size()).toBe(2);
    expect(await (await aredridel.projects.reload()).size()).toBe(2);
  });

  it("habtm adding before save", async () => {
    const noOfDevels = Number(await Developer.count());
    const noOfProjects = Number(await Project.count());
    const aredridel = new Developer({ name: "Aredridel", salary: 50000 });
    const projekt = new Project({ name: "Projekt" });
    await aredridel.projects.concat(await Project.find(1), projekt);
    expect(aredridel.isNewRecord()).toBe(true);
    expect(projekt.isNewRecord()).toBe(true);
    expect(await aredridel.save()).toBe(true);
    expect(aredridel.isNewRecord()).toBe(false);
    expect(Number(await Developer.count())).toBe(noOfDevels + 1);
    expect(Number(await Project.count())).toBe(noOfProjects + 1);
    expect(await aredridel.projects.size()).toBe(2);
    expect(await (await aredridel.projects.reload()).size()).toBe(2);
  });

  it("habtm saving multiple relationships", async () => {
    const newProject = new Project({ name: "Grimetime" });
    const amountOfDevelopers = 4;
    const devs = [];
    for (let i = amountOfDevelopers - 1; i >= 0; i--) {
      devs.push(await Developer.create({ name: `JME ${i}`, salary: 50000 }));
    }

    await newProject.developers.setIds([devs[0].id, devs[1].id] as any);
    await newProject.developersWithCallbacks.setIds([devs[2].id, devs[3].id] as any);
    expect(await newProject.save()).toBe(true);

    await newProject.reload();
    expect(await newProject.developers.size()).toBe(amountOfDevelopers);
    expect((await newProject.developers.toArray()).map((d) => d.id)).toEqual(devs.map((d) => d.id));
  });

  it("habtm distinct order preserved", async () => {
    const activeRecord = projects("active_record");
    const expected = [developers("poor_jamis").id, developers("jamis").id, developers("david").id];
    const nonUnique = (await activeRecord.nonUniqueDevelopers.toArray()).map((d) => d.id);
    expect(nonUnique).toEqual(expected);
    const unique = (await activeRecord.developers.toArray()).map((d) => d.id);
    expect(unique).toEqual(expected);
  });

  it("habtm collection size from build", async () => {
    const devel = await Developer.create({ name: "Fred Wu", salary: 50000 });
    await devel.projects.push(await Project.create({ name: "Grimetime" }));
    devel.projects.build();

    expect(await devel.projects.size()).toBe(2);
  });

  it("habtm collection size from params", async () => {
    const devel = new Developer({ projectsAttributes: { "0": {} } });
    expect(await devel.projects.size()).toBe(1);
  });

  it("build", async () => {
    const devel = await Developer.find(1);
    const proj = devel.projects.build({ name: "Projekt" });
    expect(proj.isNewRecord()).toBe(true);
    await devel.save();
    expect(proj.isNewRecord()).toBe(false);
    const reloaded = await devel.projects.reload();
    expect((reloaded as any).map((p: Project) => p.id)).toContain(proj.id);
  });

  it("new aliased to build", async () => {
    const devel = await Developer.find(1);
    const proj = devel.projects.build({ name: "Projekt" });
    expect(proj.isNewRecord()).toBe(true);
    await devel.save();
    expect(proj.isNewRecord()).toBe(false);
  });

  it("build by new record", async () => {
    const devel = new Developer({ name: "Marcel", salary: 75000 });
    devel.projects.build({ name: "Make bed" });
    const proj2 = devel.projects.build({ name: "Lie in it" });
    expect(proj2.isNewRecord()).toBe(true);
    await devel.save();
    expect(devel.isNewRecord()).toBe(false);
    expect(proj2.isNewRecord()).toBe(false);
    const found = (await Developer.findBy({ name: "Marcel" })) as Developer;
    const projs = await found.projects.toArray();
    expect(projs.map((p) => p.id)).toContain(proj2.id);
  });

  it("create", async () => {
    const devel = await Developer.find(1);
    const proj = await devel.projects.create({ name: "Projekt" });
    expect(proj.isPersisted()).toBe(true);
    const fresh = await Developer.find(1);
    const projs = await fresh.projects.toArray();
    expect(projs.map((p) => p.id)).toContain(proj.id);
  });

  it("creation respects hash condition", async () => {
    const general = await Category.find(1);
    const post = general.postWithConditions.build({ body: " " });
    expect(await post.save()).toBe(true);
    expect(post.title).toBe("Yet Another Testing Title");

    const anotherPost = await general.postWithConditions.create({
      body: " ",
    });
    expect(anotherPost.isPersisted()).toBe(true);
    expect(anotherPost.title).toBe("Yet Another Testing Title");
  });

  it("distinct after the fact", async () => {
    const dev = developers("jamis");
    const activeRecord = projects("active_record");
    await dev.projects.push(activeRecord);
    await dev.projects.push(activeRecord);
    expect(await dev.projects.size()).toBe(3);
    expect((await dev.projects.distinct()).length).toBe(1);
  });

  it("distinct before the fact", async () => {
    const activeRecord = projects("active_record");
    await activeRecord.developers.push(developers("jamis"));
    await activeRecord.developers.push(developers("david"));
    expect(await (await activeRecord.developers.reload()).size()).toBe(3);
  });

  it("distinct option prevents duplicate push", async () => {
    const project = projects("active_record");
    await project.developers.push(developers("jamis"));
    await project.developers.push(developers("david"));
    expect(await project.developers.size()).toBe(3);

    await project.developers.push(developers("david"));
    await project.developers.push(developers("jamis"));
    expect(await project.developers.size()).toBe(3);
  });

  it("distinct when association already loaded", async () => {
    const project = projects("active_record");
    await project.developers.push(developers("jamis"));
    await project.developers.push(developers("david"));
    const reloaded = await Project.find(project.id);
    expect(await reloaded.developers.size()).toBe(3);
  });

  it("deleting", async () => {
    const david = await Developer.find(1);
    const activeRecord = await Project.find(1);
    await david.projects.reload();
    expect(await david.projects.size()).toBe(2);
    expect(await activeRecord.developers.size()).toBe(3);

    await david.projects.delete(activeRecord);

    expect(await david.projects.size()).toBe(1);
    expect(await (await david.projects.reload()).size()).toBe(1);
    expect(await (await activeRecord.developers.reload()).size()).toBe(2);
  });

  it("deleting array", async () => {
    const david = await Developer.find(1);
    await david.projects.reload();
    await david.projects.delete(...(await Project.all()));
    expect(await david.projects.size()).toBe(0);
    expect(await (await david.projects.reload()).size()).toBe(0);
  });

  it("deleting all", async () => {
    const david = await Developer.find(1);
    await david.projects.reload();
    await david.projects.clear();
    expect(await david.projects.size()).toBe(0);
    expect(await (await david.projects.reload()).size()).toBe(0);
  });

  it("removing associations on destroy", async () => {
    const david = await DeveloperWithBeforeDestroyRaise.find(1);
    expect((await david.projects.toArray()).length).toBeGreaterThan(0);
    await david.destroy();
    expect((await david.projects.toArray()).length).toBe(0);
    const joins = await Base.connection.execute(
      "SELECT * FROM developers_projects WHERE developer_id = 1",
    );
    expect(joins.length).toBe(0);
  });

  it("destroying", async () => {
    const david = await Developer.find(1);
    const project = await Project.find(1);
    await david.projects.reload();
    expect(await david.projects.size()).toBe(2);
    expect(await project.developers.size()).toBe(3);

    const projectCountBefore = Number(await Project.count());
    await david.projects.destroy(project);
    expect(Number(await Project.count())).toBe(projectCountBefore);

    const joins = await Base.connection.execute(
      `SELECT * FROM developers_projects WHERE developer_id = ${david.id} AND project_id = ${project.id}`,
    );
    expect(joins.length).toBe(0);
    await david.reload();
    expect(await david.projects.size()).toBe(1);
    expect(await (await david.projects.reload()).size()).toBe(1);
  });

  it("destroying many", async () => {
    const david = await Developer.find(1);
    await david.projects.reload();
    const allProjects = await Project.all();

    const projectCountBefore = Number(await Project.count());
    await david.projects.destroy(...allProjects);
    expect(Number(await Project.count())).toBe(projectCountBefore);

    const joins = await Base.connection.execute(
      `SELECT * FROM developers_projects WHERE developer_id = ${david.id}`,
    );
    expect(joins.length).toBe(0);
    await david.reload();
    expect(await david.projects.size()).toBe(0);
    expect(await (await david.projects.reload()).size()).toBe(0);
  });

  it("destroy all", async () => {
    const david = await Developer.find(1);
    await david.projects.reload();
    expect((await david.projects.toArray()).length).toBeGreaterThan(0);

    const projectCountBefore = Number(await Project.count());
    await david.projects.destroyAll();
    expect(Number(await Project.count())).toBe(projectCountBefore);

    const joins = await Base.connection.execute(
      `SELECT * FROM developers_projects WHERE developer_id = ${david.id}`,
    );
    expect(joins.length).toBe(0);
    expect((await david.projects.toArray()).length).toBe(0);
    expect(await (await david.projects.reload()).size()).toBe(0);
  });

  it("destroy associations destroys multiple associations", async () => {
    const george = (await Parrot.findBy({ name: "Curious George" })) as Parrot;
    expect((await george.pirates.toArray()).length).toBeGreaterThan(0);
    expect((await george.treasures.toArray()).length).toBeGreaterThan(0);

    const pirateBefore = (await Pirate.all()).length;
    const treasureBefore = (await Treasure.all()).length;
    await (george as any).destroyAssociations();
    expect((await Pirate.all()).length).toBe(pirateBefore);
    expect((await Treasure.all()).length).toBe(treasureBefore);

    expect(
      (
        await Base.connection.execute(
          `SELECT * FROM parrots_pirates WHERE parrot_id = ${george.id}`,
        )
      ).length,
    ).toBe(0);
    expect(await (await george.pirates.reload()).size()).toBe(0);
    expect(
      (
        await Base.connection.execute(
          `SELECT * FROM parrots_treasures WHERE parrot_id = ${george.id}`,
        )
      ).length,
    ).toBe(0);
    expect(await (await george.treasures.reload()).size()).toBe(0);
  });

  it("associations with conditions", async () => {
    const activeRecord = projects("active_record");
    const david = developers("david");
    expect(await activeRecord.developers.size()).toBe(3);
    expect(await activeRecord.developersNamedDavid.size()).toBe(1);
    expect(await activeRecord.developersNamedDavidWithHashConditions.size()).toBe(1);

    expect((await activeRecord.developersNamedDavid.find(david.id)).id).toBe(david.id);
    expect((await activeRecord.developersNamedDavidWithHashConditions.find(david.id)).id).toBe(
      david.id,
    );
    expect((await activeRecord.salariedDevelopers.find(david.id)).id).toBe(david.id);

    await activeRecord.developersNamedDavid.clear();
    await activeRecord.developers.reload();
    expect(await activeRecord.developers.size()).toBe(2);
  });

  it("find in association", async () => {
    const david = developers("david");
    const activeRecord = projects("active_record");
    const proxy = activeRecord.developers;
    expect((await proxy.find(david.id)).id).toBe(david.id);
    await proxy.reload();
    expect((await proxy.find(david.id)).id).toBe(david.id);
  });

  it("include uses array include after loaded", async () => {
    const activeRecord = projects("active_record");
    const proxy = activeRecord.developers;
    const loaded = await proxy.load();
    const developer = loaded[0];
    await assertNoQueries(false, async () => {
      expect(proxy.loaded).toBe(true);
      expect(await proxy.isInclude(developer)).toBe(true);
    });
  });

  it("include checks if record exists if target not loaded", async () => {
    const activeRecord = projects("active_record");
    const david = developers("david");
    const proxy = activeRecord.developers;
    expect(proxy.loaded).toBe(false);
    await assertQueriesCount(1, false, async () => {
      expect(await proxy.isInclude(david)).toBe(true);
    });
    expect(proxy.loaded).toBe(false);
  });

  it("include returns false for non matching record to verify scoping", async () => {
    const activeRecord = projects("active_record");
    const bryan = await Developer.create({ name: "Bryan", salary: 50000 });
    const proxy = activeRecord.developers;
    expect(proxy.loaded).toBe(false);
    expect(await proxy.isInclude(bryan)).toBe(false);
  });

  it("find with merged options", async () => {
    const activeRecord = projects("active_record");
    expect(await activeRecord.limitedDevelopers.size()).toBe(1);
    expect((await activeRecord.limitedDevelopers.toArray()).length).toBe(1);
    expect((await (activeRecord.limitedDevelopers as any).limit(null).toArray()).length).toBe(3);
  });

  it("dynamic find should respect association order", async () => {
    const activeRecord = projects("active_record");
    const highIdJamis = await (activeRecord.developers as any).create({
      name: "Jamis",
    });

    const merged = (await activeRecord.developers.where("name = 'Jamis'").first()) as Developer;
    expect(merged.id).toBe(highIdJamis.id);

    const byName = (await (activeRecord.developers as any).findBy({
      name: "Jamis",
    })) as Developer;
    expect(byName.id).toBe(highIdJamis.id);
  });

  it("find should append to association order", async () => {
    const activeRecord = projects("active_record");
    const orderedDevelopers = (activeRecord.developers as any).order("projects.id");
    expect(orderedDevelopers.orderValues).toEqual([
      "developers.name desc, developers.id desc",
      "projects.id",
    ]);
  });

  it("dynamic find all should respect readonly access", async () => {
    const activeRecord = projects("active_record");
    for (const d of await activeRecord.readonlyDevelopers.toArray()) {
      if (d.isValid()) {
        await expect((d as any).saveBang()).rejects.toThrow(ReadOnlyRecord);
      }
    }
    for (const d of await activeRecord.readonlyDevelopers.toArray()) {
      (d as any).isReadonly();
    }
  });

  it("new with values in collection", async () => {
    const jamis = (await DeveloperForProjectWithAfterCreateHook.findBy({
      name: "Jamis",
    })) as any;
    const david = (await DeveloperForProjectWithAfterCreateHook.findBy({
      name: "David",
    })) as any;
    const project = new ProjectWithAfterCreateHook({ name: "Cooking with Bertie" });
    await (project as any).developers.push(jamis);
    await (project as any).saveBang();
    await project.reload();

    const devs = await (project as any).developers.toArray();
    expect(devs.map((d: any) => d.id)).toContain(jamis.id);
    expect(devs.map((d: any) => d.id)).toContain(david.id);
  });

  it("find in association with options", async () => {
    const activeRecord = projects("active_record");
    const devs = await activeRecord.developers.toArray();
    expect(devs.length).toBe(3);
    const poorJamis = developers("poor_jamis");
    const first = (await activeRecord.developers.where("salary < 10000").first()) as Developer;
    expect(first.id).toBe(poorJamis.id);
  });

  it("association with extend option", async () => {
    const eponine = await DeveloperWithExtendOption.create({ name: "Eponine", salary: 80000 });
    expect(await (eponine as any).projects.category()).toBe("sns");
  });

  it("replace with less", async () => {
    const david = developers("david");
    const actionController = projects("action_controller");
    await david.projects.clear();
    await david.projects.push(actionController);
    expect((await david.projects.toArray()).length).toBe(1);
  });

  it("replace with new", async () => {
    const david = developers("david");
    await david.projects.clear();
    const actionController = projects("action_controller");
    const newProj = await Project.create({ name: "ActionWebSearch" });
    await david.projects.push(actionController, newProj);
    const projs = await david.projects.toArray();
    expect(projs.length).toBe(2);
    expect(projs.map((p) => p.id)).not.toContain((await Project.find(1)).id);
  });

  it("replace on new object", async () => {
    const newDeveloper = new Developer({ name: "Matz", salary: 50000 });
    const actionController = projects("action_controller");
    const newProj = new Project({ name: "ActionWebSearch" });
    await newDeveloper.projects.concat(actionController, newProj);
    await newDeveloper.save();
    expect((await newDeveloper.projects.toArray()).length).toBe(2);
  });

  it("consider type", async () => {
    const developer = (await Developer.all())[0];
    const specialProject = await SpecialProject.create({ name: "Special Project" });

    const otherProject = (await developer.projects.toArray())[0];
    await developer.specialProjects.push(specialProject);
    const fresh = await Developer.find(developer.id);

    const projs = await fresh.projects.toArray();
    expect(projs.map((p) => p.id)).toContain(specialProject.id);
    const specials = await fresh.specialProjects.toArray();
    expect(specials.map((p) => p.id)).toContain(specialProject.id);
    expect(specials.map((p) => p.id)).not.toContain(otherProject.id);
  });

  it("symbol join table", async () => {
    const developer = (await Developer.all())[0];
    const sp = await developer.symSpecialProjects.create({
      name: "omg",
    });
    const fresh = await Developer.find(developer.id);
    const specials = await fresh.symSpecialProjects.toArray();
    expect(specials.map((p) => p.id)).toContain(sp.id);
  });

  it("update columns after push without duplicate join table rows", async () => {
    const developer = new Developer({ name: "Kano", salary: 50000 });
    const project = await SpecialProject.create({ name: "Special Project" });
    expect(await developer.save()).toBe(true);
    await developer.projects.push(project);
    await (developer as any).updateColumns({ name: "Bruza" });
    const rows = await Base.connection.execute(
      `SELECT count(*) as c FROM developers_projects WHERE project_id = ${project.id} AND developer_id = ${developer.id}`,
    );
    expect(Number(rows[0].c)).toBe(1);
  });

  it("updating attributes on non rich associations", async () => {
    const technology = await Category.find(2);
    const welcome = (await technology.posts.toArray())[0];
    welcome.title = "Something else";
    expect(await (welcome as any).saveBang()).toBeTruthy();
  });

  it("habtm respects select", async () => {
    const technology = await Category.find(2);
    for (const o of await technology.selectTestingPosts.reload()) {
      expect((o as any).attributes).toHaveProperty("correctness_marker");
    }
    const first = (await technology.selectTestingPosts.toArray())[0] as any;
    expect(first.attributes).toHaveProperty("correctness_marker");
  });

  it("habtm selects all columns by default", async () => {
    const david = developers("david");
    const first = (await david.projects.toArray())[0];
    expect(Object.keys((first as any).attributes).sort()).toEqual(
      Project.columnNames().slice().sort(),
    );
  });

  it("habtm respects select query method", async () => {
    const david = developers("david");
    const first = (await (david.projects as any).select("id").toArray())[0];
    expect(Object.keys(first.attributes)).toEqual(["id"]);
  });

  it("join middle table alias", async () => {
    const records = await (Project as any)
      .includes("developers_projects")
      .whereNot({ "developers_projects.joined_on": null })
      .toArray();
    expect(records.length).toBe(2);
  });

  it("join table alias", async () => {
    const records = await (Developer as any)
      .includes({ projects: "developers" })
      .whereNot({ "developers_projects_projects_join.joined_on": null })
      .toArray();
    expect(records.length).toBe(3);
  });

  it("join with group", async () => {
    const group: string[] = [];
    for (const c of Developer.columnNames()) {
      group.push(`developers.${c}`);
      group.push(`developers_projects_2.${c}`);
    }
    for (const c of Project.columnNames()) group.push(`projects.${c}`);

    const records = await (Developer as any)
      .includes({ projects: "developers" })
      .whereNot({ "developers_projects_projects_join.joined_on": null })
      .group(group.join(","))
      .toArray();
    expect(records.length).toBe(3);
  });

  it("find grouped", async () => {
    const allPosts = await Post.all().where("category_id = 1").joins("categories");
    const grouped = await Post.all()
      .where("category_id = 1")
      .group("author_id")
      .select("count(posts.id) as posts_count")
      .joins("categories");
    expect(allPosts.length).toBe(5);
    expect(grouped.length).toBe(2);
  });

  it("find scoped grouped", async () => {
    const general = await Category.find(1);
    expect((await general.postsGroupedByTitle.toArray()).length).toBe(5);
    const technology = await Category.find(2);
    expect((await technology.postsGroupedByTitle.toArray()).length).toBe(1);
  });

  it("find scoped grouped having", async () => {
    const activeRecord = projects("active_record");
    const groups = await activeRecord.wellPaidSalaryGroups.toArray();
    expect(groups.length).toBe(2);
    expect(groups.every((g: any) => Number(g.salary) > 10000)).toBe(true);
  });

  it("get ids", async () => {
    const david = developers("david");
    const jamis = developers("jamis");
    const activeRecord = projects("active_record");
    const actionController = projects("action_controller");
    const davidIds = [...((await (david as any).projectIds) as number[])]
      .map(Number)
      .sort((a, b) => a - b);
    expect(davidIds).toEqual(
      [activeRecord.id, actionController.id].map(Number).sort((a, b) => a - b),
    );
    expect(((await (jamis as any).projectIds) as number[]).map(Number)).toEqual(
      [activeRecord.id].map(Number),
    );
  });

  it("get ids for loaded associations", async () => {
    const developer = developers("david");
    await developer.projects.reload();
    await assertNoQueries(false, async () => {
      await (developer as any).projectIds;
      await (developer as any).projectIds;
    });
  });

  it("get ids for unloaded associations does not load them", async () => {
    const developer = developers("david");
    const activeRecord = projects("active_record");
    const actionController = projects("action_controller");
    const proxy = developer.projects;
    expect(proxy.loaded).toBe(false);
    const ids = [...((await (developer as any).projectIds) as number[])]
      .map(Number)
      .sort((a, b) => a - b);
    expect(ids).toEqual([activeRecord.id, actionController.id].map(Number).sort((a, b) => a - b));
    expect(proxy.loaded).toBe(false);
  });

  it("assign ids", async () => {
    const activeRecord = projects("active_record");
    const actionController = projects("action_controller");
    const developer = new Developer({ name: "Joe" });
    await developer.projects.setIds([activeRecord.id, actionController.id] as any);
    await (developer as any).save();
    await developer.reload();
    expect((await developer.projects.toArray()).length).toBe(2);
    const ids = [...((await (developer as any).projectIds) as number[])]
      .map(Number)
      .sort((a, b) => a - b);
    expect(ids).toEqual([activeRecord.id, actionController.id].map(Number).sort((a, b) => a - b));
  });

  it("assign ids ignoring blanks", async () => {
    const activeRecord = projects("active_record");
    const actionController = projects("action_controller");
    const developer = new Developer({ name: "Joe" });
    await developer.projects.setIds([activeRecord.id, null, actionController.id, ""] as any);
    await (developer as any).save();
    await developer.reload();
    expect((await developer.projects.toArray()).length).toBe(2);
    const ids = [...((await (developer as any).projectIds) as number[])]
      .map(Number)
      .sort((a, b) => a - b);
    expect(ids).toEqual([activeRecord.id, actionController.id].map(Number).sort((a, b) => a - b));
  });

  it("singular ids are reloaded after collection concat", async () => {
    const student = await Student.create({ name: "Alberto Almagro" });
    await (student as any).lessonIds;
    const lesson = await Lesson.create({ name: "DSI" });
    await student.lessons.push(lesson as any);
    expect(await (student as any).lessonIds).toContain(lesson.id);
  });

  it("scoped find on through association doesnt return read only records", async () => {
    const post = await Post.find(1);
    const tag = (await (post.tags as any).findBy({ name: "General" })) as Base;
    expect(tag.isReadonly()).toBe(false);
    expect(await (tag as any).saveBang()).toBeTruthy();
  });

  it("has many through polymorphic has manys works", async () => {
    const redbeard = (await Pirate.findBy({ catchphrase: "Avast!" })) as Pirate;
    const prices = (await redbeard.treasureEstimates.toArray()).map((e: any) => e.price);
    expect(new Set(prices)).toEqual(new Set(["$10.00", "$20.00"]));
  });

  it("symbols as keys", async () => {
    const developer = new DeveloperWithSymbolsForKeys({ name: "David" });
    const project = new ProjectWithSymbolsForKeys({ name: "Rails Testing" });
    await (project as any).developers.push(developer);
    await (project as any).saveBang();

    expect(await (project as any).developers.size()).toBe(1);
    expect(await (developer as any).projects.size()).toBe(1);
    expect((await (project as any).developers.first()).id).toBe(developer.id);
    expect((await (developer as any).projects.first()).id).toBe(project.id);
  });

  // RFC 0023-surfaced-deviations: a HABTM proxy whose owner was NEW when a
  // finder relation was spawned off it (`project.developers.where(...)`) seeds
  // the `1=0` NullRelation. After `save`, the mutated finder must rebase onto
  // the resolved join scope so it picks up the persisted FK rather than the
  // stale seed — mirroring Rails' CollectionProxy delegating to
  // `association.scope`.
  it("mutated finder on new-owner seed resolves the join after save", async () => {
    const developer = await Developer.create({ name: "Zed" });
    const project = new Project({ name: "Rails Testing" });
    // `where(...)` spawns off the still-new owner's `1=0` seed.
    const scoped = (project as any).developers.where({ name: "Zed" });
    await (project as any).developers.push(developer);
    await (project as any).saveBang();

    expect((await scoped.first()).id).toBe(developer.id);
  });

  it("dynamic find should respect association include", async () => {
    // SQL error in sort clause if :include is not included
    // due to Unknown column 'authors.id'
    const category = await Category.find(1);
    const post = await (category.postsWithAuthorsSortedByAuthorId as any).findBy({
      title: "Welcome to the weblog",
    });
    expect(post).toBeTruthy();
  });

  it("count", async () => {
    const david = await Developer.find(1);
    expect(await david.projects.count()).toBe(2);
  });

  it("association proxy transaction method starts transaction in association class", async () => {
    const category = await Category.first();
    const proxy = category!.posts as any;
    const spy = vi.spyOn(Post as any, "transaction");
    try {
      await proxy.transaction(async () => {
        // nothing
      });
      expect(spy).toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("attributes are being set when initialized from habtm association with where clause", async () => {
    const actionController = projects("action_controller");
    const newDeveloper = (actionController.developers as any).where({ name: "Marcelo" }).build();
    expect(newDeveloper.name).toBe("Marcelo");
  });

  it("attributes are being set when initialized from habtm association with multiple where clauses", async () => {
    const actionController = projects("action_controller");
    const newDeveloper = (actionController.developers as any)
      .where({ name: "Marcelo" })
      .where({ salary: 90000 })
      .build();
    expect(newDeveloper.name).toBe("Marcelo");
    expect(newDeveloper.salary).toBe(90000);
  });

  it("include method in has and belongs to many association should return true for instance added with build", async () => {
    const project = new Project({});
    const proxy = project.developers;
    const developer = proxy.build({});
    expect(await proxy.isInclude(developer)).toBe(true);
  });

  it("destruction does not error without primary key", async () => {
    const redbeard = (await Pirate.findBy({ catchphrase: "Avast!" })) as Pirate;
    const george = (await Parrot.findBy({ name: "Curious George" })) as Parrot;
    await redbeard.parrots.push(george);
    expect(await george.pirates.count()).toBe(2);
    await (await Pirate.find(redbeard.id)).destroy();
    expect(await george.pirates.count()).toBe(1);
    expect((await Pirate.where({ id: redbeard.id })).length).toBe(0);
  });

  it("has and belongs to many associations on new records use null relations", async () => {
    const dev = new Developer({});
    const proxy = dev.projects;
    await assertNoQueries(false, async () => {
      expect(await proxy.toArray()).toEqual([]);
      expect(await (proxy as any).where({ title: "omg" }).toArray()).toEqual([]);
      expect(await proxy.count()).toBe(0);
    });
  });

  it("association with validate false does not run associated validation callbacks on create", async () => {
    const richPerson = new RichPerson({});
    const treasure = new Treasure({});
    await treasure.richPeople.push(richPerson as any);
    treasure.isValid();

    expect(await treasure.richPeople.size()).toBe(1);
    // Rails asserts `assert_nil rich_person.first_name`; an unset attribute
    // reads as undefined here — the point is the before_validation callback
    // (which would set it) never ran.
    expect((richPerson as any).first_name ?? null).toBeNull();
  });

  it("association with validate false does not run associated validation callbacks on update", async () => {
    const richPerson = await RichPerson.createBang({});
    const personFirstName = (richPerson as any).first_name;
    expect(personFirstName ?? null).not.toBeNull();

    const treasure = new Treasure({});
    await (treasure as any).richPeople.push(richPerson as any);
    treasure.isValid();

    expect(await (treasure as any).richPeople.size()).toBe(1);
    expect((richPerson as any).first_name).toBe(personFirstName);
  });

  it("custom join table", async () => {
    expect((Vertex as any)._reflectOnAssociation("sources").joinTable).toBe("edges");
  });

  it("has and belongs to many in a namespaced model pointing to a namespaced model", async () => {
    const magazine = await PublisherMagazine.create({});
    const article = await PublisherArticle.create({});
    await (magazine as any).articles.push(article as any);
    await magazine.save();

    const articles = await (magazine as any).articles.toArray();
    expect(articles.map((a: any) => a.id)).toContain((article as any).id);
  });

  it("has and belongs to many in a namespaced model pointing to a non namespaced model", async () => {
    const article = await PublisherArticle.create({});
    const tag = await Tag.create({});
    await (article as any).tags.push(tag as any);
    await article.save();

    const tags = await (article as any).tags.toArray();
    expect(tags.map((t: any) => t.id)).toContain((tag as any).id);
  });

  it("redefine habtm", async () => {
    const child = new SubDeveloper({ name: "Aredridel", salary: 50000 });
    await child.specialProjects.push(new SpecialProject({ name: "Special Project" }));
    expect(await child.save()).toBe(true);
  });

  it("habtm with reflection using class name and fixtures", async () => {
    // `shared_computers` → camelCase `sharedComputers` reflection (class_name: "Computer").
    expect((Developer as any)._reflectOnAssociation("sharedComputers")).not.toBeNull();
    // Rails additionally asserts developers.yml literally contains "shared_computers"
    // (the only way the bug reproduced). trails' fixture loader materializes the
    // `sharedComputers: ["laptop"]` association label on `david` into a
    // computers_developers join row — exercised by the data assertion below.
    const david = developers("david");
    const sharedComputers = await david.sharedComputers.toArray();
    expect((sharedComputers[0] as any).id).toBe((computers("laptop") as any).id);
  });

  it("with symbol class name", () => {
    expect(() => {
      const developer = new DeveloperWithSymbolClassName({});
      // Mirrors Rails' `developer.projects`; also force klass resolution so the
      // Symbol class_name (`:ProjectWithSymbolsForKeys`) is actually resolved,
      // not merely declared.
      void (developer as any).projects;
      void (DeveloperWithSymbolClassName as any)._reflectOnAssociation("projects").klass;
    }).not.toThrow();
  });

  // `Professor`/`Course` live in the `arunit2` second database. Rails runs the
  // suite against two real databases; trails mirrors the split with a second
  // in-memory SQLite pool on `ARUnit2Model`. The PG/MySQL suites don't yet
  // provision a second named database, so gate the cross-pool habtm to SQLite —
  // same gating as `MultipleDbTest`.
  it.skipIf(!isSqliteRun())("alternate database", async () => {
    await setupSecondPool();
    const professor = await Professor.create({ name: "Plum" });
    const course = await Course.create({ name: "Forensics" });
    expect(await (professor as any).courses.count()).toBe(0);
    await expect((professor as any).courses.push(course)).resolves.not.toThrow();
    expect(await (professor as any).courses.count()).toBe(1);
  });

  it("habtm scope can unscope", async () => {
    const project = new ProjectUnscopingDavidDefaultScope({});
    await (project as any).saveBang();

    const developer = new LazyBlockDeveloperCalledDavid({ name: "Not David" });
    await (developer as any).saveBang();
    await (project as any).developers.push(developer);

    const projs = ProjectUnscopingDavidDefaultScope.includes("developers").where({
      id: project.id,
    });
    expect(await ((await projs.first())! as any).developers.size()).toBe(1);
  });

  it("preloaded associations size", async () => {
    const firstProjectDirect = await Project.first();
    const preloadedProject = await Project.preload("salariedDevelopers").first();
    expect(await preloadedProject!.salariedDevelopers.size()).toBe(
      await firstProjectDirect!.salariedDevelopers.size(),
    );

    const includesProject = await Project.includes("salariedDevelopers")
      .references("salariedDevelopers")
      .first();
    expect(await includesProject!.salariedDevelopers.size()).toBe(
      await preloadedProject!.salariedDevelopers.size(),
    );

    // Nested HATBM
    const developer = await Developer.first();
    const firstProject = await developer!.projects.first();
    const preloadedDeveloper = await Developer.preload({
      projects: "salariedDevelopers",
    }).first();
    const preloadedProjects = await preloadedDeveloper!.projects.toArray();
    const preloadedFirstProject = preloadedProjects.find(
      (p: Project) => (p as any).id === (firstProject as any).id,
    );

    expect(preloadedFirstProject!.salariedDevelopers.loaded).toBe(true);
    expect(await preloadedFirstProject!.salariedDevelopers.size()).toBe(
      await firstProject!.salariedDevelopers.size(),
    );
  });

  it("has and belongs to many is usable with belongs to required by default", async () => {
    const before = await ((await Project.first())! as any).developersRequiredByDefault.size();
    await ((await Project.first())!.developersRequiredByDefault as any).createBang({
      name: "Sean",
      salary: 50000,
    });
    const after = await ((await Project.first())! as any).developersRequiredByDefault.size();
    expect(after).toBe(before + 1);
  });

  it("association name is the same as join table name", async () => {
    const user = await (User as any).createBang({});
    await expect(user.jobsPool.clear()).resolves.not.toThrow();
  });

  it("has and belongs to many while partial inserts false", async () => {
    const original = Base.partialInserts;
    Base.partialInserts = false;
    try {
      const developer = new Developer({ name: "Mehmet Emin İNAÇ", salary: 50000 });
      await developer.projects.push(new Project({ name: "Bounty" }));
      expect(await developer.save()).toBe(true);
    } finally {
      Base.partialInserts = original;
    }
  });

  it("has and belongs to many with belongs to", async () => {
    const sink = await (Sink as any).createBang({
      kitchen: new Kitchen({}),
      sources: [new Source({})],
    });
    expect(await sink.sources.count()).toBe(1);
  });
});
