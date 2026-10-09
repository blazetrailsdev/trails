import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Joke extends Base {
  declare name: string;
  static _tableName = "funny_jokes";
}
registerConstant("Joke", Joke);

export class GoodJoke extends Base {
  static _tableName = "funny_jokes";
}
registerConstant("GoodJoke", GoodJoke);
