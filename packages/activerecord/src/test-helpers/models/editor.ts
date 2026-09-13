import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Editorship } from "./editorship.js";
import type { Publication } from "./publication.js";
import { Base } from "../../base.js";

export class Editor extends Base {
  declare editorships: AssociationProxy<Editorship>;
  declare name: string;

  static {
    this.primaryKey = "name";

    this.hasOne("publication", { foreignKey: "editor_in_chief_id", inverseOf: "editorInChief" });
    this.hasMany("editorships");
  }
}
export interface Editor {
  get publication(): Publication | null | Promise<Publication | null>;
  set publication(value: Publication | null);
}
