import { describe, it, expect } from "vitest";
import { HashWithIndifferentAccess } from "@blazetrails/activesupport";
import { IndifferentCoder } from "./store.js";
import { AdminUser } from "./test-helpers/models/admin/user.js";
import { fixtures } from "./test-fixtures.js";

fixtures(["admin/accounts", "admin/users"]);

describe("StoreTrailsTest", () => {
  it("a value that implements neither load nor dump resolves through YAMLColumn", () => {
    const coder = new IndifferentCoder("settings", null);
    const dumped = coder.dump({ color: "black" }) as string;

    expect(dumped).toContain("color: black");
    expect(coder.load(dumped).get("color")).toBe("black");
  });

  it("a nested store value keeps indifferent access through the dirty accessors", async () => {
    const john = (await AdminUser.create({ name: "John Doe" })) as InstanceType<
      typeof AdminUser
    > & {
      favoriteFood: unknown;
      favoriteFoodChange(): [unknown, unknown];
    };
    john.favoriteFood = { name: "pizza" };

    const [, newStore] = john.favoriteFoodChange();

    expect(newStore).toBeInstanceOf(HashWithIndifferentAccess);
    expect((newStore as HashWithIndifferentAccess<unknown>).get("name")).toBe("pizza");
  });
});
