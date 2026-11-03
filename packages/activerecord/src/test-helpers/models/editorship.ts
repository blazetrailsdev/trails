import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Editor } from "./editor.js";
import type { Publication } from "./publication.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Editorship extends Base {
  declare editor_id: string;
  declare publication_id: string;

  static {
    this.belongsTo("publication");
    this.belongsTo("editor");
  }
}
constSet(TopLevel, "Editorship", Editorship);
DescendantsTracker.registerSubclass(Base, Editorship);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Editorship {
  get publication(): Publication | null | Promise<Publication | null>;
  set publication(value: Publication | null);
  get editor(): Editor | null | Promise<Editor | null>;
  set editor(value: Editor | null);
}
