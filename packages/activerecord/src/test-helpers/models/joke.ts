// vendor/rails/activerecord/test/models/joke.rb
import { Base } from "../../base.js";

export class Joke extends Base {
  static _tableName = "funny_jokes";
}

export class GoodJoke extends Base {
  static _tableName = "funny_jokes";
}
