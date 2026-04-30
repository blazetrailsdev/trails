import { describe, it, expect } from "vitest";
import { snakeToCamel, rubyMethodToTs, rubyFileToTs } from "./conventions.js";

describe("snakeToCamel", () => {
  it("converts standard snake_case to camelCase", () => {
    expect(snakeToCamel("has_many")).toBe("hasMany");
    expect(snakeToCamel("dispatch_cache")).toBe("dispatchCache");
    expect(snakeToCamel("collect_optimizer_hints")).toBe("collectOptimizerHints");
  });

  it("preserves leading underscores", () => {
    expect(snakeToCamel("_load_from")).toBe("_loadFrom");
    expect(snakeToCamel("_extract")).toBe("_extract");
  });

  it("collapses underscore-before-Capital so Rails dot-notation names camelCase cleanly", () => {
    // Drives the api:compare bridge that lets `visit_Arel_Nodes_X` Ruby
    // methods match `visitArelNodesX` TS methods.
    expect(snakeToCamel("visit_Arel_Nodes_SelectStatement")).toBe("visitArelNodesSelectStatement");
    expect(snakeToCamel("visit_Arel_Table")).toBe("visitArelTable");
    expect(snakeToCamel("visit_Arel_Attributes_Attribute")).toBe("visitArelAttributesAttribute");
    expect(snakeToCamel("visit_ActiveModel_Attribute")).toBe("visitActiveModelAttribute");
  });

  it("collapses runs of underscores (Ruby private-alias-target convention)", () => {
    // `def visit__regexp` in Rails dot.rb is the private alias target for
    // `visit_Arel_Nodes_Regexp` and friends. The TS form is `visitRegexp`
    // — runs of underscores collapse the same as a single underscore.
    expect(snakeToCamel("visit__regexp")).toBe("visitRegexp");
    expect(snakeToCamel("visit__no_edges")).toBe("visitNoEdges");
    expect(snakeToCamel("visit__children")).toBe("visitChildren");
  });

  it("handles single-segment names unchanged", () => {
    expect(snakeToCamel("name")).toBe("name");
    expect(snakeToCamel("expr")).toBe("expr");
  });
});

describe("rubyMethodToTs", () => {
  it("special-cases the common Ruby → JS aliases", () => {
    expect(rubyMethodToTs("to_s")).toEqual(["toString"]);
    expect(rubyMethodToTs("to_str")).toEqual(["toString"]);
    expect(rubyMethodToTs("to_json")).toEqual(["toJSON"]);
    expect(rubyMethodToTs("to_sql")).toEqual(["toSql"]);
    expect(rubyMethodToTs("initialize")).toEqual(["constructor"]);
  });

  it("transforms bang methods to *Bang", () => {
    expect(rubyMethodToTs("save!")).toEqual(["saveBang"]);
  });

  it("strips the trailing `=` from setter methods", () => {
    expect(rubyMethodToTs("name=")).toEqual(["name"]);
  });

  it("camelCases capitalized snake-case visit method names", () => {
    expect(rubyMethodToTs("visit_Arel_Nodes_SelectStatement")).toEqual([
      "visitArelNodesSelectStatement",
    ]);
    expect(rubyMethodToTs("visit__no_edges")).toEqual(["visitNoEdges"]);
  });
});

describe("rubyMethodToTs predicates", () => {
  it("strips the redundant is-prefix when the Ruby name already starts with is_", () => {
    // No `isPrefixed` fallback — that would let trails authors land
    // isIsNumber and still get api:compare credit, defeating the rule.
    expect(rubyMethodToTs("is_number?")).toEqual(["isNumber"]);
    expect(rubyMethodToTs("is_integer?")).toEqual(["isInteger"]);
    expect(rubyMethodToTs("is_hexadecimal_literal?")).toEqual(["isHexadecimalLiteral"]);
  });

  it("keeps prepending is for predicates that don't already start with one of the allowlisted prefixes", () => {
    expect(rubyMethodToTs("number?")).toEqual(["isNumber", "number"]);
    expect(rubyMethodToTs("blank?")).toEqual(["isBlank", "blank"]);
    expect(rubyMethodToTs("present?")).toEqual(["isPresent", "present"]);
  });

  it("does NOT treat names that merely camelize to start with 'is' as the is_*? family", () => {
    // The is_*? guard tests the Ruby BASE NAME, not the camel form.
    // `isolation_level?` camelizes to `isolationLevel` (starts with
    // 'is'), but the Ruby base doesn't start with `is_` — keep both
    // candidates so trails methods named either way still match.
    expect(rubyMethodToTs("isolation_level?")).toEqual(["isIsolationLevel", "isolationLevel"]);
    expect(rubyMethodToTs("island?")).toEqual(["isIsland", "island"]);
  });

  it("keeps the existing has/supports/can/etc allowlist behavior intact (camel preferred, isPrefixed available as fallback)", () => {
    // Only the `is_*?` family loses the isPrefixed fallback. Other
    // Ruby predicate prefixes keep both candidates because trails
    // sometimes needs the disambiguating alias — Reflection exposes
    // `isHasOne()` alongside the `Model.hasOne` association
    // declaration, for example.
    expect(rubyMethodToTs("has_attribute?")).toEqual(["hasAttribute", "isHasAttribute"]);
    expect(rubyMethodToTs("supports_savepoints?")).toEqual([
      "supportsSavepoints",
      "isSupportsSavepoints",
    ]);
    expect(rubyMethodToTs("can_load?")).toEqual(["canLoad", "isCanLoad"]);
    expect(rubyMethodToTs("should_retry?")).toEqual(["shouldRetry", "isShouldRetry"]);
  });
});

describe("rubyFileToTs", () => {
  it("snake-case → kebab-case .ts", () => {
    expect(rubyFileToTs("validations/numericality.rb")).toBe("validations/numericality.ts");
    expect(rubyFileToTs("connection_adapters/postgresql_adapter.rb")).toBe(
      "connection-adapters/postgresql-adapter.ts",
    );
  });
});
