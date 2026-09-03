import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setApp, _resetApp } from "./config.js";
import { registerConstant, _resetConstants } from "@blazetrails/activesupport";
import { GlobalID } from "./global-id.js";
import { GID } from "./uri/gid.js";
import { type LocatorModel } from "./locator.js";

const fakeModel = (id: unknown, name = "Person") => ({ id, constructor: { name } });

class Person {
  static HARDCODED_ID_FOR_MISSING_PERSON = "1000";
  static primaryKey: string | string[] = "id";
  id: unknown;
  constructor(id: unknown = 1) {
    this.id = id;
  }
  static find(idOrIds: unknown): unknown {
    if (Array.isArray(idOrIds)) return idOrIds.map((id) => this.find(id));
    if (idOrIds === Person.HARDCODED_ID_FOR_MISSING_PERSON) throw new Error("Person missing");
    return new this(idOrIds);
  }
}
class PersonUuid extends Person {
  static primaryKey = "uuid";
}
class PersonChild extends Person {}
Object.defineProperty(PersonChild, "name", { value: "Person::Child" });

class PersonModel {
  static primaryKey = "id";
  id: unknown;
  constructor(attrs: { id: unknown }) {
    this.id = attrs.id;
  }
  static find(id: unknown): PersonModel {
    return new PersonModel({ id });
  }
}

class CompositePrimaryKeyModel {
  static primaryKey: string[] = ["tenant_key", "id"];
  id: unknown;
  constructor(attrs: { id: unknown }) {
    this.id = attrs.id;
  }
  static find(idOrIds: unknown[]): unknown {
    if (!Array.isArray(idOrIds)) throw new Error("id is not composite");
    const multiRecordFetch = Array.isArray(idOrIds[0]);
    if (multiRecordFetch) {
      return idOrIds.map((id) => {
        if ((id as unknown[]).length !== CompositePrimaryKeyModel.primaryKey.length) {
          throw new Error("id doesn't match primary key");
        }
        return new CompositePrimaryKeyModel({ id });
      });
    }
    if (idOrIds.length !== CompositePrimaryKeyModel.primaryKey.length) {
      throw new Error("id doesn't match primary key");
    }
    return new CompositePrimaryKeyModel({ id: idOrIds });
  }
}

function registerConstants(registry: Record<string, LocatorModel>): void {
  for (const [name, klass] of Object.entries(registry)) {
    registerConstant(name, klass);
  }
}

const FIXTURE_REGISTRY: Record<string, LocatorModel> = {
  Person: Person as unknown as LocatorModel,
  PersonUuid: PersonUuid as unknown as LocatorModel,
  "Person::Child": PersonChild as unknown as LocatorModel,
  PersonModel: PersonModel as unknown as LocatorModel,
  CompositePrimaryKeyModel: CompositePrimaryKeyModel as unknown as LocatorModel,
};

