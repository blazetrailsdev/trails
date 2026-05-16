import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import {
  Locator,
  BlockLocator,
  setModelFinder,
  _resetModelFinder,
  _resetLocators,
  type LocatorModel,
} from "./locator.js";

const TEST_APP = "bcx";
const UUID = "7ef9b614-353c-43a1-a203-ab2307851990";

function makeVerifier(secret = "test-secret"): MessageVerifier {
  return new MessageVerifier(secret, { digest: "sha256", url_safe: true });
}

// ─── Fixture models ────────────────────────────────────────────────────────

class Person {
  static primaryKey = "id";
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  static async find(id: unknown): Promise<Person | Person[]> {
    if (Array.isArray(id)) {
      if (id.some((p) => p === "missing")) throw new Error("not found");
      return id.map((i) => new this(String(i)));
    }
    if (id === "missing") throw new Error("not found");
    return new this(String(id));
  }
  static where(
    this: typeof Person,
    conds: Record<string, unknown>,
  ): { toArray(): Promise<Person[]> } {
    const ids = conds["id"] as unknown[];
    // Subclasses (PersonUuid, PersonChild) should instantiate themselves;
    // arrow function captures `this` lexically as the class constructor.
    const make = (id: unknown) => new this(String(id));
    return {
      async toArray() {
        return ids.filter((id) => id !== "missing").map(make);
      },
    };
  }
}
// Rails 'Person::Child' equivalent — class extending Person.
class PersonChild extends Person {}
class PersonUuid extends Person {}

class CompositePrimaryKeyModel {
  static primaryKey: string[] = ["tenant", "key"];
  id: string[];
  constructor(id: string[]) {
    this.id = id;
  }
  static async find(id: unknown): Promise<CompositePrimaryKeyModel | CompositePrimaryKeyModel[]> {
    const arr = id as unknown[];
    if (Array.isArray(arr[0])) {
      return arr.map((i) => new CompositePrimaryKeyModel((i as string[]).map(String)));
    }
    return new CompositePrimaryKeyModel((arr as string[]).map(String));
  }
}

const REGISTRY: Record<string, LocatorModel> = {
  Person: Person as unknown as LocatorModel,
  PersonChild: PersonChild as unknown as LocatorModel,
  PersonUuid: PersonUuid as unknown as LocatorModel,
  CompositePrimaryKeyModel: CompositePrimaryKeyModel as unknown as LocatorModel,
};

// ─── GlobalLocatorTest ─────────────────────────────────────────────────────

