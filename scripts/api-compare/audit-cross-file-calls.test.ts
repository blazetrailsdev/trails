import { describe, expect, it } from "vitest";

import type { Entity, Mismatch } from "./audit-cross-file-calls.js";
import {
  buildPackageIndex,
  candidateNames,
  classify,
  classifyRow,
  includeGraphFiles,
  edgeKindOf,
  isCrossFile,
  looseOnlyRows,
  reachableFiles,
} from "./audit-cross-file-calls.js";

function entity(
  name: string,
  file: string,
  methods: { name: string; calls?: string[] }[],
  edges: { includes?: string[]; extends?: string[]; delegatesTo?: string[] } = {},
): Entity {
  return {
    name,
    file,
    includes: edges.includes ?? [],
    extends: edges.extends ?? [],
    ...(edges.delegatesTo ? { delegatesTo: edges.delegatesTo } : {}),
    instanceMethods: methods,
    classMethods: [],
  };
}

function mismatch(tsFile: string, tsName: string, rubyFile = "adapter.rb"): Mismatch {
  return { package: "activerecord", tsFile, tsName, rubyFile, rubyName: tsName, missing: [] };
}

describe("candidateNames", () => {
  it("reads every TS candidate off a missing-call row", () => {
    expect(candidateNames("quoted_scope → quotedScope")).toEqual(["quotedScope"]);
  });

  it("admits the JS-native alias the gate itself accepts", () => {
    expect(candidateNames("any? → isAny|any")).toEqual(["isAny", "any", "some"]);
  });
});

describe("includeGraphFiles", () => {
  it("walks includes and extends transitively", () => {
    const index = buildPackageIndex([
      entity("Adapter", "adapter.ts", [], { includes: ["Quoting"] }),
      entity("Quoting", "quoting.ts", [], { extends: ["Base"] }),
      entity("Base", "base.ts", []),
    ]);
    expect([...includeGraphFiles("adapter.ts", index)].sort()).toEqual(["base.ts", "quoting.ts"]);
  });

  it("does not reach a collaborator that no recorded edge names", () => {
    const index = buildPackageIndex([
      entity("Adapter", "pg-adapter.ts", []),
      entity("PgSchemaStatements", "pg/schema-statements-class.ts", []),
    ]);
    expect(includeGraphFiles("pg-adapter.ts", index).size).toBe(0);
  });
});

describe("reachableFiles", () => {
  const index = buildPackageIndex([
    entity("Adapter", "pg-adapter.ts", [], {
      includes: ["Quoting"],
      delegatesTo: ["PgSchemaStatements"],
    }),
    entity("Quoting", "quoting.ts", []),
    entity("PgSchemaStatements", "pg/schema-statements-class.ts", []),
  ]);

  it("ignores delegation edges unless asked to follow them", () => {
    expect([...reachableFiles("pg-adapter.ts", index, false).keys()]).toEqual(["quoting.ts"]);
  });

  it("tags a file the delegation edge reaches", () => {
    expect(Object.fromEntries(reachableFiles("pg-adapter.ts", index, true))).toEqual({
      "quoting.ts": "include",
      "pg/schema-statements-class.ts": "delegation",
    });
  });
});

