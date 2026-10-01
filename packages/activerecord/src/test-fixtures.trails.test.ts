import { describe, it, expect, beforeEach } from "vitest";
import { NoMethodError, include } from "@blazetrails/ruby-compat";
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

describe("TestFixtures#method_missing", () => {
  type Instance = {
    _loadedFixtures: Record<string, { fixtures: Record<string, unknown> }>;
    _fixtureCache: Record<string, Record<string, unknown>>;
    topics(...names: unknown[]): unknown;
    developers?: unknown;
  };
  let instance: Instance;

  beforeEach(() => {
    const k = class {};
    include(k, TestFixtures);
    (k as unknown as Host).fixtures("topics");
    instance = new k() as unknown as Instance;
    instance._loadedFixtures = { topics: { fixtures: { first: { find: async () => "first" } } } };
    instance._fixtureCache = {};
  });

  it("dispatches a fixture set name to active_record_fixture", async () => {
    await expect(instance.topics("first")).resolves.toBe("first");
    expect((instance as unknown as Record<string, unknown>).topics).toBeTypeOf("function");
  });

  it("raises for a fixture the set does not have", () => {
    expect(() => instance.topics("missing")).toThrow(
      "No fixture named 'missing' found for fixture set 'topics'",
    );
  });

  it("leaves a name that is not a fixture set unanswered", () => {
    expect(instance.developers).toBeUndefined();
    const probes = instance as unknown as Record<string, unknown>;
    expect(probes.then).toBeUndefined();
    expect(probes.toJSON).toBeUndefined();
    expect(JSON.stringify(instance)).toContain("_fixtureCache");
  });

  it("answers a missed read on the prototype itself, where fixture_sets is the class's", () => {
    const proto = Object.getPrototypeOf(instance) as Record<string, unknown>;
    expect(proto.developers).toBeUndefined();
    expect(proto.topics).toBeTypeOf("function");
  });

  it("raises NoMethodError carrying the receiver, name and args, as the super arm does", () => {
    const methodMissing = (instance as unknown as { methodMissing(...a: unknown[]): unknown })
      .methodMissing;
    let error: NoMethodError | undefined;
    try {
      methodMissing.call(instance, "developers", "david");
    } catch (e) {
      error = e as NoMethodError;
    }
    expect(error).toBeInstanceOf(NoMethodError);
    expect(error!.message).toMatch(/^undefined method 'developers' for an instance of /);
    expect(error!.constantName).toBe("developers");
    expect(error!.args()).toEqual(["david"]);
    expect(error!.receiver()).toBe(instance);
  });

  it("keeps answering when the module is included a second time", async () => {
    const k = Object.getPrototypeOf(instance).constructor as new () => object;
    include(k, TestFixtures);
    (k as unknown as Host).fixtures("topics");
    await expect(instance.topics("first")).resolves.toBe("first");
    expect(instance.developers).toBeUndefined();
  });
});

describe("TestFixtures#before_setup / #after_teardown", () => {
  type Lifecycle = { beforeSetup(): Promise<void>; afterTeardown(): Promise<void> };
  let calls: string[];
  let testCase: Lifecycle;

  function build(superclass: new () => object): new () => Lifecycle {
    const k = class extends superclass {
      async setupFixtures() {
        calls.push("setup_fixtures");
      }
      async teardownFixtures() {
        calls.push("teardown_fixtures");
      }
    };
    include(k, TestFixtures);
    return k as unknown as new () => Lifecycle;
  }

  beforeEach(() => {
    calls = [];
    testCase = new (build(
      class {
        beforeSetup() {
          calls.push("super before_setup");
        }
        afterTeardown() {
          calls.push("super after_teardown");
        }
      },
    ))();
  });

  it("splices the module beneath the includer's prototype", () => {
    const proto = Object.getPrototypeOf(testCase) as object;
    expect(Object.prototype.hasOwnProperty.call(proto, "beforeSetup")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(proto), "beforeSetup")).toBe(
      true,
    );
  });

  it("before_setup sets up fixtures, then calls super", async () => {
    await testCase.beforeSetup();
    expect(calls).toEqual(["setup_fixtures", "super before_setup"]);
  });

  it("after_teardown calls super, then tears down fixtures", async () => {
    await testCase.afterTeardown();
    expect(calls).toEqual(["super after_teardown", "teardown_fixtures"]);
  });

  it("after_teardown tears down fixtures when super raises", async () => {
    testCase = new (build(
      class {
        afterTeardown() {
          throw new Error("super raised");
        }
      },
    ))();
    await expect(testCase.afterTeardown()).rejects.toThrow("super raised");
    expect(calls).toEqual(["teardown_fixtures"]);
  });

  it("an includer's own before_setup outranks the module's and reaches it through super", async () => {
    const k = class {
      async beforeSetup(): Promise<void> {
        calls.push("own before_setup");
        await (Object.getPrototypeOf(k.prototype) as Lifecycle).beforeSetup.call(this);
      }
      async setupFixtures() {
        calls.push("setup_fixtures");
      }
    };
    include(k, TestFixtures);
    await new k().beforeSetup();
    expect(calls).toEqual(["own before_setup", "setup_fixtures"]);
  });
});
