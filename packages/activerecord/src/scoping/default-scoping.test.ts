/**
 * Tests to increase Rails test coverage matching.
 * Test names are chosen to match Ruby test names from the Rails test suite.
 * Mirrors: activerecord/test/cases/scoping/default_scoping_test.rb
 *
 * Tests that exercise behavior the engine does not yet implement are left
 * unported (tracked as engine gaps, not fabricated): default-scope `where`
 * conditions applied as attributes on `new`/`create`, `allQueries` scopes on
 * `update_columns`/`reload`, default scope through joins, `unscope`
 * ArgumentError validation, `unscope(:where)` merging, `create_with` merge
 * precedence, reversing a multi-column order, `allQueries` scope on `update`
 * for a mixed-scope model, and `includes` + nested-table `where`. The
 * `DefaultScopingWithThreadTest` cases are `unless in_memory_db?` in Rails and
 * so do not apply on sqlite.
 */
import { describe, it, expect } from "vitest";
import { Nodes } from "@blazetrails/arel";
import "../index.js";
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
  DeveloperWithSelect,
} from "../test-helpers/models/developer.js";
import { Mentor } from "../test-helpers/models/mentor.js";
import { Post } from "../test-helpers/models/post.js";
import { Lion } from "../test-helpers/models/cat.js";

const names = (rows: any[]) => rows.map((r) => r.name);
const salaries = (rows: any[]) => rows.map((r) => r.salary);
const namesAndIds = (rows: any[]) => rows.map((r) => [r.name, r.id]);
// Rails capture_sql(include_schema: false): drop introspection queries so the
// SAVEPOINT/INSERT/UPDATE ordering matches Rails' .first/.second indexing.
const capSql = (fn: () => unknown) =>
  captureSql(fn as () => Promise<void>, { includeSchema: false });

describe("DefaultScopingTest", () => {
  const { developers } = useHandlerFixtures(["developers", "posts", "comments"], {
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
    )[1];
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
});
