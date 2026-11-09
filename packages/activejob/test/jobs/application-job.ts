import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { Base } from "../../lib/base.js";
export class ApplicationJob extends Base {
  static toString(): string {
    return "ApplicationJob";
  }
}
constSet(TopLevel, "ApplicationJob", ApplicationJob);
