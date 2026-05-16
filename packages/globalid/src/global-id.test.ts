import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { setModelFinder, _resetModelFinder, type LocatorModel } from "./locator.js";

const fakeModel = (id: unknown, name = "Person") => ({
  id,
  constructor: { name },
});

// ─── Fixture models for find / model_class tests ───────────────────────────

class Person {
  static primaryKey = "id";
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  static async find(id: unknown): Promise<Person> {
    return new this(String(id));
  }
}
class PersonUuid extends Person {}
class PersonChild extends Person {}
class PersonModel extends Person {}
class CompositePrimaryKeyModel {
  static primaryKey: string[] = ["tenant", "key"];
  id: string[];
  constructor(id: string[]) {
    this.id = id;
  }
  static async find(id: unknown): Promise<CompositePrimaryKeyModel> {
    return new CompositePrimaryKeyModel((id as unknown[]).map(String));
  }
}

const FIXTURE_REGISTRY: Record<string, LocatorModel> = {
  Person: Person as unknown as LocatorModel,
  PersonUuid: PersonUuid as unknown as LocatorModel,
  // Rails 'Person::Child' — TS class can't have :: in its name, so the
  // registered name uses the namespaced spelling that GlobalID.modelName
  // round-trips, mapped to a flat PersonChild class.
  "Person::Child": PersonChild as unknown as LocatorModel,
  PersonModel: PersonModel as unknown as LocatorModel,
  CompositePrimaryKeyModel: CompositePrimaryKeyModel as unknown as LocatorModel,
};

describe("GlobalIDTest", () => {
  it("value equality", () => {
    const a = GlobalID.parse("gid://app/Person/5")!;
    const b = GlobalID.parse("gid://app/Person/5")!;
    expect(a.equals(b)).toBe(true);
  });

  it("invalid app name", () => {
    expect(() => GlobalID.validateApp("")).toThrow();
    expect(() => GlobalID.validateApp("blog_app")).toThrow();
    expect(() => GlobalID.validateApp(null)).toThrow();
  });
});

