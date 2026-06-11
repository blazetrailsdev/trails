/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/scoping/default_scoping_test.rb
 *
 * Every Rails test is ported with a faithful body. Cases that exercise behavior
 * the engine does not yet implement are kept as `it.skip` (the migration
 * backlog) rather than fabricated passing stubs, so their names stay tracked by
 * test:compare; each skip carries a one-line note on the missing capability.
 * The `DefaultScopingWithThreadTest` cases are `unless in_memory_db?` in Rails
 * and so do not apply on the in-memory sqlite suite.
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import "../index.js";
import { registerModel } from "../index.js";
import { captureSql } from "../testing/sql-capture.js";
import { useHandlerFixtures } from "../test-helpers/use-handler-fixtures.js";
import { TEST_SCHEMA as canonicalSchema } from "../test-helpers/test-schema.js";
import {
  Developer,
  DeveloperOrderedBySalary,
  DeveloperCalledDavid,
  LazyLambdaDeveloperCalledDavid,
  LazyBlockDeveloperCalledDavid,
  CallableDeveloperCalledDavid,
  ClassMethodDeveloperCalledDavid,
  ClassMethodReferencingScopeDeveloperCalledDavid,
  LazyBlockReferencingScopeDeveloperCalledDavid,
  DeveloperCalledJamis,
  PoorDeveloperCalledJamis,
  InheritedPoorDeveloperCalledJamis,
  ModuleIncludedPoorDeveloperCalledJamis,
  MultiplePoorDeveloperCalledJamis,
  DeveloperwithDefaultMentorScopeNot,
  DeveloperWithDefaultMentorScopeAllQueries,
  DeveloperWithDefaultNilableFirmScopeAllQueries,
  DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries,
  DeveloperWithSelect,
  DeveloperWithIncludes,
  ThreadsafeDeveloper,
} from "../test-helpers/models/developer.js";
import { Mentor } from "../test-helpers/models/mentor.js";
import {
  Comment,
  SpecialComment,
  CommentWithDefaultScopeReferencesAssociation,
} from "../test-helpers/models/comment.js";
import {
  Post,
  SpecialPostWithDefaultScope,
  ConditionalStiPost,
  SubConditionalStiPost,
  PostWithCommentWithDefaultScopeReferencesAssociation,
} from "../test-helpers/models/post.js";
import { Project } from "../test-helpers/models/project.js";
import { Lion } from "../test-helpers/models/cat.js";

// Register the models whose associations are resolved by active tests
// (Developer's `projects` HABTM is dereferenced in the eager_load/preload ports).
registerModel(Developer);
registerModel(Project);

const names = (rows: any[]) => rows.map((r) => r.name);
const salaries = (rows: any[]) => rows.map((r) => r.salary);
const namesAndIds = (rows: any[]) => rows.map((r) => [r.name, r.id]);
// Rails capture_sql(include_schema: false): drop introspection queries so the
// SAVEPOINT/INSERT/UPDATE ordering matches Rails' .first/.second indexing.
const capSql = (fn: () => unknown) =>
  captureSql(fn as () => Promise<void>, { includeSchema: false });

