import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Movie extends Base {
  declare movieid: number;
  declare name: string;

  static {
    this.primaryKey = "movieid";
    this.validates("name", { presence: true });
  }
}
registerModel(Movie);
