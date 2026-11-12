import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";

export class Joke extends Base {
  declare name: string;
  static _tableName = "funny_jokes";
}
constSet(TopLevel, "Joke", Joke);
DescendantsTracker.registerSubclass(Base, Joke);

export class GoodJoke extends Base {
  static _tableName = "funny_jokes";
}
constSet(TopLevel, "GoodJoke", GoodJoke);
DescendantsTracker.registerSubclass(Base, GoodJoke);
