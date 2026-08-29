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
    this._abstractClass = true;
    this.enum("gender", ["female", "male"]);
    this.defaultScope((q: any) => q.where({ is_vegetarian: false }));
  }
}

export class Lion extends Cat {
  declare gender: "female" | "male" | null;
  declare is_vegetarian: boolean | null;
}
