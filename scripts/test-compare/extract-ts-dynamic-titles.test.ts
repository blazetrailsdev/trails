import { describe, expect, it } from "vitest";
import { extractTestsFromSource } from "./extract-ts-core.js";

/** The extracted test names, in order, paired with their `dynamic` flag. */
function titles(source: string) {
  const info = extractTestsFromSource(source, "packages/activerecord/src/x.test.ts");
  return info.testCases.map((tc) => [tc.description, !!tc.dynamic] as const);
}

describe("statically expanded loop-generated it() titles", () => {
  it("expands a loop over a literal array", () => {
    expect(
      titles(`
        describe("Suite", () => {
          for (const filter of ["validation", "save"] as const) {
            it(\`cancellation from before filters rollbacks in \${filter}\`, () => {});
            it(\`cancellation from before filters rollbacks in \${filter}!\`, () => {});
          }
        });
      `),
    ).toEqual([
      ["cancellation from before filters rollbacks in validation", false],
      ["cancellation from before filters rollbacks in validation!", false],
      ["cancellation from before filters rollbacks in save", false],
      ["cancellation from before filters rollbacks in save!", false],
    ]);
  });

  it("expands a loop over a const array declared in the file", () => {
    expect(
      titles(`
        const DELEGATED_ARRAY_METHODS = ["join", "reverse"];
        describe("Suite", () => {
          for (const method of DELEGATED_ARRAY_METHODS) {
            it(\`test_delegates_\${method}_to_Array\`, () => {});
          }
        });
      `),
    ).toEqual([
      ["test_delegates_join_to_Array", false],
      ["test_delegates_reverse_to_Array", false],
    ]);
  });

  it("binds the literal positions of a destructured tuple", () => {
    expect(
      titles(`
        const RECORD_DELEGATES = [
          ["to_fs", (rel) => rel.toFs()],
          ["as_json", (rel) => rel.asJson()],
        ];
        for (const [rubyName, invoke] of RECORD_DELEGATES) {
          it(\`no arguments to \${rubyName} raise errors\`, () => {});
        }
      `),
    ).toEqual([
      ["no arguments to to_fs raise errors", false],
      ["no arguments to as_json raise errors", false],
    ]);
  });

  it("expands a nested loop and a multi-span title", () => {
    expect(
      titles(`
        for (const loader of ["json", "message_pack"]) {
          for (const dumper of ["marshal_7_0"]) {
            it(\`\${JSON.stringify(loader)} serializer can load \${JSON.stringify(dumper)} dump\`, () => {});
          }
        }
      `),
    ).toEqual([
      ['"json" serializer can load "marshal_7_0" dump', false],
      ['"message_pack" serializer can load "marshal_7_0" dump', false],
    ]);
  });

  it("reports a loop whose values are not statically evaluable", () => {
    expect(
      titles(`
        const FORMATS = Object.keys(SERIALIZERS);
        for (const format of FORMATS) {
          it(\`\${format} serializer logs unrecognized payloads\`, () => {});
        }
        for (const [singular, plural] of Object.entries(SingularToPlural)) {
          it(\`pluralize singular \${singular}\`, () => {});
        }
      `),
    ).toEqual([
      ["<expr> serializer logs unrecognized payloads", true],
      ["pluralize singular <expr>", true],
    ]);
  });

  it("rejects the whole array when one element is not statically evaluable", () => {
    expect(
      titles(`
        for (const format of [JSON_FORMAT, "marshal_7_0"]) {
          it(\`\${format} serializer logs unrecognized payloads\`, () => {});
        }
      `),
    ).toEqual([["<expr> serializer logs unrecognized payloads", true]]);
  });

  it("leaves a span naming something other than the loop variable dynamic", () => {
    expect(
      titles(`
        for (const method of ["join"]) {
          it(\`rejects an adapter whose \${method} a proxy intercepts on \${adapterType}\`, () => {});
        }
      `),
    ).toEqual([["rejects an adapter whose <expr> a proxy intercepts on <expr>", true]]);
  });
});

/** The extracted tests' full paths, in order. */
function paths(source: string) {
  const info = extractTestsFromSource(source, "packages/activerecord/src/x.test.ts");
  return info.testCases.map((tc) => tc.path);
}

describe("dynamically-named describe titles", () => {
  it("enters a template-titled describe and keeps it in its children's ancestors", () => {
    expect(
      paths(`
        describe(\`\${adapter} quoting\`, () => {
          it("quotes a string", () => {});
        });
      `),
    ).toEqual(["<expr> quoting > quotes a string"]);
  });

  // `migration/foreign-key.test.ts` generated three suites from a
  // `foreignKeyChangeColumnTest(name, …)` helper: the bare-identifier title read
  // as null, the describe fell through, and all six contained `it`s were
  // attributed to the enclosing `Migration` suite (PR #7252).
  it("enters an identifier-titled describe rather than reparenting its children", () => {
    expect(
      paths(`
        describe("Migration", () => {
          function makeSuite(name) {
            describe(name, () => {
              it("adds a foreign key", () => {});
            });
          }
          makeSuite("ForeignKeyChangeColumnTest");
        });
      `),
    ).toEqual(["Migration > <expr> > adds a foreign key"]);
  });
});