describe("GlobalIDParamEncodedTest", () => {
  beforeEach(() => {
    setApp("bcx");
    setModelFinder((name) => FIXTURE_REGISTRY[name]);
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("parsing", () => {
    const gid = GlobalID.create(fakeModel("id"));
    const parsed = GlobalID.parse(gid.toParam());
    expect(parsed).not.toBeNull();
    expect(parsed!.equals(gid)).toBe(true);
  });

  it("finding", async () => {
    // Rails: GlobalID.find(@gid.to_param) — class-level convenience that
    // parses and locates in one step. Trails has Locator.locate(gid) for
    // the same flow.
    const gid = GlobalID.create(
      new Person("id") as unknown as { id: unknown; constructor: { name: string } },
    );
    const parsed = GlobalID.parse(gid.toParam())!;
    const found = (await parsed.find()) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe(parsed.modelId);
  });
});

describe("GlobalIDCreationTest", () => {
  const uuid = "7ef9b614-353c-43a1-a203-ab2307851990";

  beforeEach(() => {
    setApp("bcx");
    setModelFinder((name) => FIXTURE_REGISTRY[name]);
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("as string", () => {
    expect(GlobalID.create(fakeModel(5)).toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(fakeModel(uuid, "PersonUuid")).toString()).toBe(
      `gid://bcx/PersonUuid/${uuid}`,
    );
    expect(GlobalID.create(fakeModel(4, "Person::Child")).toString()).toBe(
      "gid://bcx/Person::Child/4",
    );
    expect(GlobalID.create(fakeModel(1, "PersonModel")).toString()).toBe("gid://bcx/PersonModel/1");
    expect(
      GlobalID.create(
        fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"),
      ).toString(),
    ).toBe("gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value");
  });

  it("as param", () => {
    const gid = GlobalID.create(fakeModel(5));
    expect(gid.toParam()).toBe("Z2lkOi8vYmN4L1BlcnNvbi81");
    expect(GlobalID.parse("Z2lkOi8vYmN4L1BlcnNvbi81")!.equals(gid)).toBe(true);

    const uuidGid = GlobalID.create(fakeModel(uuid, "PersonUuid"));
    expect(GlobalID.parse(uuidGid.toParam())!.equals(uuidGid)).toBe(true);

    const cpkGid = GlobalID.create(
      fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"),
    );
    expect(GlobalID.parse(cpkGid.toParam())!.equals(cpkGid)).toBe(true);
  });

  it("as URI", () => {
    expect(GlobalID.create(fakeModel(5)).uri).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(fakeModel(4, "Person::Child")).uri).toBe("gid://bcx/Person::Child/4");
  });

  it("as JSON", () => {
    const gid = GlobalID.create(fakeModel(5));
    // Mirror Rails GlobalID#as_json — JSON.stringify(gid) calls toJSON() and
    // serializes to the URI string, wrapped in quotes.
    expect(JSON.stringify(gid)).toBe('"gid://bcx/Person/5"');
    expect(JSON.stringify(GlobalID.create(fakeModel(4, "Person::Child")))).toBe(
      '"gid://bcx/Person::Child/4"',
    );
  });

  it("model id", () => {
    expect(GlobalID.create(fakeModel(5)).modelId).toBe("5");
    expect(GlobalID.create(fakeModel(uuid, "PersonUuid")).modelId).toBe(uuid);
    expect(GlobalID.create(fakeModel(4, "Person::Child")).modelId).toBe("4");
    expect(
      GlobalID.create(fakeModel(["tenant-key-value", "id-value"], "CompositePrimaryKeyModel"))
        .modelId,
    ).toEqual(["tenant-key-value", "id-value"]);
  });

  it("model name", () => {
    expect(GlobalID.create(fakeModel(5)).modelName).toBe("Person");
    expect(GlobalID.create(fakeModel(uuid, "PersonUuid")).modelName).toBe("PersonUuid");
    expect(GlobalID.create(fakeModel(4, "Person::Child")).modelName).toBe("Person::Child");
    expect(GlobalID.create(fakeModel(["t", "i"], "CompositePrimaryKeyModel")).modelName).toBe(
      "CompositePrimaryKeyModel",
    );
  });

  it(":app option", () => {
    expect(GlobalID.create(fakeModel(5)).toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(fakeModel(5), { app: "foo" }).toString()).toBe("gid://foo/Person/5");
    _resetApp();
    expect(() => GlobalID.create(fakeModel(5), { app: null as unknown as string })).toThrow();
  });

  it("equality", () => {
    const gid1 = GlobalID.create(fakeModel(5));
    const gid2 = GlobalID.create(fakeModel(5));
    const gid3 = GlobalID.create(fakeModel(10));
    expect(gid1.equals(gid2)).toBe(true);
    expect(gid1.equals(gid3)).toBe(false);
  });

  it("model class", () => {
    expect(
      GlobalID.create(new Person("5") as unknown as { id: unknown; constructor: { name: string } })
        .modelClass,
    ).toBe(Person);
    expect(
      GlobalID.create(
        new PersonUuid(uuid) as unknown as { id: unknown; constructor: { name: string } },
      ).modelClass,
    ).toBe(PersonUuid);
    expect(GlobalID.create(fakeModel(1, "PersonModel")).modelClass).toBe(PersonModel);
    expect(GlobalID.create(fakeModel(["t", "i"], "CompositePrimaryKeyModel")).modelClass).toBe(
      CompositePrimaryKeyModel,
    );
  });

  it("find", async () => {
    const personGid = GlobalID.create(
      new Person("5") as unknown as { id: unknown; constructor: { name: string } },
    );
    const found = (await personGid.find()) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("5");
  });

  it("find with class", async () => {
    const personGid = GlobalID.create(
      new Person("5") as unknown as { id: unknown; constructor: { name: string } },
    );
    const found = (await personGid.find({ only: Person as unknown as LocatorModel })) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe("5");
  });

  it("find with class no match", async () => {
    const personGid = GlobalID.create(
      new Person("5") as unknown as { id: unknown; constructor: { name: string } },
    );
    class Unrelated {}
    expect(await personGid.find({ only: Unrelated as unknown as LocatorModel })).toBeNull();
  });

  it("find with subclass", async () => {
    // Rails: a PersonChild GID with only: Person succeeds because
    // PersonChild < Person. findAllowed uses `instanceof prototype`.
    // Use the namespaced 'Person::Child' GID directly — that's how
    // GlobalID.create(new PersonChild(...)) renders the modelName when
    // the class is registered under the Rails namespaced spelling.
    const namespacedGid = GlobalID.parse(`gid://bcx/Person::Child/4`)!;
    const found = (await namespacedGid.find({
      only: Person as unknown as LocatorModel,
    })) as PersonChild;
    expect(found).toBeInstanceOf(PersonChild);
  });

  it("find with subclass no match", async () => {
    const namespacedGid = GlobalID.parse(`gid://bcx/Person::Child/4`)!;
    class Unrelated {}
    expect(await namespacedGid.find({ only: Unrelated as unknown as LocatorModel })).toBeNull();
  });

  it("find with multiple class", async () => {
    const personGid = GlobalID.create(
      new Person("5") as unknown as { id: unknown; constructor: { name: string } },
    );
    class Other {}
    const found = (await personGid.find({
      only: [Other as unknown as LocatorModel, Person as unknown as LocatorModel],
    })) as Person;
    expect(found).toBeInstanceOf(Person);
  });

  it("find with multiple class no match", async () => {
    const personGid = GlobalID.create(
      new Person("5") as unknown as { id: unknown; constructor: { name: string } },
    );
    class A {}
    class B {}
    expect(
      await personGid.find({
        only: [A as unknown as LocatorModel, B as unknown as LocatorModel],
      }),
    ).toBeNull();
  });
});

describe("GlobalIDCustomParamsTest", () => {
  beforeEach(() => setApp("bcx"));
  afterEach(() => _resetApp());

  it("create custom params", () => {
    const gid = GlobalID.create(fakeModel(5), { hello: "world" });
    expect(gid.params["hello"]).toBe("world");
  });

  it("parse custom params", () => {
    const gid = GlobalID.parse("gid://bcx/Person/5?hello=world");
    expect(gid!.params["hello"]).toBe("world");
  });
});
