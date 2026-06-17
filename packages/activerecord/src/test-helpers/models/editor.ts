import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Editorship } from "./editorship.js";
import type { Publication } from "./publication.js";
// vendor/rails/activerecord/test/models/editor.rb
import { Base } from "../../base.js";

export class Editor extends Base {
  declare publication: Publication | null;
  declare editorships: AssociationProxy<Editorship>;
  declare loadHasOne: (name: "publication") => Promise<Publication | null>;
  declare name: string;

  static {
    this.primaryKey = "name";

    this.hasOne("publication", { foreignKey: "editor_in_chief_id", inverseOf: "editorInChief" });
    this.hasMany("editorships");
  }
}
