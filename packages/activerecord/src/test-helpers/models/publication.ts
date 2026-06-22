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

    this.afterInitialize((record: Publication) => {
      record.editorInChief = (record as any).buildEditorInChief({ name: "John Doe" });
    });

    this.afterSaveCommit((record: Publication) => {
      record.touchName();
    });
  }

  touchName() {
    // `name` is a restricted attribute in trails (collides with Function#name),
    // so no `.name` getter/setter is generated — read/write the column directly.
    this.writeAttribute("name", `${this.readAttribute("name")} (touched)`);
  }
}
