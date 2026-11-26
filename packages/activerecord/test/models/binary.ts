import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Binary extends Base {
  declare blob_data: Uint8Array;
  declare data: Uint8Array;
  declare name: string;
  declare short_data: Uint8Array | null;
}
constSet(TopLevel, "Binary", Binary);
DescendantsTracker.registerSubclass(Base, Binary);
