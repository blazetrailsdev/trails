import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Editorship } from "./editorship.js";
import type { Publication } from "./publication.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Editor extends Base {
  declare editorships: AssociationProxy<Editorship>;
  declare name: string;

  static {
    this.primaryKey = "name";

    this.hasOne("publication", { foreignKey: "editor_in_chief_id", inverseOf: "editorInChief" });
    this.hasMany("editorships");
  }
}
constSet(TopLevel, "Editor", Editor);
DescendantsTracker.registerSubclass(Base, Editor);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Editor {
  get publication(): Publication | null | Promise<Publication | null>;
  set publication(value: Publication | null);
}
