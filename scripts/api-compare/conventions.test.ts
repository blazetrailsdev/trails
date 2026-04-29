import { describe, it, expect } from "vitest";
import { snakeToCamel, rubyMethodToTs } from "./conventions.js";

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

  it("turns predicate methods into TS is*-prefixed candidates", () => {
    expect(rubyMethodToTs("valid?")).toEqual(["isValid", "valid"]);
    expect(rubyMethodToTs("has_attribute?")).toEqual(["hasAttribute", "isHasAttribute"]);
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