describe("looseOnlyRows", () => {
  const index = buildPackageIndex([
    entity("Adapter", "pg-adapter.ts", [{ name: "indexes", calls: [] }], {
      delegatesTo: ["PgSchemaStatements"],
    }),
    entity("PgSchemaStatements", "pg/schema-statements-class.ts", [
      { name: "unrelated", calls: ["quotedScope"] },
    ]),
  ]);
  const indexes = new Map([["activerecord", index]]);
  const rows = classify(
    [{ ...mismatch("pg-adapter.ts", "indexes"), missing: ["quoted_scope → quotedScope"] }],
    indexes,
  );

  it("credits a row to an unrelated method in the delegation target's file", () => {
    expect(looseOnlyRows(rows, indexes, true)).toEqual([
      {
        ...rows[0],
        resolutions: [
          {
            file: "pg/schema-statements-class.ts",
            edgeKind: "delegation",
            methods: ["unrelated"],
          },
        ],
      },
    ]);
  });

  it("reports every resolving file, in name order", () => {
    const many = buildPackageIndex([
      entity("Adapter", "pg-adapter.ts", [{ name: "indexes", calls: [] }], {
        delegatesTo: ["Zeta", "Alpha"],
      }),
      entity("Zeta", "zeta.ts", [{ name: "unrelated", calls: ["quotedScope"] }]),
      entity("Alpha", "alpha.ts", [{ name: "unrelated", calls: ["quotedScope"] }]),
    ]);
    const manyIndexes = new Map([["activerecord", many]]);
    const manyRows = classify(
      [{ ...mismatch("pg-adapter.ts", "indexes"), missing: ["quoted_scope → quotedScope"] }],
      manyIndexes,
    );
    expect(looseOnlyRows(manyRows, manyIndexes, true)[0].resolutions.map((r) => r.file)).toEqual([
      "alpha.ts",
      "zeta.ts",
    ]);
  });

  it("calls a row include-resolved when any reachable include edge also makes the call", () => {
    const both = buildPackageIndex([
      entity("Adapter", "pg-adapter.ts", [{ name: "indexes", calls: [] }], {
        includes: ["Quoting"],
        delegatesTo: ["Stmts"],
      }),
      entity("Quoting", "quoting.ts", [{ name: "other", calls: ["quotedScope"] }]),
      entity("Stmts", "stmts.ts", [{ name: "unrelated", calls: ["quotedScope"] }]),
    ]);
    const bothIndexes = new Map([["activerecord", both]]);
    const bothRows = classify(
      [{ ...mismatch("pg-adapter.ts", "indexes"), missing: ["quoted_scope → quotedScope"] }],
      bothIndexes,
    );
    expect(edgeKindOf(looseOnlyRows(bothRows, bothIndexes, true)[0])).toBe("include");
  });

  it("resolves nothing without the delegation edge", () => {
    expect(looseOnlyRows(rows, indexes, false)).toEqual([]);
  });
});

describe("classifyRow", () => {
  const index = buildPackageIndex([
    entity("Adapter", "adapter.ts", [{ name: "indexes", calls: ["pg"] }], {
      includes: ["Quoting"],
    }),
    entity("Quoting", "quoting.ts", [{ name: "indexes", calls: ["quotedScope"] }]),
    entity("Other", "other.ts", [{ name: "indexes", calls: ["schemaQuery"] }]),
    entity("Shell", "shell.ts", [{ name: "onlyHere" }]),
  ]);

  it("resolves through the recorded include graph", () => {
    expect(
      classifyRow(mismatch("adapter.ts", "indexes"), "quoted_scope → quotedScope", index),
    ).toEqual({ bucket: "include-graph", resolvedIn: "quoting.ts" });
  });

  it("marks a same-named body no edge reaches as a collaborator", () => {
    expect(
      classifyRow(mismatch("adapter.ts", "indexes"), "schema_query → schemaQuery", index),
    ).toEqual({ bucket: "collaborator", resolvedIn: "other.ts" });
  });

  it("keeps a call no definition makes as a real divergence", () => {
    expect(
      classifyRow(mismatch("adapter.ts", "indexes"), "presence → presence", index).bucket,
    ).toBe("divergence");
  });

  it("resolves a body ported as a mixed-in file function", () => {
    const withFunctions = buildPackageIndex(
      [entity("Model", "model.ts", [{ name: "aliasAttribute", calls: [] }])],
      { "attribute-methods.ts": [{ name: "aliasAttribute", calls: ["attributeAliases"] }] },
    );
    expect(
      classifyRow(
        mismatch("model.ts", "aliasAttribute"),
        "attribute_aliases → attributeAliases",
        withFunctions,
      ),
    ).toEqual({ bucket: "collaborator", resolvedIn: "attribute-methods.ts" });
  });

  it("does not call a row unported when the name is defined outside the paired file", () => {
    expect(
      classifyRow(mismatch("quoting.ts", "indexes"), "presence → presence", index).bucket,
    ).toBe("divergence");
  });

  it("reports a sole definition with no call-set as unported", () => {
    expect(classifyRow(mismatch("shell.ts", "onlyHere"), "presence → presence", index).bucket).toBe(
      "unported",
    );
  });
});

describe("isCrossFile", () => {
  const row = {
    package: "activerecord",
    tsName: "indexes",
    call: "",
    bucket: "divergence" as const,
  };

  it("flags a Ruby file name-matched against a different TS file", () => {
    expect(
      isCrossFile({
        ...row,
        tsFile: "connection-adapters/postgresql-adapter.ts",
        rubyFile: "connection_adapters/postgresql/schema_statements.rb",
      }),
    ).toBe(true);
  });

  it("does not flag a same-stem pair across the naming conventions", () => {
    expect(
      isCrossFile({
        ...row,
        tsFile: "connection-adapters/postgresql-adapter.ts",
        rubyFile: "connection_adapters/postgresql_adapter.rb",
      }),
    ).toBe(false);
  });
});
