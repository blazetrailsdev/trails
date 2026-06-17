import type { Editor } from "./editor.js";
import type { Publication } from "./publication.js";
// vendor/rails/activerecord/test/models/editorship.rb
import { Base } from "../../base.js";

export class Editorship extends Base {
  declare publication: Publication | null;
  declare editor: Editor | null;
  declare loadBelongsTo: ((name: "publication") => Promise<Publication | null>) &
    ((name: "editor") => Promise<Editor | null>);
  declare editor_id: string;
  declare publication_id: string;

  static {
    this.belongsTo("publication");
    this.belongsTo("editor");
  }
}
