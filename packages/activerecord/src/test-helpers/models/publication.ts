import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Editor } from "./editor.js";
import type { Editorship } from "./editorship.js";
// vendor/rails/activerecord/test/models/publication.rb
import { Base } from "../../base.js";

export class Publication extends Base {
  declare editorInChief: Editor | null;
  declare editorships: AssociationProxy<Editorship>;
  declare editors: AssociationProxy<Editor>;
  declare loadBelongsTo: (name: "editorInChief") => Promise<Editor | null>;
  declare editor_in_chief_id: number;
  declare name: string;

  static {
    this.belongsTo("editorInChief", {
      className: "Editor",
      inverseOf: "publication",
      optional: true,
    });
    this.hasMany("editorships");
    this.hasMany("editors", { through: "editorships" });

    this.afterInitialize(function (this: Publication) {
      (this as any).editorInChief = (this as any).buildEditorInChief({ name: "John Doe" });
    });

    this.afterSaveCommit(async function (this: Publication) {
      this.touchName();
    });
  }

  touchName() {
    (this as any).name = `${(this as any).name} (touched)`;
  }
}
