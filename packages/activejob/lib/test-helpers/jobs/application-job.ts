import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";
export class ApplicationJob extends Base {
  static toString(): string {
    return "ApplicationJob";
  }
}
constSet(TopLevel, "ApplicationJob", ApplicationJob);
