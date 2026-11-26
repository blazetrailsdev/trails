import { describe, it, expect } from "vitest";
import { Hash } from "@blazetrails/ruby-compat/hash";
import { fixtures } from "../../support/use-fixtures.js";
import "../../models/bulb.js";
import { Car } from "../../models/car.js";

describe("Association#initializeAttributes", () => {
  fixtures(["cars"]);

  it("does not let the scope's create attributes overwrite a key passed in a Hash", async () => {
    const car = await Car.find(1);
    const bulb = car.awesomeBulbs.build(new Hash<string, unknown>().set("frickinawesome", false));
    expect(bulb.frickinawesome).toBe(false);
  });
});
