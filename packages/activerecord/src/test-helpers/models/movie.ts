import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Movie extends Base {
  declare movieid: number;
  declare name: string;

  static {
    this.primaryKey = "movieid";
    this.validates("name", { presence: true });
  }
}
constSet(TopLevel, "Movie", Movie);
DescendantsTracker.registerSubclass(Base, Movie);
