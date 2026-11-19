import { describe, it, expectTypeOf } from "vitest";
import { classAttribute } from "@blazetrails/activesupport";

class Base {
  declare static setting: number;
  declare setting: number;

  static {
    classAttribute.call(this, "setting", { default: 1 });
  }
}

class Subclass extends Base {}

describe("classAttribute", () => {
  it("keeps the declared value type on a subclass read", () => {
    expectTypeOf(Subclass.setting).toEqualTypeOf<number>();
    expectTypeOf(new Subclass().setting).toEqualTypeOf<number>();
  });

  it("keeps the declared value type on a subclass write", () => {
    Subclass.setting = 2;
    // @ts-expect-error a string is not the declared value type
    Subclass.setting = "2";
  });
});
