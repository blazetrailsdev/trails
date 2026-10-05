import { include, puts, stdout as $stdout } from "@blazetrails/ruby-compat";
import { Actions } from "../../actions.js";
import type { Base } from "../../base.js";
import { Group, type GroupClass } from "../../group.js";

export class Enum extends Group {
  declare options: Base["options"];

  static {
    const klass = this as unknown as GroupClass;
    include(this, Actions);

    klass.desc("snack");
    klass.classOption("fruit", { aliases: "-f", type: "string", enum: ["apple", "banana"] });
    (this as unknown as GroupClass).methodAdded("snack");
  }

  snack() {
    puts.call($stdout, this.options["fruit"]);
  }
}
