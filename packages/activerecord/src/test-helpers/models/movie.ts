// vendor/rails/activerecord/test/models/movie.rb
import { Base } from "../../base.js";

export class Movie extends Base {
  declare movieid: number;
  declare name: string;

  static {
    this._primaryKey = "movieid";
    this.validates("name", { presence: true });
  }
}
