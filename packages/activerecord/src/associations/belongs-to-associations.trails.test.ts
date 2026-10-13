import { describe, it, expect } from "vitest";
import { Base } from "../index.js";
import { fixtures } from "../test-helpers/use-fixtures.js";
import { Developer } from "../test-helpers/models/developer.js";

describe("BelongsToAssociationsTest", () => {
  const { developers } = fixtures(["developers"]);

  it("default with required association", async () => {
    const david = await Developer.find(developers("david").id);
    const jamis = await Developer.find(developers("jamis").id);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    class TempDefault extends Base {
      static _tableName = "ships";
      static {
        this.belongsTo("developer", {
          default: () => Developer.first(),
          optional: false,
          inverseOf: false,
        });
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
    interface TempDefault {
      get developer(): Developer | null | Promise<Developer | null>;
      set developer(value: Developer | null);
    }

    let ship = await TempDefault.create({});
    expect((await ship.developer)!.id).toBe(david.id);

    ship = await TempDefault.create({ developer: jamis });
    expect((await ship.developer)!.id).toBe(jamis.id);
  });
});
