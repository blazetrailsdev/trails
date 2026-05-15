import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { SignedGlobalID } from "./signed-global-id.js";
import { Locator, setModelFinder, _resetModelFinder, type LocatorModel } from "./locator.js";

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
