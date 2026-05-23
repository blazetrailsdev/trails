// vendor/rails/activerecord/test/models/cat.rb
import { Base } from "../../base.js";

export class Cat extends Base {
  static {
    this._abstractClass = true;
    this.enum("gender", { female: 0, male: 1 });
    this.defaultScope((q: any) => q.where({ is_vegetarian: false }));
  }
}

export class Lion extends Cat {}
