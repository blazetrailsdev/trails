import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setApp, _resetApp } from "./config.js";
import { GlobalID } from "./global-id.js";
import { Locator, setModelFinder, _resetModelFinder, type LocatorModel } from "./locator.js";

class FakePerson {
  static name = "FakePerson";
  static primaryKey = "id";
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  // find(scalar) → single; find(array) → batch (Rails parity).
  static async find(id: unknown): Promise<FakePerson | FakePerson[]> {
    if (Array.isArray(id)) {
      if (id.some((p) => p === "missing")) throw new Error("not found");
      return id.map((i) => new FakePerson(String(i)));
    }
    if (id === "missing") throw new Error("not found");
    return new FakePerson(String(id));
  }
  static where(conds: Record<string, unknown>): { toArray(): Promise<FakePerson[]> } {
    const ids = conds["id"] as unknown[];
    return {
      async toArray() {
        return ids.filter((id) => id !== "missing").map((id) => new FakePerson(String(id)));
      },
    };
  }
}

class FakeAccount {
  static name = "FakeAccount";
  static primaryKey = "id";
  id: string;
  constructor(id: string) {
    this.id = id;
  }
  static async find(id: unknown): Promise<FakeAccount | FakeAccount[]> {
    if (Array.isArray(id)) return id.map((i) => new FakeAccount(String(i)));
    return new FakeAccount(String(id));
  }
}

const REGISTRY: Record<string, LocatorModel> = {
  FakePerson: FakePerson as unknown as LocatorModel,
  FakeAccount: FakeAccount as unknown as LocatorModel,
};

