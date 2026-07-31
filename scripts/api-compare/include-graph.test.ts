import { describe, expect, it } from "vitest";

import { buildIncludeGraph, includeGraphCallSets, includeGraphEntities } from "./include-graph.js";
import type { ClassInfo, MethodInfo } from "./types.js";

function method(name: string, calls?: string[]): MethodInfo {
  return { name, params: [], visibility: "public", calls };
}

function entity(
  name: string,
  file: string,
  edges: { includes?: string[]; extends?: string[]; methods?: MethodInfo[] } = {},
): ClassInfo {
  return {
    name,
    file,
    includes: edges.includes ?? [],
    extends: edges.extends ?? [],
    instanceMethods: edges.methods ?? [],
    classMethods: [],
  };
}

const names = (entities: ClassInfo[]) => entities.map((e) => e.name).sort();

describe("includeGraphEntities", () => {
  it("reaches an entity through a recorded includes edge", () => {
    const graph = buildIncludeGraph([
      entity("PostgreSQLAdapter", "connection-adapters/postgresql-adapter.ts", {
        includes: ["PostgreSQLSchemaStatements"],
      }),
      entity(
        "PostgreSQLSchemaStatements",
        "connection-adapters/postgresql/schema-statements-class.ts",
      ),
    ]);
    expect(names(includeGraphEntities("connection-adapters/postgresql-adapter.ts", graph))).toEqual(
      ["PostgreSQLSchemaStatements"],
    );
  });

  it("follows extends edges transitively", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { extends: ["B"] }),
      entity("B", "b.ts", { includes: ["C"] }),
      entity("C", "c.ts"),
    ]);
    expect(names(includeGraphEntities("a.ts", graph))).toEqual(["B", "C"]);
  });

  it("terminates on a cycle", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { includes: ["B"] }),
      entity("B", "b.ts", { includes: ["A"] }),
    ]);
    expect(names(includeGraphEntities("a.ts", graph))).toEqual(["B"]);
  });

  it("drops an edge naming no entity in the package instead of matching loosely", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { includes: ["ActiveSupportConcern"] }),
      entity("Unrelated", "unrelated.ts"),
    ]);
    expect(includeGraphEntities("a.ts", graph)).toEqual([]);
  });

  it("does not reach a sibling implementation that shares a directory prefix", () => {
    const graph = buildIncludeGraph([
      entity("AbstractMysqlAdapter", "connection-adapters/abstract-mysql-adapter.ts"),
      entity(
        "PostgreSQLSchemaStatements",
        "connection-adapters/postgresql/schema-statements-class.ts",
      ),
    ]);
    expect(includeGraphEntities("connection-adapters/abstract-mysql-adapter.ts", graph)).toEqual(
      [],
    );
  });

  it("never returns an entity declared in the starting file", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { includes: ["B"] }),
      entity("B", "a.ts", { includes: ["A"] }),
    ]);
    expect(includeGraphEntities("a.ts", graph)).toEqual([]);
  });

  it("drops an ambiguous edge name rather than picking a candidate", () => {
    const graph = buildIncludeGraph([
      entity("SQLite3Adapter", "connection-adapters/sqlite3-adapter.ts", {
        includes: ["DatabaseStatements"],
      }),
      entity("DatabaseStatements", "connection-adapters/sqlite3/database-statements.ts"),
      entity("DatabaseStatements", "connection-adapters/mysql/database-statements.ts"),
    ]);
    expect(includeGraphEntities("connection-adapters/sqlite3-adapter.ts", graph)).toEqual([]);
  });

  it("collapses a barrel re-export onto its origin so the name stays unambiguous", () => {
    const store = entity("Store", "cache/store.ts");
    const barrel = entity("Store", "cache/index.ts");
    barrel.reExportedFrom = "cache/store.ts:Store";
    const graph = buildIncludeGraph([
      entity("FileStore", "cache/file-store.ts", { includes: ["Store"] }),
      store,
      barrel,
    ]);
    expect(includeGraphEntities("cache/file-store.ts", graph).map((e) => e.file)).toEqual([
      "cache/store.ts",
    ]);
  });

  it("returns nothing for a file with no recorded entity", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { includes: ["B"] }),
      entity("B", "b.ts"),
    ]);
    expect(includeGraphEntities("unknown.ts", graph)).toEqual([]);
  });
});

describe("includeGraphCallSets", () => {
  it("unions the same-named body on a reachable entity", () => {
    const graph = buildIncludeGraph([
      entity("PostgreSQLAdapter", "postgresql-adapter.ts", {
        includes: ["PostgreSQLSchemaStatements"],
        methods: [method("indexes", ["pgSchemaStatements", "indexes"])],
      }),
      entity("PostgreSQLSchemaStatements", "postgresql/schema-statements-class.ts", {
        methods: [method("indexes", ["query", "indexNameFor"])],
      }),
    ]);
    expect(
      [
        ...includeGraphCallSets(
          includeGraphEntities("postgresql-adapter.ts", graph),
          "indexes",
          graph,
        ).calls,
      ].sort(),
    ).toEqual(["indexNameFor", "query"]);
  });

  it("ignores a differently named body on a reachable entity", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { includes: ["B"] }),
      entity("B", "b.ts", { methods: [method("other", ["instrument"])] }),
    ]);
    expect(
      includeGraphCallSets(includeGraphEntities("a.ts", graph), "indexes", graph).calls.size,
    ).toBe(0);
  });

  it("does not credit a sibling entity that shares a barrel file with a reachable one", () => {
    const graph = buildIncludeGraph([
      entity("FileStore", "cache/file-store.ts", { includes: ["CacheStore"] }),
      entity("CacheStore", "cache/index.ts", { methods: [method("deleteMatched")] }),
      entity("MemoryStore", "cache/index.ts", {
        methods: [method("deleteMatched", ["instrument", "mergedOptions"])],
      }),
    ]);
    expect(
      includeGraphCallSets(
        includeGraphEntities("cache/file-store.ts", graph),
        "deleteMatched",
        graph,
      ).calls.size,
    ).toBe(0);
  });

  it("reads the mixin body ported as a file function on the reachable entity's file", () => {
    const graph = buildIncludeGraph(
      [
        entity("Relation", "relation.ts", { includes: ["QueryMethods"] }),
        entity("QueryMethods", "relation/query-methods.ts"),
      ],
      { "relation/query-methods.ts": [method("where", ["spawn", "whereClauseFactory"])] },
    );
    expect(
      [
        ...includeGraphCallSets(includeGraphEntities("relation.ts", graph), "where", graph).calls,
      ].sort(),
    ).toEqual(["spawn", "whereClauseFactory"]);
  });

  it("partitions negated calls out of the resolved set", () => {
    const graph = buildIncludeGraph([
      entity("A", "a.ts", { includes: ["B"] }),
      entity("B", "b.ts", { methods: [method("run", ["!includes", "map"])] }),
    ]);
    const sets = includeGraphCallSets(includeGraphEntities("a.ts", graph), "run", graph);
    expect([...sets.calls]).toEqual(["map"]);
    expect([...sets.negated]).toEqual(["includes"]);
  });
});
