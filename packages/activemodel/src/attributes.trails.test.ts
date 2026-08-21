import { describe, it, expect } from "vitest";
import { Model } from "./model.js";

describe("Attributes#attribute_names", () => {
  class User extends Model {
    static {
      this.attribute("name", "string");
      this.attribute("token", "string", { virtual: true });
    }
  }

  it("is the instance's @attributes keys, virtual attributes included", () => {
    expect(new User().attributeNames()).toEqual(["name", "token"]);
  });

  it("the class-level reader is attribute_types.keys, virtual attributes included", () => {
    expect(User.attributeNames()).toEqual(["name", "token"]);
  });
});