describe("GlobalLocatorTest", () => {
  let verifier: MessageVerifier;
  let personGid: GlobalID;
  let cpkGid: GlobalID;
  let uuidGid: GlobalID;
  let personSgid: SignedGlobalID;
  let cpkSgid: SignedGlobalID;

  beforeEach(() => {
    setApp(TEST_APP);
    setModelFinder((name) => REGISTRY[name]);
    verifier = makeVerifier();
    personGid = GlobalID.create(new Person("id"));
    cpkGid = GlobalID.create(new CompositePrimaryKeyModel(["tenant-key-value", "id-value"]));
    uuidGid = GlobalID.create(new PersonUuid(UUID));
    personSgid = SignedGlobalID.create(new Person("id"), { verifier });
    cpkSgid = SignedGlobalID.create(
      new CompositePrimaryKeyModel(["tenant-key-value", "id-value"]),
      {
        verifier,
      },
    );
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("by GID", async () => {
    const found = (await Locator.locate(personGid)) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe(personGid.modelId);
  });

  it("composite primary key model by GID", async () => {
    const found = (await Locator.locate(cpkGid)) as CompositePrimaryKeyModel;
    expect(found).toBeInstanceOf(CompositePrimaryKeyModel);
    expect(found.id).toEqual(["tenant-key-value", "id-value"]);
  });

  it("by GID with only: restriction with match", async () => {
    const found = await Locator.locate(personGid, { only: Person as unknown as LocatorModel });
    expect(found).toBeInstanceOf(Person);
  });

  it("by GID with only: restriction with match subclass", async () => {
    const childGid = GlobalID.create(new PersonChild("1"));
    const found = await Locator.locate(childGid, { only: Person as unknown as LocatorModel });
    expect(found).toBeInstanceOf(PersonChild);
  });

  it("by GID with only: restriction with no match", async () => {
    const found = await Locator.locate(personGid, {
      only: CompositePrimaryKeyModel as unknown as LocatorModel,
    });
    expect(found).toBeNull();
  });

  it("by GID with only: restriction by multiple types", async () => {
    const found = await Locator.locate(personGid, {
      only: [
        CompositePrimaryKeyModel as unknown as LocatorModel,
        Person as unknown as LocatorModel,
      ],
    });
    expect(found).toBeInstanceOf(Person);
  });

  it("by many GIDs of one class", async () => {
    const found = await Locator.locateMany([
      GlobalID.create(new Person("1")),
      GlobalID.create(new Person("2")),
    ]);
    expect(found).toHaveLength(2);
    expect((found[0] as Person).id).toBe("1");
    expect((found[1] as Person).id).toBe("2");
  });

  it("by many GIDs of a UUID pk class", async () => {
    const found = await Locator.locateMany([uuidGid, uuidGid]);
    expect(found).toHaveLength(2);
    expect((found[0] as PersonUuid).id).toBe(UUID);
  });

  it("by many GIDs of a UUID pk class with ignore missing", async () => {
    const gids = [uuidGid, GlobalID.create(new PersonUuid("missing")), uuidGid];
    const found = await Locator.locateMany(gids, { ignoreMissing: true });
    expect(found).toHaveLength(2);
  });

  it("#locate_many by composite primary key GIDs of the same class", async () => {
    const records = [
      new CompositePrimaryKeyModel(["tenant-key-value", "id-value"]),
      new CompositePrimaryKeyModel(["tenant-key-value2", "id-value2"]),
    ];
    const found = await Locator.locateMany(records.map((r) => GlobalID.create(r)));
    expect(found).toHaveLength(2);
    expect((found[0] as CompositePrimaryKeyModel).id).toEqual(["tenant-key-value", "id-value"]);
    expect((found[1] as CompositePrimaryKeyModel).id).toEqual(["tenant-key-value2", "id-value2"]);
  });

  it("#locate_many by composite primary key GIDs of different classes", async () => {
    const records = [
      GlobalID.create(new CompositePrimaryKeyModel(["tenant-key-value", "id-value"])),
      GlobalID.create(new Person("1")),
    ];
    const found = await Locator.locateMany(records);
    expect(found).toHaveLength(2);
    expect(found[0]).toBeInstanceOf(CompositePrimaryKeyModel);
    expect(found[1]).toBeInstanceOf(Person);
  });

  it("by many GIDs of mixed classes", async () => {
    const found = await Locator.locateMany([
      GlobalID.create(new Person("1")),
      GlobalID.create(new PersonChild("1")),
      GlobalID.create(new Person("2")),
    ]);
    expect(found).toHaveLength(3);
    expect((found[0] as Person).id).toBe("1");
    expect(found[1]).toBeInstanceOf(PersonChild);
    expect((found[2] as Person).id).toBe("2");
  });

  it("by many GIDs with only: restriction to match subclass", async () => {
    const found = await Locator.locateMany(
      [
        GlobalID.create(new Person("1")),
        GlobalID.create(new PersonChild("1")),
        GlobalID.create(new Person("2")),
      ],
      { only: PersonChild as unknown as LocatorModel },
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toBeInstanceOf(PersonChild);
  });

  it("by SGID", async () => {
    const found = (await Locator.locateSigned(personSgid, { verifier })) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("id");
  });

  it("by SGID of a composite primary key model", async () => {
    const found = (await Locator.locateSigned(cpkSgid, { verifier })) as CompositePrimaryKeyModel;
    expect(found).toBeInstanceOf(CompositePrimaryKeyModel);
    expect(found.id).toEqual(["tenant-key-value", "id-value"]);
  });

  it("by SGID with only: restriction with match", async () => {
    const found = await Locator.locateSigned(personSgid, {
      verifier,
      only: Person as unknown as LocatorModel,
    });
    expect(found).toBeInstanceOf(Person);
  });

  it("by SGID with only: restriction with match subclass", async () => {
    const sgid = SignedGlobalID.create(new PersonChild("1"), { verifier });
    const found = await Locator.locateSigned(sgid, {
      verifier,
      only: Person as unknown as LocatorModel,
    });
    expect(found).toBeInstanceOf(PersonChild);
  });

  it("by SGID with only: restriction with no match", async () => {
    const found = await Locator.locateSigned(personSgid, {
      verifier,
      only: CompositePrimaryKeyModel as unknown as LocatorModel,
    });
    expect(found).toBeNull();
  });

  it("by SGID with only: restriction by multiple types", async () => {
    const found = await Locator.locateSigned(personSgid, {
      verifier,
      only: [
        CompositePrimaryKeyModel as unknown as LocatorModel,
        Person as unknown as LocatorModel,
      ],
    });
    expect(found).toBeInstanceOf(Person);
  });

  it("by many SGIDs of one class", async () => {
    const sgids = [
      SignedGlobalID.create(new Person("1"), { verifier }),
      SignedGlobalID.create(new Person("2"), { verifier }),
    ];
    const found = await Locator.locateManySigned(sgids, { verifier });
    expect(found).toHaveLength(2);
    expect((found[0] as Person).id).toBe("1");
    expect((found[1] as Person).id).toBe("2");
  });

  it("by many SGIDs of the same composite primary key class", async () => {
    const sgids = [
      SignedGlobalID.create(new CompositePrimaryKeyModel(["tenant-key-value", "id-value"]), {
        verifier,
      }),
      SignedGlobalID.create(new CompositePrimaryKeyModel(["tenant-key-value2", "id-value2"]), {
        verifier,
      }),
    ];
    const found = await Locator.locateManySigned(sgids, { verifier });
    expect(found).toHaveLength(2);
  });

  it("by many SGIDs of mixed classes", async () => {
    const sgids = [
      SignedGlobalID.create(new Person("1"), { verifier }),
      SignedGlobalID.create(new PersonChild("1"), { verifier }),
      SignedGlobalID.create(new Person("2"), { verifier }),
    ];
    const found = await Locator.locateManySigned(sgids, { verifier });
    expect(found).toHaveLength(3);
  });

  it("by many SGIDs of composite primary key model mixed with other models", async () => {
    const sgids = [
      SignedGlobalID.create(new CompositePrimaryKeyModel(["tenant-key-value", "id-value"]), {
        verifier,
      }),
      SignedGlobalID.create(new Person("1"), { verifier }),
    ];
    const found = await Locator.locateManySigned(sgids, { verifier });
    expect(found).toHaveLength(2);
    expect(found[0]).toBeInstanceOf(CompositePrimaryKeyModel);
    expect(found[1]).toBeInstanceOf(Person);
  });

  it("by many SGIDs with only: restriction to match subclass", async () => {
    const sgids = [
      SignedGlobalID.create(new Person("1"), { verifier }),
      SignedGlobalID.create(new PersonChild("1"), { verifier }),
      SignedGlobalID.create(new Person("2"), { verifier }),
    ];
    const found = await Locator.locateManySigned(sgids, {
      verifier,
      only: PersonChild as unknown as LocatorModel,
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toBeInstanceOf(PersonChild);
  });

  it("by GID string", async () => {
    const found = (await Locator.locate(personGid.toString())) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("id");
  });

  it("by SGID string", async () => {
    const found = (await Locator.locateSigned(personSgid.toString(), { verifier })) as Person;
    expect(found).toBeInstanceOf(Person);
  });

  it("by many SGID strings with for: restriction to match purpose", async () => {
    const tokens = [
      SignedGlobalID.create(new Person("1"), { verifier, for: "adoption" }).toString(),
      SignedGlobalID.create(new PersonChild("1"), { verifier }).toString(),
      SignedGlobalID.create(new PersonChild("2"), { verifier, for: "adoption" }).toString(),
    ];
    const found = await Locator.locateManySigned(tokens, {
      verifier,
      for: "adoption",
      only: PersonChild as unknown as LocatorModel,
    });
    expect(found).toHaveLength(1);
    expect((found[0] as PersonChild).id).toBe("2");
  });

  it("by to_param encoding", async () => {
    const found = (await Locator.locate(personGid.toParam())) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("id");
  });

  it("by to_param encoding for a composite primary key model", async () => {
    const found = (await Locator.locate(cpkGid.toParam())) as CompositePrimaryKeyModel;
    expect(found).toBeInstanceOf(CompositePrimaryKeyModel);
    expect(found.id).toEqual(["tenant-key-value", "id-value"]);
  });

  it("by non-GID returns nil", async () => {
    expect(await Locator.locate("This is not a GID")).toBeNull();
  });

  it("by non-SGID returns nil", async () => {
    expect(await Locator.locateSigned("This is not a SGID", { verifier })).toBeNull();
  });

  it("by invalid GID URI returns nil", async () => {
    expect(await Locator.locate("http://app/Person/1")).toBeNull();
    expect(await Locator.locate("gid://Person/1")).toBeNull();
    expect(await Locator.locate("gid://app/Person")).toBeNull();
    // Scalar-PK model with composite-form id — exercises modelIdIsValid arity.
    expect(await Locator.locate("gid://app/Person/1/2")).toBeNull();
  });

  it("locating by a GID URI with a mismatching model_id returns nil", async () => {
    // 4 cases mirroring Rails: composite-id over-supply, under-supply, partial.
    expect(
      await Locator.locate(
        "gid://app/CompositePrimaryKeyModel/tenant-key-value/id-value/something_else",
      ),
    ).toBeNull();
    expect(await Locator.locate("gid://app/CompositePrimaryKeyModel/tenant-key-value/")).toBeNull();
    expect(await Locator.locate("gid://app/CompositePrimaryKeyModel/tenant-key-value")).toBeNull();
  });

  // ─── Locator.use(app, locator) — per-app dispatch ──────────────────────

  it("use locator with block", async () => {
    Locator.use("foo", (gid) => `block-located:${gid.modelName}:${gid.modelId}`);
    try {
      const found = await Locator.locate("gid://foo/Person/1");
      expect(found).toBe("block-located:Person:1");
    } finally {
      _resetLocators();
    }
  });

  it("use locator with class", async () => {
    class CustomLocator extends BlockLocator {
      constructor() {
        super((gid) => `class-located:${gid.modelId}`);
      }
    }
    Locator.use("bar", new CustomLocator());
    try {
      expect(await Locator.locate("gid://bar/Person/9")).toBe("class-located:9");
    } finally {
      _resetLocators();
    }
  });

  it("app locator is case insensitive", async () => {
    Locator.use("MyApp", (gid) => `case-test:${gid.modelId}`);
    try {
      expect(await Locator.locate("gid://myapp/Person/3")).toBe("case-test:3");
      expect(await Locator.locate("gid://MYAPP/Person/4")).toBe("case-test:4");
    } finally {
      _resetLocators();
    }
  });

  it("locator name cannot have underscore", () => {
    expect(() => Locator.use("invalid_app", () => null)).toThrow(/invalid app name/i);
  });
});

// ─── Non-Rails coverage (regressions / edge cases not in Rails suite) ──────

describe("Locator (non-Rails coverage)", () => {
  beforeEach(() => {
    setApp(TEST_APP);
    setModelFinder((name) => REGISTRY[name]);
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("returns null when model class isn't registered", async () => {
    expect(await Locator.locate("gid://bcx/UnknownModel/1")).toBeNull();
  });

  it("propagates errors from find (Rails parity — find raises RecordNotFound)", async () => {
    await expect(Locator.locate("gid://bcx/Person/missing")).rejects.toThrow();
  });

  it("locateMany with ignoreMissing throws if where() lacks toArray", async () => {
    class BadWhereModel {
      static primaryKey = "id";
      id: string;
      constructor(id: string) {
        this.id = id;
      }
      static async find(id: unknown): Promise<BadWhereModel | BadWhereModel[]> {
        return Array.isArray(id)
          ? id.map((i) => new BadWhereModel(String(i)))
          : new BadWhereModel(String(id));
      }
      static where(): { someOtherMethod?: () => void } {
        return {};
      }
    }
    Object.defineProperty(BadWhereModel, "name", { value: "BadWhereModel" });
    setModelFinder((name) =>
      name === "BadWhereModel" ? (BadWhereModel as unknown as LocatorModel) : undefined,
    );
    await expect(
      Locator.locateMany(["gid://bcx/BadWhereModel/1"], { ignoreMissing: true }),
    ).rejects.toThrow(/toArray/);
  });
});

describe("Locator without model finder", () => {
  beforeEach(() => {
    setApp(TEST_APP);
    _resetModelFinder();
  });
  afterEach(() => _resetApp());

  it("returns null when no finder is registered", async () => {
    expect(await Locator.locate("gid://bcx/Person/1")).toBeNull();
  });
});

describe("Locator non-Rails coverage — per-app dispatch helpers", () => {
  beforeEach(() => {
    setApp(TEST_APP);
    setModelFinder((name) => REGISTRY[name]);
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
    _resetLocators();
  });

  it("falls back to the default locator when no app-specific locator is registered", async () => {
    Locator.use("other-app", () => "should-not-be-called");
    const found = (await Locator.locate("gid://bcx/Person/5")) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("5");
  });

  it("defaultLocator getter/setter (Rails: Locator.default_locator=)", () => {
    const original = Locator.defaultLocator;
    const custom = new BlockLocator(() => "custom-default");
    // LocatorLike-widened defaultLocator accepts a BlockLocator directly —
    // no cast needed.
    Locator.defaultLocator = custom;
    expect(Locator.defaultLocator).toBe(custom);
    Locator.defaultLocator = original;
  });

  it("locatorFor returns the registered locator for the app", () => {
    const custom = new BlockLocator(() => null);
    Locator.use("zed", custom);
    const gid = GlobalID.parse("gid://zed/Person/1");
    expect(Locator.locatorFor(gid!)).toBe(custom);
  });

  it("parseAllowed filters by class allowlist", () => {
    const gids = ["gid://bcx/Person/1", "gid://bcx/PersonChild/2", "gid://bcx/Unknown/3"];
    const allowed = Locator.parseAllowed(gids, PersonChild as unknown as LocatorModel);
    expect(allowed).toHaveLength(1);
    expect(allowed[0].modelName).toBe("PersonChild");
  });

  it("normalizeApp lowercases the app name", () => {
    expect(Locator.normalizeApp("MyApp")).toBe("myapp");
    expect(Locator.normalizeApp("FOO")).toBe("foo");
  });

  it("locateMany returns [] when parseAllowed filters out every input", async () => {
    // All GIDs are invalid / unknown class / filtered by only: → empty allowed
    // set → return [] without dispatching to any locator (no first-locator
    // crash, no extraneous work).
    const found = await Locator.locateMany(["not-a-gid", "gid://bcx/Unknown/1"], {});
    expect(found).toEqual([]);
  });

  it("locate returns null for arity-mismatched GIDs even with a BlockLocator registered", async () => {
    // Without the facade-level arity check, the registered BlockLocator
    // would run on bad-arity GIDs (inconsistent with BaseLocator's
    // modelIdIsValid filter, which returns null for them).
    Locator.use("ba", () => {
      throw new Error("should not be called — bad-arity GID must be filtered at the facade");
    });
    // Person has scalar primaryKey; composite-form id is bad arity.
    expect(await Locator.locate("gid://ba/Person/1/2")).toBeNull();
  });

  it("locateMany drops arity-mismatched GIDs before the first-app dispatch selection", async () => {
    // Bad-arity GID anchored at allowed[0] with a different app would
    // otherwise cause locateMany to filter to its app and lose the valid
    // same-app GIDs that follow. parseAllowed's arity filter removes the
    // bad entry first, so allowed[0] is a real candidate.
    Locator.use("doomed-app", () => {
      throw new Error("should not be called — bad-arity GID must be filtered first");
    });
    const found = await Locator.locateMany(
      [
        "gid://doomed-app/Person/1/2", // scalar-PK Person with composite-form id → bad arity
        "gid://bcx/Person/3",
        "gid://bcx/Person/4",
      ],
      {},
    );
    expect(found).toHaveLength(2);
    expect((found[0] as Person).id).toBe("3");
    expect((found[1] as Person).id).toBe("4");
  });

  it("locateMany filters out mismatched-app GIDs (single-app dispatch invariant)", async () => {
    // Register an 'other-app' BlockLocator that would crash if asked to
    // resolve a 'bcx' GID. locateMany should keep only the first-GID-app
    // entries; the foreign GID is silently dropped.
    Locator.use("other-app", () => {
      throw new Error("should not be called — foreign-app GID must be filtered");
    });
    const found = await Locator.locateMany(
      [
        "gid://bcx/Person/1",
        "gid://other-app/Person/99", // would route to the throwing locator
        "gid://bcx/Person/2",
      ],
      {},
    );
    expect(found).toHaveLength(2);
    expect((found[0] as Person).id).toBe("1");
    expect((found[1] as Person).id).toBe("2");
  });
});
