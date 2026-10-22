import { afterEach, describe, expect, it } from "vitest";
import { registerConstant, resetConstants } from "@blazetrails/ruby-compat";
import { GlobalID } from "./global-id.js";
import { Locator, type LocatorModel } from "./locator.js";

class MixedIdModel {
  static primaryKey: string[] = ["tenant", "key"];
  constructor(public id: string | string[]) {}
  static async find(): Promise<MixedIdModel[]> {
    return [new MixedIdModel(["a", "b"]), new MixedIdModel("a,b")];
  }
}

describe("Locator (trails)", () => {
  afterEach(() => resetConstants());

  it("use without a locator or a block raises", () => {
    expect(() => Locator.use("app")).toThrow(
      "No locator provided. Pass a block or an object that responds to #locate.",
    );
  });

  it("locate_many keeps a composite id distinct from its String spelling", async () => {
    registerConstant("MixedIdModel", MixedIdModel as unknown as LocatorModel);
    const gid = GlobalID.create(new MixedIdModel(["a", "b"]), { app: "bcx" });
    const located = (await Locator.locateMany([gid])) as MixedIdModel[];
    expect(located).toHaveLength(1);
    expect(located[0].id).toStrictEqual(["a", "b"]);
  });
});