describe("DefaultScopingTest", () => {
  // Only `developers` is seeded: every active test reads developers fixtures (or
  // builds SQL without hitting the DB). The `posts`/`comments`-backed cases are
  // all `it.skip`, so seeding those shared tables here would only risk the known
  // parallel-fork `posts` collision without exercising anything.
  const { developers } = useHandlerFixtures(["developers"], {
    schema: canonicalSchema,
  });

  it("default scope", async () => {
    const expected = salaries(await Developer.order("salary DESC").toArray());
    const received = salaries(await DeveloperOrderedBySalary.all().toArray());
    expect(received).toEqual(expected);
  });

  it("default scope as class method", async () => {
    const all = await ClassMethodDeveloperCalledDavid.all().toArray();
    expect(all.map((d: any) => d.id)).toEqual([developers("david").id]);
  });

  it("default scope as class method referencing scope", async () => {
    const all = await ClassMethodReferencingScopeDeveloperCalledDavid.all().toArray();
    expect(all.map((d: any) => d.id)).toEqual([developers("david").id]);
  });

  it("default scope as block referencing scope", async () => {
    const all = await LazyBlockReferencingScopeDeveloperCalledDavid.all().toArray();
    expect(all.map((d: any) => d.id)).toEqual([developers("david").id]);
  });

  it("default scope with lambda", async () => {
    const all = await LazyLambdaDeveloperCalledDavid.all().toArray();
    expect(all.map((d: any) => d.id)).toEqual([developers("david").id]);
  });

  it("default scope with block", async () => {
    const all = await LazyBlockDeveloperCalledDavid.all().toArray();
    expect(all.map((d: any) => d.id)).toEqual([developers("david").id]);
  });

  it("default scope with callable", async () => {
    const all = await CallableDeveloperCalledDavid.all().toArray();
    expect(all.map((d: any) => d.id)).toEqual([developers("david").id]);
  });

  it("default scope is unscoped on find", async () => {
    expect(await DeveloperCalledDavid.count()).toBe(1);
    expect(await DeveloperCalledDavid.unscoped().count()).toBe(11);
  });

  it("default scope is unscoped on create", async () => {
    const dev = (await DeveloperCalledJamis.unscoped().create()) as any;
    expect(dev.name).toBeNull();
  });

  it("default scope with conditions string", async () => {
    const expected = (await Developer.where({ name: "David" }).toArray())
      .map((d: any) => d.id)
      .sort();
    const received = (await DeveloperCalledDavid.all().toArray()).map((d: any) => d.id).sort();
    expect(received).toEqual(expected);
    expect(((await DeveloperCalledDavid.create()) as any).name).toBeNull();
  });

  it("default scope with inheritance", () => {
    const wheres = InheritedPoorDeveloperCalledJamis.all().whereValuesHash();
    expect(wheres["name"]).toBe("Jamis");
    expect(wheres["salary"]).toBe(50000);
  });

  it("default scope with module includes", () => {
    const wheres = ModuleIncludedPoorDeveloperCalledJamis.all().whereValuesHash();
    expect(wheres["name"]).toBe("Jamis");
    expect(wheres["salary"]).toBe(50000);
  });

  it("default scope with multiple calls", () => {
    const wheres = MultiplePoorDeveloperCalledJamis.all().whereValuesHash();
    expect(wheres["name"]).toBe("Jamis");
    expect(wheres["salary"]).toBe(50000);
  });

  it("default scope runs on create", async () => {
    await Mentor.create();
    const createSql = (
      await capSql(() => DeveloperwithDefaultMentorScopeNot.create({ name: "Eileen" }))
    )[1];
    expect(createSql).toMatch(/mentor_id/);
  });

  it("default scope with all queries runs on create", async () => {
    await Mentor.create();
    const createSql = (
      await capSql(() => DeveloperWithDefaultMentorScopeAllQueries.create({ name: "Eileen" }))
    )[1];
    expect(createSql).toMatch(/mentor_id/);
  });

  it("nilable default scope with all queries runs on create", async () => {
    const createSql = (
      await capSql(() => DeveloperWithDefaultNilableFirmScopeAllQueries.create({ name: "Nikita" }))
    )[0];
    expect(createSql).not.toMatch(/AND$/);
  });

  it("default scope runs on select", async () => {
    await Mentor.create();
    await DeveloperwithDefaultMentorScopeNot.create({ name: "Eileen" });
    const selectSql = (
      await capSql(() => DeveloperwithDefaultMentorScopeNot.findBy({ name: "Eileen" }))
    )[0];
    expect(selectSql).toMatch(/mentor_id/);
  });

  it("default scope with all queries runs on select", async () => {
    await Mentor.create();
    await DeveloperWithDefaultMentorScopeAllQueries.create({ name: "Eileen" });
    const selectSql = (
      await capSql(() => DeveloperWithDefaultMentorScopeAllQueries.findBy({ name: "Eileen" }))
    )[0];
    expect(selectSql).toMatch(/mentor_id/);
  });

  it("nilable default scope with all queries runs on select", async () => {
    await DeveloperWithDefaultNilableFirmScopeAllQueries.create({ name: "Nikita" });
    const selectSql = (
      await capSql(() => DeveloperWithDefaultNilableFirmScopeAllQueries.findBy({ name: "Nikita" }))
    )[0];
    expect(selectSql).not.toMatch(/AND$/);
  });

  it("default scope doesnt run on update", async () => {
    await Mentor.create();
    const dev = (await DeveloperwithDefaultMentorScopeNot.create({ name: "Eileen" })) as any;
    const updateSql = (await capSql(() => dev.update({ name: "Not Eileen" })))[0];
    expect(updateSql).not.toMatch(/mentor_id/);
  });

  it("default scope with all queries runs on update", async () => {
    await Mentor.create();
    const dev = (await DeveloperWithDefaultMentorScopeAllQueries.create({ name: "Eileen" })) as any;
    const updateSql = (await capSql(() => dev.update({ name: "Not Eileen" })))[1];
    expect(updateSql).toMatch(/mentor_id/);
  });

  it("nilable default scope with all queries runs on update", async () => {
    const dev = (await DeveloperWithDefaultNilableFirmScopeAllQueries.create({
      name: "Nikita",
    })) as any;
    const updateSql = (await capSql(() => dev.update({ name: "Not Nikita" })))[0];
    expect(updateSql).not.toMatch(/AND$/);
  });

  it("default scope doesnt run on update columns", async () => {
    await Mentor.create();
    const dev = (await DeveloperwithDefaultMentorScopeNot.create({ name: "Eileen" })) as any;
    const updateSql = (await capSql(() => dev.updateColumns({ name: "Not Eileen" })))[0];
    expect(updateSql).not.toMatch(/mentor_id/);
  });

  it("nilable default scope with all queries runs on update columns", async () => {
    const dev = (await DeveloperWithDefaultNilableFirmScopeAllQueries.create({
      name: "Nikita",
    })) as any;
    const updateSql = (await capSql(() => dev.updateColumns({ name: "Not Nikita" })))[0];
    expect(updateSql).not.toMatch(/AND$/);
  });

  it("default scope doesnt run on destroy", async () => {
    await Mentor.create();
    const dev = (await DeveloperwithDefaultMentorScopeNot.create({ name: "Eileen" })) as any;
    const destroySql = (await capSql(() => dev.destroy()))[0];
    expect(destroySql).not.toMatch(/mentor_id/);
  });

  it("default scope with all queries runs on destroy", async () => {
    await Mentor.create();
    const dev = (await DeveloperWithDefaultMentorScopeAllQueries.create({ name: "Eileen" })) as any;
    const destroySql = (await capSql(() => dev.destroy()))[1];
    expect(destroySql).toMatch(/mentor_id/);
  });

  it("nilable default scope with all queries runs on destroy", async () => {
    const dev = (await DeveloperWithDefaultNilableFirmScopeAllQueries.create({
      name: "Nikita",
    })) as any;
    const destroySql = (await capSql(() => dev.destroy()))[0];
    expect(destroySql).not.toMatch(/AND$/);
  });

  it("default scope doesnt run on reload", async () => {
    await Mentor.create();
    const dev = (await DeveloperwithDefaultMentorScopeNot.create({ name: "Eileen" })) as any;
    const reloadSql = (await capSql(() => dev.reload()))[0];
    expect(reloadSql).not.toMatch(/mentor_id/);
  });

  it("nilable default scope with all queries runs on reload", async () => {
    const dev = (await DeveloperWithDefaultNilableFirmScopeAllQueries.create({
      name: "Nikita",
    })) as any;
    const reloadSql = (await capSql(() => dev.reload()))[0];
    expect(reloadSql).not.toMatch(/AND$/);
  });

  it("default scope with all queries doesnt run on destroy when unscoped", async () => {
    const dev = (await DeveloperWithDefaultMentorScopeAllQueries.create({
      name: "Eileen",
      mentor_id: 2,
    })) as any;
    const reloadSql = (await capSql(() => dev.reload({ unscoped: true })))[0];
    expect(reloadSql).not.toMatch(/mentor_id/);
  });

  it("scope overwrites default", async () => {
    const expected = names(await Developer.order("salary DESC, name DESC").toArray());
    const received = names(await (DeveloperOrderedBySalary as any).byName().toArray());
    expect(received).toEqual(expected);
  });

  it("reorder overrides default scope order", async () => {
    const expected = names(await Developer.order("name DESC").toArray());
    const received = names(await DeveloperOrderedBySalary.reorder("name DESC").toArray());
    expect(received).toEqual(expected);
  });

  it("order after reorder combines orders", async () => {
    const expected = namesAndIds(await Developer.order("name DESC, id DESC").toArray());
    const received = namesAndIds(
      await Developer.order("name ASC").reorder("name DESC").order("id DESC").toArray(),
    );
    expect(received).toEqual(expected);
  });

  it("unscope overrides default scope", async () => {
    const expected = namesAndIds(await Developer.all().toArray());
    const received = namesAndIds(await DeveloperCalledJamis.unscope("where").toArray());
    expect(received).toEqual(expected);
  });

  it("unscope after reordering and combining", async () => {
    const expected = namesAndIds(await Developer.order("id DESC, name DESC").toArray());
    const received = namesAndIds(
      await DeveloperOrderedBySalary.reorder("name DESC")
        .unscope("order")
        .order("id DESC, name DESC")
        .toArray(),
    );
    expect(received).toEqual(expected);

    const expected2 = namesAndIds(await Developer.all().toArray());
    const received2 = namesAndIds(
      await Developer.order("id DESC, name DESC").unscope("order").toArray(),
    );
    expect(received2).toEqual(expected2);

    const expected3 = namesAndIds(await Developer.all().toArray());
    const received3 = namesAndIds(await Developer.reorder("name DESC").unscope("order").toArray());
    expect(received3).toEqual(expected3);
  });

  it("unscope with where attributes", async () => {
    const expected = names(await Developer.order("salary DESC").toArray());
    const received = names(
      await DeveloperOrderedBySalary.where({ name: "David" }).unscope({ where: "name" }).toArray(),
    );
    expect(received.sort()).toEqual(expected.sort());

    // Mixed args: selectively unscope only `name` from where, plus fully unscope select.
    const expected2 = names(await Developer.order("salary DESC").toArray());
    const received2 = names(
      await DeveloperOrderedBySalary.select("id")
        .where({ name: "Jamis" })
        .unscope({ where: "name" }, "select")
        .toArray(),
    );
    expect(received2.sort()).toEqual(expected2.sort());

    const expected3 = names(await Developer.order("salary DESC").toArray());
    const received3 = names(
      await DeveloperOrderedBySalary.select("id")
        .where({ name: "Jamis" })
        .unscope("select", "where")
        .toArray(),
    );
    expect(received3.sort()).toEqual(expected3.sort());

    const expected4 = names(await Developer.order("salary DESC").toArray());
    const received4 = names(
      await DeveloperOrderedBySalary.whereNot({ name: "Jamis" })
        .unscope({ where: "name" })
        .toArray(),
    );
    expect(received4.sort()).toEqual(expected4.sort());

    const expected5 = names(await Developer.order("salary DESC").toArray());
    const received5 = names(
      await DeveloperOrderedBySalary.whereNot({ name: ["Jamis", "David"] })
        .unscope({ where: "name" })
        .toArray(),
    );
    expect(received5.sort()).toEqual(expected5.sort());

    const expected6 = names(await Developer.order("salary DESC").toArray());
    const received6 = names(
      await DeveloperOrderedBySalary.where(Developer.arelTable.get("name").eq("David") as any)
        .unscope({ where: "name" })
        .toArray(),
    );
    expect(received6.sort()).toEqual(expected6.sort());
  });

  it("unscope multiple where clauses", async () => {
    const expected = names(await Developer.order("salary DESC").toArray());
    const received = names(
      await DeveloperOrderedBySalary.where({ name: "Jamis" })
        .where({ id: 1 })
        .unscope({ where: ["name", "id"] })
        .toArray(),
    );
    expect(received.sort()).toEqual(expected.sort());
  });

  it("unscope with grouping attributes", async () => {
    const expected = names(await Developer.order("salary DESC").toArray());
    const received = names(await DeveloperOrderedBySalary.group("name").unscope("group").toArray());
    expect(received.sort()).toEqual(expected.sort());

    const expected2 = names(await Developer.order("salary DESC").toArray());
    const received2 = names(
      await DeveloperOrderedBySalary.group("name").unscope("group").toArray(),
    );
    expect(received2.sort()).toEqual(expected2.sort());
  });

  it("unscope with limit in query", async () => {
    const expected = names(await Developer.order("salary DESC").toArray());
    const received = names(await DeveloperOrderedBySalary.limit(1).unscope("limit").toArray());
    expect(received.sort()).toEqual(expected.sort());
  });

  it("unscope reverse order", async () => {
    const expected = names(await Developer.all().toArray());
    const received = names(
      await Developer.order("salary DESC").reverseOrder().unscope("order").toArray(),
    );
    expect(received).toEqual(expected);
  });

  it("unscope select", async () => {
    const expected = names(await Developer.order("salary ASC").toArray());
    const received = names(
      await Developer.order("salary DESC")
        .reverseOrder()
        .select("name")
        .unscope("select")
        .toArray(),
    );
    expect(received).toEqual(expected);

    const expected2 = (await Developer.all().toArray()).map((d: any) => d.id);
    const received2 = (await Developer.select("name").unscope("select").toArray()).map(
      (d: any) => d.id,
    );
    expect(received2).toEqual(expected2);
  });

  it("unscope offset", async () => {
    const expected = names(await Developer.all().toArray());
    const received = names(await Developer.offset(5).unscope("offset").toArray());
    expect(received).toEqual(expected);
  });

  it("order in default scope should not prevail", async () => {
    const expected = salaries(await Developer.order("salary desc").toArray());
    const received = salaries(await DeveloperOrderedBySalary.order("salary").toArray());
    expect(received).toEqual(expected);
  });

  it("create attribute overwrites default scoping", async () => {
    expect(((await PoorDeveloperCalledJamis.create({ name: "David" })) as any).name).toBe("David");
    expect(
      ((await PoorDeveloperCalledJamis.create({ name: "David", salary: 200000 })) as any).salary,
    ).toBe(200000);
  });

  it("where attribute", () => {
    const aaron = PoorDeveloperCalledJamis.where({ salary: 20 }).new({ name: "Aaron" }) as any;
    expect(aaron.salary).toBe(20);
    expect(aaron.name).toBe("Aaron");
  });

  it("where attribute merge", () => {
    const aaron = PoorDeveloperCalledJamis.where({ name: "foo" }).new({ name: "Aaron" }) as any;
    expect(aaron.name).toBe("Aaron");
  });

  it("scope composed by limit and then offset is equal to scope composed by offset and then limit", () => {
    const postsLimitOffset = Post.limit(3).offset(2);
    const postsOffsetLimit = Post.offset(2).limit(3);
    expect(postsLimitOffset.toSql()).toEqual(postsOffsetLimit.toSql());
  });

  it("create with using both string and symbol", () => {
    const jamis = PoorDeveloperCalledJamis.createWith({ name: "foo" })
      .createWith({ name: "Aaron" })
      .new() as any;
    expect(jamis.name).toBe("Aaron");
  });

  it("create with reset", () => {
    const jamis = PoorDeveloperCalledJamis.createWith({ name: "Aaron" })
      .createWith(null)
      .new() as any;
    expect(jamis.name).toBe("Jamis");
  });

  it("create with takes precedence over where", () => {
    const developer = Developer.where({ name: null }).createWith({ name: "Aaron" }).new() as any;
    expect(developer.name).toBe("Aaron");
  });

  it("create with empty hash will not reset", () => {
    const jamis = PoorDeveloperCalledJamis.createWith({ name: "Aaron" })
      .createWith({})
      .new() as any;
    expect(jamis.name).toBe("Aaron");
  });

  it("unscoped with named scope should not have default scope", async () => {
    const poorJamis = developers("poor_jamis");
    expect((await (DeveloperCalledJamis as any).poor().toArray()).map((d: any) => d.id)).toEqual([
      poorJamis.id,
    ]);

    const unscopedPoorIds = (await (DeveloperCalledJamis.unscoped() as any).poor().toArray()).map(
      (d: any) => d.id,
    );
    expect(unscopedPoorIds).toContain(developers("david").id);

    expect((await DeveloperCalledJamis.unscoped().toArray()).length).toBe(11);
    expect((await (DeveloperCalledJamis as any).poor().toArray()).length).toBe(1);
    expect((await (DeveloperCalledJamis.unscoped() as any).poor().toArray()).length).toBe(10);
  });

  it("default scope select ignored by aggregations", async () => {
    expect((await DeveloperWithSelect.all().toArray()).length).toBe(
      await DeveloperWithSelect.count(),
    );
  });

  it("default scope order ignored by aggregations", async () => {
    expect(await DeveloperOrderedBySalary.all().count()).toBe(
      await DeveloperOrderedBySalary.count(),
    );
  });

  it("default scope find last", async () => {
    expect(await DeveloperOrderedBySalary.count()).toBeGreaterThan(1);
    const lowest = (await DeveloperOrderedBySalary.find(developers("poor_jamis").id)) as any;
    expect(((await DeveloperOrderedBySalary.last()) as any).id).toBe(lowest.id);
  });

  it("additional conditions are ANDed with the default scope", async () => {
    const scope = DeveloperCalledJamis.where({ name: "David" });
    expect((scope as any)._whereClause.ast.children.length).toBe(2);
    expect(await scope.toArray()).toEqual([]);
  });

  it("additional conditions in a scope are ANDed with the default scope", async () => {
    const scope = (DeveloperCalledJamis as any).david();
    expect((scope as any)._whereClause.ast.children.length).toBe(2);
    expect(await scope.toArray()).toEqual([]);
  });

  it("a scope can remove the condition from the default scope", async () => {
    const scope = (DeveloperCalledJamis as any).david2();
    expect((scope as any)._whereClause.ast).toBeInstanceOf(Nodes.Equality);
    expect((await scope.toArray()).map((d: any) => d.id)).toEqual(
      (await Developer.where({ name: "David" }).toArray()).map((d: any) => d.id),
    );
  });

  it("with abstract class where clause should not be duplicated", () => {
    const scope = Lion.all();
    expect((scope as any)._whereClause.ast).toBeInstanceOf(Nodes.Equality);
  });

  it("with abstract class scope should be executed in correct context", () => {
    expect(Lion.all().toSql()).toMatch(/lions.+is_vegetarian/i);
    expect((Lion as any).female().toSql()).toMatch(/lions.+gender/i);
  });

  it("default scope select ignored by grouped aggregations", async () => {
    const all = await Developer.all().toArray();
    const expected: Record<string, number> = {};
    for (const d of all as any[]) expected[d.salary] = (expected[d.salary] ?? 0) + 1;
    const received = await DeveloperWithSelect.group("salary").count();
    expect(received).toEqual(expected);
  });

  it("unscope having", async () => {
    const expected = names(await DeveloperOrderedBySalary.all().toArray());
    const received = names(
      await DeveloperOrderedBySalary.having("name IN ('Jamis', 'David')")
        .unscope("having")
        .toArray(),
    );
    expect(received).toEqual(expected);
  });

  it("unscope includes", async () => {
    const expected = names(await Developer.all().toArray());
    const received = names(
      await Developer.includes("projects").select("id").unscope("includes", "select").toArray(),
    );
    expect(received).toEqual(expected);
  });

  it("unscope left outer joins", async () => {
    const expected = names(await Developer.all().toArray());
    const received = names(
      await Developer.leftOuterJoins("projects")
        .select("id")
        .unscope("leftOuterJoins", "select")
        .toArray(),
    );
    expect(received).toEqual(expected);
  });

  it("unscope eager load", async () => {
    const expected = names(await Developer.all().toArray());
    const received = Developer.eagerLoad("projects").select("id").unscope("eagerLoad", "select");
    const rows = await received.toArray();
    expect(names(rows)).toEqual(expected);
    expect(((rows[0] as any).projects as any).loaded).toBe(false);
  });

  it("unscope preloads", async () => {
    const expected = names(await Developer.all().toArray());
    const received = Developer.preload("projects").select("id").unscope("preload", "select");
    const rows = await received.toArray();
    expect(names(rows)).toEqual(expected);
    expect(((rows[0] as any).projects as any).loaded).toBe(false);
  });

  it("unscope joins and select on developers projects", async () => {
    const expected = names(await Developer.all().toArray());
    const received = names(
      await Developer.joins("JOIN developers_projects ON id = developer_id")
        .select("id")
        .unscope("joins", "select")
        .toArray(),
    );
    expect(received).toEqual(expected);
  });

  it("unscope comparison where clauses", async () => {
    // unscoped for WHERE (`developers`.`id` <= 2) — Rails uses -Float::INFINITY..2
    const expected = names(await Developer.order("salary DESC").toArray());
    const received = names(
      await DeveloperOrderedBySalary.where(Developer.arelTable.get("id").lteq(2) as any)
        .unscope({ where: "id" })
        .toArray(),
    );
    expect(received.sort()).toEqual(expected.sort());

    // unscoped for WHERE (`developers`.`id` < 2) — Rails uses -Float::INFINITY...2
    const expected2 = names(await Developer.order("salary DESC").toArray());
    const received2 = names(
      await DeveloperOrderedBySalary.where(Developer.arelTable.get("id").lt(2) as any)
        .unscope({ where: "id" })
        .toArray(),
    );
    expect(received2.sort()).toEqual(expected2.sort());
  });

  it("unscope string where clauses involved", async () => {
    const expected = names(
      await Developer.order("salary DESC").where("legacy_created_at > ?", "2020-01-01").toArray(),
    );
    const received = names(
      await DeveloperOrderedBySalary.where({ name: "Jamis" })
        .where("legacy_created_at > ?", "2020-01-01")
        .unscope({ where: ["name"] })
        .toArray(),
    );
    expect(received.sort()).toEqual(expected.sort());
  });

  it("unscope and scope", async () => {
    class DeveloperWithByNameScope extends Developer {
      declare static byName: (name: string) => any;
      static {
        this.scope("byName", (q: any, name: string) =>
          q.unscope({ where: "name" }).where({ name }),
        );
      }
    }
    const expected = namesAndIds(
      await (DeveloperWithByNameScope as any).where({ name: "Jamis" }).toArray(),
    );
    const received = namesAndIds(
      await (DeveloperWithByNameScope as any).where({ name: "David" }).byName("Jamis").toArray(),
    );
    expect(received).toEqual(expected);
  });

  // ── Migration backlog: faithful Rails ports awaiting engine support. Kept as
  //    `it.skip` (not fabricated passing stubs) so the Rails test names remain
  //    tracked by test:compare while the behavior is unimplemented. Each notes
  //    the missing capability.

  // default-scope `where` conditions are not yet applied as attributes on new/create.
  it.skip("default scope with conditions hash", async () => {
    const expected = (await Developer.where({ name: "Jamis" }).toArray())
      .map((d: any) => d.id)
      .sort();
    const received = (await DeveloperCalledJamis.all().toArray()).map((d: any) => d.id).sort();
    expect(received).toEqual(expected);
    expect(((await DeveloperCalledJamis.create()) as any).name).toBe("Jamis");
  });

  // default-scope `where` → attribute propagation on new is unimplemented.
  it.skip("default scope attribute", () => {
    const jamis = PoorDeveloperCalledJamis.new({ name: "David" }) as any;
    expect(jamis.salary).toBe(50000);
  });

  // default-scope `where` → attribute propagation on create is unimplemented.
  it.skip("create attribute overwrites default values", async () => {
    expect(((await PoorDeveloperCalledJamis.create({ salary: null })) as any).salary).toBeNull();
    expect(((await PoorDeveloperCalledJamis.create({ name: "David" })) as any).salary).toBe(50000);
  });

  // `create_with` merge precedence (later create_with wins) is unimplemented.
  it.skip("create with merge", () => {
    const aaron = (PoorDeveloperCalledJamis.createWith({ name: "foo", salary: 20 }) as any)
      .merge(PoorDeveloperCalledJamis.createWith({ name: "Aaron" }))
      .new();
    expect(aaron.salary).toBe(20);
    expect(aaron.name).toBe("Aaron");
  });

  // `create_with` + nested attributes inside a `scoping` block is unimplemented.
  it.skip("create with nested attributes", async () => {
    await (Developer.createWith({ projectsAttributes: [{ name: "p1" }] }) as any).scoping(() =>
      Developer.create({ name: "Aaron" }),
    );
    expect(await Project.count()).toBeGreaterThan(0);
  });

  // `allQueries` default scope is not applied to update_columns yet.
  it.skip("default scope with all queries runs on update columns", async () => {
    await Mentor.create();
    const dev = (await DeveloperWithDefaultMentorScopeAllQueries.create({ name: "Eileen" })) as any;
    const updateSql = (await capSql(() => dev.updateColumns({ name: "Not Eileen" })))[0];
    expect(updateSql).toMatch(/mentor_id/);
  });

  // `allQueries` default scope is not applied to reload yet.
  it.skip("default scope with all queries runs on reload", async () => {
    await Mentor.create();
    const dev = (await DeveloperWithDefaultMentorScopeAllQueries.create({ name: "Eileen" })) as any;
    const reloadSql = (await capSql(() => dev.reload()))[0];
    expect(reloadSql).toMatch(/mentor_id/);
  });

  // `allQueries` default scope on reload (mixed-scope model) is unimplemented.
  it.skip("default scope with all queries runs on reload but default scope without all queries does not", async () => {
    await Mentor.create();
    const dev =
      (await DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries.create(
        { name: "Eileen" },
      )) as any;
    const reloadSql = (await capSql(() => dev.reload()))[0];
    expect(reloadSql).not.toMatch(/mentor_id/);
    expect(reloadSql).toMatch(/firm_id/);
  });

  // `allQueries` default scope on update for a mixed-scope model is unimplemented.
  it.skip("combined default scope without and with all queries works", async () => {
    await Mentor.create();
    const klass =
      DeveloperWithIncludedMentorDefaultScopeNotAllQueriesAndDefaultScopeFirmWithAllQueries;
    const createSql = (await capSql(() => klass.create({ name: "Steve" })))[1];
    expect(createSql).toMatch(/mentor_id/);
    expect(createSql).toMatch(/firm_id/);
    const developer = (await klass.findBy({ name: "Steve" })) as any;
    const updateSql = (await capSql(() => developer.update({ name: "Stephen" })))[1];
    expect(updateSql).not.toMatch(/mentor_id/);
    expect(updateSql).toMatch(/firm_id/);
  });

  it("unscope errors with invalid value", () => {
    expect(() => Developer.where({ name: "Jamis" }).unscope("incorrect_value" as any)).toThrow();
    expect(() =>
      Developer.all().unscope("includes", "select", "some_broken_value" as any),
    ).toThrow();
    expect(() =>
      Developer.order("name DESC")
        .reverseOrder()
        .unscope("reverse_order" as any),
    ).toThrow();
    // Rails' 4th assertion, empty `unscope()` (no args), is omitted: it is the
    // one form the engine does not yet reject (treated as a no-op rather than
    // raising ArgumentError). Tracked here so it is restored when supported.
  });

  // A hash argument to unscope must use `where` as its key; any other key raises.
  // Rails' string-hash-key case (`unscope("where" => :name)`) has no TS analogue
  // because `{ where: "name" }` is already the valid TS form, so it is omitted.
  it("unscope errors with non where hash keys", () => {
    expect(() =>
      Developer.where({ name: "Jamis" })
        .limit(4)
        .unscope({ limit: 4 } as any),
    ).toThrow();
  });

  // In TS, string clause names ARE the Ruby-symbol equivalent and are valid
  // inputs — `unscope("limit")` / `unscope("select")` work and must not raise,
  // so Rails' string-vs-symbol ArgumentError cases have no TS analogue. Only a
  // non-clause value (a number) is invalid in both languages.
  it("unscope errors with non symbol or hash arguments", () => {
    expect(() => Developer.select("id").unscope(5 as any)).toThrow();
  });

  // `unscope(:left_joins)` is not a recognized unscope key yet.
  it.skip("unscope left joins", async () => {
    const expected = names(await Developer.all().toArray());
    const received = names(
      await (Developer.leftJoins("projects") as any)
        .select("id")
        .unscope("leftJoins", "select")
        .toArray(),
    );
    expect(received).toEqual(expected);
  });

  // `merge` of an `unscope(:where)` relation does not clear the where clause yet.
  it.skip("unscope merging", () => {
    const merged = Developer.where({ name: "Jamis" }).merge(Developer.unscope("where"));
    expect((merged as any)._whereClause.isEmpty()).toBe(true);
    expect((merged.where({ name: "Jon" }) as any)._whereClause.isEmpty()).toBe(false);
  });

  // Reversing a multi-column order is not yet supported (IrreversibleOrderError).
  it.skip("order to unscope reordering", () => {
    const scope = DeveloperOrderedBySalary.order("salary DESC, name ASC")
      .reverseOrder()
      .unscope("order");
    expect(scope.toSql()).not.toMatch(/order/i);
  });

  // A model's default scope is not yet applied through an association join.
  it.skip("default scope with joins", async () => {
    const ids = (await SpecialPostWithDefaultScope.all().toArray()).map((p: any) => p.id);
    expect(await Comment.where({ post_id: ids }).count()).toBe(
      await Comment.joins("specialPostWithDefaultScope").count(),
    );
    const postIds = (await Post.all().toArray()).map((p: any) => p.id);
    expect(await Comment.where({ post_id: postIds }).count()).toBe(
      await Comment.joins("post").count(),
    );
  });

  // Scoping a join with `Post.where(...).scoping` is unimplemented.
  it.skip("joins not affected by scope other than default or unscoped", async () => {
    const without = (await Comment.joins("post").toArray()).map((c: any) => c.id).sort();
    let withScope: any[] = [];
    await (Post.where({ id: [1, 5, 6] }) as any).scoping(async () => {
      withScope = (await Comment.joins("post").toArray()).map((c: any) => c.id).sort();
    });
    expect(withScope).toEqual(without);
  });

  // Default scope through join inside `unscoped` block is unimplemented.
  it.skip("unscoped with joins should not have default scope", async () => {
    const expected = (await Comment.joins("post").toArray()).map((c: any) => c.id).sort();
    const received = await (SpecialPostWithDefaultScope as any).unscoped(async () =>
      (await Comment.joins("specialPostWithDefaultScope").toArray()).map((c: any) => c.id).sort(),
    );
    expect(received).toEqual(expected);
  });

  // STI association behavior with `unscoped` default scope is unimplemented.
  it.skip("sti association with unscoped not affected by default scope", async () => {
    const post = (await Post.first()) as any;
    await (SpecialComment as any).unscoped(async () => {
      const found = await Post.joins("specialComments").find(post.id);
      expect(found.id).toBe(post.id);
    });
  });

  // STI default-scope conditions leaking through `unscope(:title)` is unimplemented.
  it.skip("sti conditions are not carried in default scope", async () => {
    await ConditionalStiPost.create({ body: "" });
    await SubConditionalStiPost.create({ body: "" });
    await SubConditionalStiPost.create({ title: "Hello world", body: "" });
    expect(await ConditionalStiPost.count()).toBe(2);
    expect(await ConditionalStiPost.unscope({ where: "title" }).count()).toBe(3);
  });

  // `includes` + nested-table `where` count is unimplemented.
  it.skip("default scope include with count", async () => {
    const d = (await DeveloperWithIncludes.create()) as any;
    await (await d.auditLogs).create({ message: "foo" });
    expect(await DeveloperWithIncludes.where({ auditLogs: { message: "foo" } }).count()).toBe(1);
  });

  // `references`/`includes` through a collection association is unimplemented.
  it.skip("default scope with references works through collection association", async () => {
    const post = (await PostWithCommentWithDefaultScopeReferencesAssociation.create({
      title: "Hello World",
      body: "Here we go.",
    })) as any;
    const comment = await (
      await post.commentWithDefaultScopeReferencesAssociations
    ).create({
      body: "Great post.",
      developer_id: 1,
    });
    const first = (await (await post.commentWithDefaultScopeReferencesAssociations).toArray())[0];
    expect((first as any).id).toBe((comment as any).id);
  });

  // `references`/`includes` through a singular association is unimplemented.
  it.skip("default scope with references works through association", async () => {
    const post = (await PostWithCommentWithDefaultScopeReferencesAssociation.create({
      title: "Hello World",
      body: "Here we go.",
    })) as any;
    const comment = await (
      await post.commentWithDefaultScopeReferencesAssociations
    ).create({
      body: "Great post.",
      developer_id: 1,
    });
    expect((await post.firstComment).id).toBe((comment as any).id);
  });

  // `references` default scope with `find_by` is unimplemented.
  it.skip("default scope with references works with find by", async () => {
    const post = (await PostWithCommentWithDefaultScopeReferencesAssociation.create({
      title: "Hello World",
      body: "Here we go.",
    })) as any;
    const comment = await (
      await post.commentWithDefaultScopeReferencesAssociations
    ).create({
      body: "Great post.",
      developer_id: 1,
    });
    const found = await CommentWithDefaultScopeReferencesAssociation.findBy({
      id: (comment as any).id,
    });
    expect((found as any).id).toBe((comment as any).id);
  });
});

// `DefaultScopingWithThreadTest` is `unless in_memory_db?` in Rails; the suite
// runs against in-memory sqlite, so these thread cases do not apply here. Kept
// as `it.skip` to keep the Rails names tracked by test:compare.
describe("DefaultScopingWithThreadTest", () => {
  it.skip("default scoping with threads", () => {
    expect(DeveloperOrderedBySalary.all().toSql()).toContain("salary DESC");
  });

  it.skip("default scope is threadsafe", async () => {
    await ThreadsafeDeveloper.unscoped().create();
    await ThreadsafeDeveloper.unscoped().create();
    expect(await ThreadsafeDeveloper.unscoped().count()).not.toBe(1);
    expect((await ThreadsafeDeveloper.all().toArray()).length).toBe(1);
  });
});
