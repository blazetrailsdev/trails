import { File } from "@blazetrails/ruby-compat/file";
import { Base } from "../../../../../lib/generators/base.js";

export class UsageTemplateGenerator extends Base {
  static {
    this.sourceRoot(File.expandPath("templates", import.meta.dirname));
  }
}
