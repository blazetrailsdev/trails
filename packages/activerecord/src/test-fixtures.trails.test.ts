import { describe, it, expect, beforeEach } from "vitest";
import { include } from "@blazetrails/ruby-compat";
import { TestFixtures } from "./test-fixtures.js";
import { File as FixtureFile } from "./fixture-set/file.js";

type Host = {
  name: string;
  fixturePaths: string[];
  fixtureTableNames: string[];
  fixtureClassNames: Record<string, unknown>;
  fixtureSets: Record<string, string>;
  setFixtureClass(classNames?: Record<string, unknown>): void;
  fixtures(...names: unknown[]): void;
  setupFixtureAccessors(names?: string | string[] | null): void;
  usesTransaction(...methods: unknown[]): void;
  isUsesTransaction(method: unknown): boolean;
};

describe("TestFixtures::ClassMethods", () => {
  let klass: Host;

  beforeEach(() => {
    const k = class {};
    include(k, TestFixtures);
    klass = k as unknown as Host;
  });

  it("set_fixture_class merges stringified class names", () => {
    const model = class {};
    klass.setFixtureClass({ some_fixture: model });
    klass.setFixtureClass({ "namespaced/fixture": String });
    expect(klass.fixtureClassNames).toEqual({
      some_fixture: model,
      "namespaced/fixture": String,
    });
  });

  it("fixtures :all globs every .yml under the fixture paths", () => {
    klass.fixturePaths = [new URL("./fixture-set/test-data", import.meta.url).pathname];
    klass.fixtures(":all");
    expect(klass.fixtureTableNames).toEqual([
      "accounts",
      "developers",
      "naked/yml/accounts",
      "naked/yml/companies",
      "other_posts",
      "parrots",
    ]);
  });

  it("fixtures :all enumerates registered TS fixture modules under the fixture paths", () => {
    FixtureFile.registerModule("all-ts-root/topics.ts", {});
    FixtureFile.registerModule("all-ts-root/admin/users.ts", {});
    klass.fixturePaths = ["all-ts-root"];
    klass.fixtures(":all");
    expect(klass.fixtureTableNames).toEqual(["admin/users", "topics"]);
  });

  it("fixtures unions and sorts table names and sets up accessors", () => {
    klass.fixtures("topics", ["accounts", ["admin/users"]]);
    klass.fixtures("topics");
    expect(klass.fixtureTableNames).toEqual(["accounts", "admin/users", "topics"]);
    expect(klass.fixtureSets).toEqual({
      topics: "topics",
      accounts: "accounts",
      admin_users: "admin/users",
    });
  });

  it("fixtures :all raises without fixture_paths", () => {
    expect(() => klass.fixtures(":all")).toThrow(/No fixture path found/);
  });

  it("setup_fixture_accessors dups fixture_sets so subclasses do not leak", () => {
    const sub = class extends (klass as unknown as new () => object) {} as unknown as Host;
    sub.fixtures("topics");
    expect(klass.fixtureSets).toEqual({});
    expect(sub.fixtureSets).toEqual({ topics: "topics" });
  });

  it("uses_transaction records method names", () => {
    klass.usesTransaction("test_a", "test_b");
    expect(klass.isUsesTransaction("test_a")).toBe(true);
    expect(klass.isUsesTransaction("test_c")).toBe(false);
  });
});
