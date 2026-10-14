import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Joke extends Base {
  declare name: string;
  static _tableName = "funny_jokes";
}
registerModel(Joke);

export class GoodJoke extends Base {
  static _tableName = "funny_jokes";
}
registerModel(GoodJoke);
