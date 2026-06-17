import type { Relation } from "../../relation.js";
// vendor/rails/activerecord/test/models/cat.rb
import { Base } from "../../base.js";

export class Cat extends Base {
  declare isFemale: () => boolean;
  declare femaleBang: () => Promise<true>;
  declare static female: () => Relation<Cat>;
  declare static notFemale: () => Relation<Cat>;
  declare isMale: () => boolean;
  declare maleBang: () => Promise<true>;
  declare static male: () => Relation<Cat>;
  declare static notMale: () => Relation<Cat>;

  static {
    this._abstractClass = true;
    this.enum("gender", { female: 0, male: 1 });
    this.defaultScope((q: any) => q.where({ is_vegetarian: false }));
  }
}

export class Lion extends Cat {
  declare gender: number;
  declare is_vegetarian: boolean | null;
}