describe("GlobalLocatorTest", () => {
  beforeEach(() => {
    setApp("bcx");
    setModelFinder((name) => REGISTRY[name]);
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("by GID", async () => {
    const gid = GlobalID.create(new FakePerson("5"));
    const found = (await Locator.locate(gid)) as FakePerson;
    expect(found).toBeInstanceOf(FakePerson);
    expect(found.id).toBe("5");
  });

  it("by GID string", async () => {
    const found = (await Locator.locate("gid://bcx/FakePerson/7")) as FakePerson;
    expect(found).toBeInstanceOf(FakePerson);
    expect(found.id).toBe("7");
  });

  it("by GID with only: restriction with match", async () => {
    const gid = GlobalID.create(new FakePerson("5"));
    const found = await Locator.locate(gid, { only: FakePerson as unknown as LocatorModel });
    expect(found).toBeInstanceOf(FakePerson);
  });

  it("by GID with only: restriction with no match", async () => {
    const gid = GlobalID.create(new FakePerson("5"));
    const found = await Locator.locate(gid, { only: FakeAccount as unknown as LocatorModel });
    expect(found).toBeNull();
  });

  it("by GID with only: restriction by multiple types", async () => {
    const gid = GlobalID.create(new FakePerson("5"));
    const found = await Locator.locate(gid, {
      only: [FakeAccount as unknown as LocatorModel, FakePerson as unknown as LocatorModel],
    });
    expect(found).toBeInstanceOf(FakePerson);
  });

  it("returns null for invalid input or unknown class", async () => {
    expect(await Locator.locate("not-a-gid")).toBeNull();
    expect(await Locator.locate("gid://bcx/UnknownModel/1")).toBeNull();
  });

  it("propagates errors from find (Rails parity — find raises RecordNotFound)", async () => {
    await expect(Locator.locate("gid://bcx/FakePerson/missing")).rejects.toThrow();
  });

  it("locate_many returns records in input order", async () => {
    const gids = ["gid://bcx/FakePerson/3", "gid://bcx/FakeAccount/1", "gid://bcx/FakePerson/2"];
    const found = await Locator.locateMany(gids);
    expect(found).toHaveLength(3);
    expect((found[0] as FakePerson).id).toBe("3");
    expect((found[1] as FakeAccount).id).toBe("1");
    expect((found[2] as FakePerson).id).toBe("2");
  });

  it("locate_many with only: filters by class", async () => {
    const gids = ["gid://bcx/FakePerson/1", "gid://bcx/FakeAccount/1"];
    const found = await Locator.locateMany(gids, {
      only: FakePerson as unknown as LocatorModel,
    });
    expect(found).toHaveLength(1);
    expect(found[0]).toBeInstanceOf(FakePerson);
  });

  it("locate_many with ignoreMissing skips missing records", async () => {
    const gids = ["gid://bcx/FakePerson/1", "gid://bcx/FakePerson/missing"];
    const found = await Locator.locateMany(gids, { ignoreMissing: true });
    expect(found).toHaveLength(1);
    expect((found[0] as FakePerson).id).toBe("1");
  });
});

describe("locateMany with custom primaryKey and slash-containing composite ids", () => {
  class UuidModel {
    static name = "UuidModel";
    static primaryKey = "uuid";
    uuid: string;
    constructor(uuid: string) {
      this.uuid = uuid;
    }
    static async find(id: unknown): Promise<UuidModel | UuidModel[]> {
      return Array.isArray(id)
        ? id.map((i) => new UuidModel(String(i)))
        : new UuidModel(String(id));
    }
  }
  class CpkModel {
    static name = "CpkModel";
    static primaryKey: string[] = ["tenant", "key"];
    id: string[];
    constructor(id: string[]) {
      this.id = id;
    }
    static async find(id: unknown): Promise<CpkModel | CpkModel[]> {
      const arr = id as unknown[];
      // Batch find of multiple composite ids vs. single composite id —
      // distinguish by whether the first element is an array.
      if (Array.isArray(arr[0])) return arr.map((i) => new CpkModel((i as string[]).map(String)));
      return new CpkModel((arr as string[]).map(String));
    }
  }

  beforeEach(() => {
    setApp("bcx");
    setModelFinder(
      (name) =>
        ({ UuidModel, CpkModel })[name as "UuidModel" | "CpkModel"] as unknown as LocatorModel,
    );
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("indexes records by their primaryKey property, not hard-coded id", async () => {
    const found = await Locator.locateMany(["gid://bcx/UuidModel/abc", "gid://bcx/UuidModel/def"]);
    expect(found).toHaveLength(2);
    expect((found[0] as UuidModel).uuid).toBe("abc");
    expect((found[1] as UuidModel).uuid).toBe("def");
  });

  it("composite ids with internal slashes don't collide on join", async () => {
    // ['a/b', 'c'] and ['a', 'b/c'] both join to 'a/b/c' under the old key.
    const g1 = "gid://bcx/CpkModel/a%2Fb/c";
    const g2 = "gid://bcx/CpkModel/a/b%2Fc";
    const found = await Locator.locateMany([g1, g2]);
    expect(found).toHaveLength(2);
    expect((found[0] as CpkModel).id).toEqual(["a/b", "c"]);
    expect((found[1] as CpkModel).id).toEqual(["a", "b/c"]);
  });
});

describe("locateMany ignoreMissing without toArray on the relation", () => {
  class BadWhereModel {
    static name = "BadWhereModel";
    static primaryKey = "id";
    id: string;
    constructor(id: string) {
      this.id = id;
    }
    static async find(id: unknown): Promise<BadWhereModel | BadWhereModel[]> {
      if (Array.isArray(id)) return id.map((i) => new BadWhereModel(String(i)));
      return new BadWhereModel(String(id));
    }
    // Returns a relation object missing .toArray — should trigger the
    // explicit throw rather than silently returning [].
    static where(): { someOtherMethod?: () => void } {
      return {};
    }
  }

  beforeEach(() => {
    setApp("bcx");
    setModelFinder((name) =>
      name === "BadWhereModel" ? (BadWhereModel as unknown as LocatorModel) : undefined,
    );
  });
  afterEach(() => {
    _resetApp();
    _resetModelFinder();
  });

  it("throws a clear error instead of silently returning []", async () => {
    await expect(
      Locator.locateMany(["gid://bcx/BadWhereModel/1"], { ignoreMissing: true }),
    ).rejects.toThrow(/toArray/);
  });
});

describe("Locator without model finder", () => {
  beforeEach(() => {
    setApp("bcx");
    _resetModelFinder();
  });
  afterEach(() => _resetApp());

  it("returns null when no finder is registered", async () => {
    expect(await Locator.locate("gid://bcx/FakePerson/1")).toBeNull();
  });
});
