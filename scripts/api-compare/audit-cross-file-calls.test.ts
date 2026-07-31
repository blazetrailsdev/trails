import { describe, expect, it } from "vitest";

import type { Entity, Mismatch } from "./audit-cross-file-calls.js";
import {
  buildPackageIndex,
  candidateNames,
  classifyRow,
  includeGraphFiles,
  isCrossFile,
} from "./audit-cross-file-calls.js";

function entity(
  name: string,
  file: string,
  methods: { name: string; calls?: string[] }[],
  edges: { includes?: string[]; extends?: string[] } = {},
): Entity {
  return {
    name,
    file,
    includes: edges.includes ?? [],
    extends: edges.extends ?? [],
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