function uniq<T>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${(item as object).constructor.name}:${String(item)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

describe("GlobalIDTest", () => {
  it("value equality", () => {
    expect(new GlobalID("gid://app/Person/5")).toEqual(new GlobalID("gid://app/Person/5"));
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
    registerConstants(FIXTURE_REGISTRY);
  });
  afterEach(() => {
    _resetApp();
    _resetConstants();
  });

  it("parsing", () => {
    const gid = GlobalID.create(fakeModel("id"));
    expect(GlobalID.parse(gid.toParam())).toEqual(gid);
  });

  it("finding", async () => {
    const gid = GlobalID.create(new Person("id"));
    const parsed = GlobalID.parse(gid.toParam())!;
    const found = (await parsed.find()) as Person;
    expect(found).toBeInstanceOf(Person);
    expect(found.id).toBe(parsed.modelId);
  });
});

describe("GlobalIDCreationTest", () => {
  const uuid = "7ef9b614-353c-43a1-a203-ab2307851990";
  let personGid: GlobalID;
  let personUuidGid: GlobalID;
  let personNamespacedGid: GlobalID;
  let personModelGid: GlobalID;
  let cpkModelGid: GlobalID;

  beforeEach(() => {
    setApp("bcx");
    registerConstants(FIXTURE_REGISTRY);
    personGid = GlobalID.create(new Person(5));
    personUuidGid = GlobalID.create(new PersonUuid(uuid));
    personNamespacedGid = GlobalID.create(new PersonChild(4));
    personModelGid = GlobalID.create(new PersonModel({ id: 1 }));
    cpkModelGid = GlobalID.create(
      new CompositePrimaryKeyModel({ id: ["tenant-key-value", "id-value"] }),
    );
  });
  afterEach(() => {
    _resetApp();
    _resetConstants();
  });

  it("find", async () => {
    expect(Person.find(personGid.modelId)).toEqual(await personGid.find());
    expect(Person.find(personUuidGid.modelId)).toEqual(await personUuidGid.find());
    expect(PersonChild.find(personNamespacedGid.modelId)).toEqual(await personNamespacedGid.find());
    expect(PersonModel.find(personModelGid.modelId)).toEqual(await personModelGid.find());
    expect(CompositePrimaryKeyModel.find(cpkModelGid.modelId as unknown[])).toEqual(
      await cpkModelGid.find(),
    );
  });

  it("find with class", async () => {
    expect(Person.find(personGid.modelId)).toEqual(
      await personGid.find({ only: Person as unknown as LocatorModel }),
    );
    expect(Person.find(personUuidGid.modelId)).toEqual(
      await personUuidGid.find({ only: Person as unknown as LocatorModel }),
    );
    expect(PersonModel.find(personModelGid.modelId)).toEqual(
      await personModelGid.find({ only: PersonModel as unknown as LocatorModel }),
    );
    expect(CompositePrimaryKeyModel.find(cpkModelGid.modelId as unknown[])).toEqual(
      await cpkModelGid.find({ only: CompositePrimaryKeyModel as unknown as LocatorModel }),
    );
  });

  it("find with class no match", async () => {
    expect(await personGid.find({ only: Map as unknown as LocatorModel })).toBeNull();
    expect(await personUuidGid.find({ only: Array as unknown as LocatorModel })).toBeNull();
    expect(await personNamespacedGid.find({ only: String as unknown as LocatorModel })).toBeNull();
    expect(await personModelGid.find({ only: Number as unknown as LocatorModel })).toBeNull();
    expect(await cpkModelGid.find({ only: Map as unknown as LocatorModel })).toBeNull();
  });

  it("find with subclass", async () => {
    expect(PersonChild.find(personNamespacedGid.modelId)).toEqual(
      await personNamespacedGid.find({ only: Person as unknown as LocatorModel }),
    );
  });

  it("find with subclass no match", async () => {
    expect(await personNamespacedGid.find({ only: String as unknown as LocatorModel })).toBeNull();
  });

  it("find with multiple class", async () => {
    expect(Person.find(personGid.modelId)).toEqual(
      await personGid.find({
        only: [Number as unknown as LocatorModel, Person as unknown as LocatorModel],
      }),
    );
    expect(Person.find(personUuidGid.modelId)).toEqual(
      await personUuidGid.find({
        only: [Number as unknown as LocatorModel, Person as unknown as LocatorModel],
      }),
    );
    expect(PersonModel.find(personModelGid.modelId)).toEqual(
      await personModelGid.find({
        only: [Number as unknown as LocatorModel, PersonModel as unknown as LocatorModel],
      }),
    );
    expect(PersonChild.find(personNamespacedGid.modelId)).toEqual(
      await personNamespacedGid.find({
        only: [Person as unknown as LocatorModel, PersonChild as unknown as LocatorModel],
      }),
    );
  });

  it("find with multiple class no match", async () => {
    expect(
      await personGid.find({
        only: [Number as unknown as LocatorModel, Number as unknown as LocatorModel],
      }),
    ).toBeNull();
    expect(
      await personUuidGid.find({
        only: [Number as unknown as LocatorModel, String as unknown as LocatorModel],
      }),
    ).toBeNull();
    expect(
      await personModelGid.find({
        only: [Array as unknown as LocatorModel, Map as unknown as LocatorModel],
      }),
    ).toBeNull();
    expect(
      await personNamespacedGid.find({
        only: [String as unknown as LocatorModel, Set as unknown as LocatorModel],
      }),
    ).toBeNull();
  });

  it("as string", () => {
    expect(personGid.toString()).toBe("gid://bcx/Person/5");
    expect(personUuidGid.toString()).toBe(`gid://bcx/PersonUuid/${uuid}`);
    expect(personNamespacedGid.toString()).toBe("gid://bcx/Person::Child/4");
    expect(personModelGid.toString()).toBe("gid://bcx/PersonModel/1");
    expect(cpkModelGid.toString()).toBe(
      "gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value",
    );
  });

  it("as param", () => {
    expect(personGid.toParam()).toBe("Z2lkOi8vYmN4L1BlcnNvbi81");
    expect(GlobalID.parse("Z2lkOi8vYmN4L1BlcnNvbi81")).toEqual(personGid);

    expect(personUuidGid.toParam()).toBe(
      "Z2lkOi8vYmN4L1BlcnNvblV1aWQvN2VmOWI2MTQtMzUzYy00M2ExLWEyMDMtYWIyMzA3ODUxOTkw",
    );
    expect(
      GlobalID.parse(
        "Z2lkOi8vYmN4L1BlcnNvblV1aWQvN2VmOWI2MTQtMzUzYy00M2ExLWEyMDMtYWIyMzA3ODUxOTkw",
      ),
    ).toEqual(personUuidGid);

    expect(personNamespacedGid.toParam()).toBe("Z2lkOi8vYmN4L1BlcnNvbjo6Q2hpbGQvNA");
    expect(GlobalID.parse("Z2lkOi8vYmN4L1BlcnNvbjo6Q2hpbGQvNA")).toEqual(personNamespacedGid);

    expect(personModelGid.toParam()).toBe("Z2lkOi8vYmN4L1BlcnNvbk1vZGVsLzE");
    expect(GlobalID.parse("Z2lkOi8vYmN4L1BlcnNvbk1vZGVsLzE")).toEqual(personModelGid);

    const expectedEncoded =
      "Z2lkOi8vYmN4L0NvbXBvc2l0ZVByaW1hcnlLZXlNb2RlbC90ZW5hbnQta2V5LXZhbHVlL2lkLXZhbHVl";
    expect(cpkModelGid.toParam()).toBe(expectedEncoded);
    expect(GlobalID.parse(expectedEncoded)).toEqual(cpkModelGid);
  });

  it("as URI", () => {
    expect(personGid.uri).toEqual(GID.parse("gid://bcx/Person/5"));
    expect(personUuidGid.uri).toEqual(GID.parse(`gid://bcx/PersonUuid/${uuid}`));
    expect(personNamespacedGid.uri).toEqual(GID.parse("gid://bcx/Person::Child/4"));
    expect(personModelGid.uri).toEqual(GID.parse("gid://bcx/PersonModel/1"));
    expect(cpkModelGid.uri).toEqual(
      GID.parse("gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value"),
    );
  });

  it("as JSON", () => {
    expect(personGid.asJson()).toBe("gid://bcx/Person/5");
    expect(JSON.stringify(personGid)).toBe('"gid://bcx/Person/5"');

    expect(personUuidGid.asJson()).toBe(`gid://bcx/PersonUuid/${uuid}`);
    expect(JSON.stringify(personUuidGid)).toBe(`"gid://bcx/PersonUuid/${uuid}"`);

    expect(personNamespacedGid.asJson()).toBe("gid://bcx/Person::Child/4");
    expect(JSON.stringify(personNamespacedGid)).toBe('"gid://bcx/Person::Child/4"');

    expect(personModelGid.asJson()).toBe("gid://bcx/PersonModel/1");
    expect(JSON.stringify(personModelGid)).toBe('"gid://bcx/PersonModel/1"');

    expect(cpkModelGid.asJson()).toBe(
      "gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value",
    );
    expect(JSON.stringify(cpkModelGid)).toBe(
      '"gid://bcx/CompositePrimaryKeyModel/tenant-key-value/id-value"',
    );
  });

  it("model id", () => {
    expect(personGid.modelId).toBe("5");
    expect(personUuidGid.modelId).toBe(uuid);
    expect(personNamespacedGid.modelId).toBe("4");
    expect(personModelGid.modelId).toBe("1");
    expect(cpkModelGid.modelId).toEqual(["tenant-key-value", "id-value"]);
  });

  it("model name", () => {
    expect(personGid.modelName).toBe("Person");
    expect(personUuidGid.modelName).toBe("PersonUuid");
    expect(personNamespacedGid.modelName).toBe("Person::Child");
    expect(personModelGid.modelName).toBe("PersonModel");
    expect(cpkModelGid.modelName).toBe("CompositePrimaryKeyModel");
  });

  it("model class", () => {
    expect(personGid.modelClass).toBe(Person);
    expect(personUuidGid.modelClass).toBe(PersonUuid);
    expect(personNamespacedGid.modelClass).toBe(PersonChild);
    expect(personModelGid.modelClass).toBe(PersonModel);
    expect(cpkModelGid.modelClass).toBe(CompositePrimaryKeyModel);
    expect(() => GlobalID.parse("gid://bcx/SignedGlobalID/5")!.modelClass).toThrow();
  });

  it(":app option", () => {
    expect(GlobalID.create(new Person(5)).toString()).toBe("gid://bcx/Person/5");
    expect(GlobalID.create(new Person(5), { app: "foo" }).toString()).toBe("gid://foo/Person/5");
    _resetApp();
    expect(() => GlobalID.create(new Person(5), { app: null as unknown as string })).toThrow();
  });

  it("equality", () => {
    const p1 = new Person(5);
    const p2 = new Person(5);
    const p3 = new Person(10);
    expect(p1).toEqual(p2);
    expect(p2).not.toEqual(p3);

    const gid1 = GlobalID.create(p1);
    const gid2 = GlobalID.create(p2);
    const gid3 = GlobalID.create(p3);
    expect(gid1).toEqual(gid2);
    expect(gid2).not.toEqual(gid3);

    expect([gid1]).toEqual(uniq([gid1, gid2]));
    expect([gid1, gid3]).toEqual(uniq([gid1, gid2, gid3]));

    expect(gid1).not.toEqual(gid1.uri);

    expect([gid1, gid1.uri]).toEqual(uniq([gid1, gid1.uri]));
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
