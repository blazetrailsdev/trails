import { registerConstant } from "@blazetrails/ruby-compat";
import type { Relation } from "../../relation.js";
import { Base } from "../../base.js";

export class Cat extends Base {
  declare isFemale: () => boolean;
  declare femaleBang: () => Promise<true | undefined>;
  declare static female: () => Relation<Cat>;
  declare static notFemale: () => Relation<Cat>;
  declare isMale: () => boolean;
  declare maleBang: () => Promise<true | undefined>;
  declare static male: () => Relation<Cat>;
  declare static notMale: () => Relation<Cat>;

  static {
    this.abstractClass = true;
    this.enum("gender", ["female", "male"]);
    this.defaultScope(function (this: any) {
      return this.where({ is_vegetarian: false });
    });
  }
}
registerConstant("Cat", Cat);

export class Lion extends Cat {
  declare gender: "female" | "male" | null;
  declare is_vegetarian: boolean | null;
}
registerConstant("Lion", Lion);
