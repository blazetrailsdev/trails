import type { Relation } from "../../relation.js";
// vendor/rails/activerecord/test/models/cat.rb
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
    this.enum("gender", { female: 0, male: 1 });
    this.defaultScope((q: any) => q.where({ is_vegetarian: false }));
  }
}

// Rails' `Lion` is an empty subclass (test/models/cat.rb:11); the `declare`s are
// trails-only typing for the reflected `lions` columns. `gender` reads back as
// its enum label, not the stored integer, so it is typed as the label union.
export class Lion extends Cat {
  declare gender: "female" | "male" | null;
  declare is_vegetarian: boolean | null;
}
