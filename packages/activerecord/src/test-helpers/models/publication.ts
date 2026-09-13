import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Editor } from "./editor.js";
import type { Editorship } from "./editorship.js";
import { Base } from "../../base.js";

export class Publication extends Base {
  declare editorships: AssociationProxy<Editorship>;
  declare editors: AssociationProxy<Editor>;
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
    this.writeAttribute("name", `${this.readAttribute("name")} (touched)`);
  }
}
export interface Publication {
  get editorInChief(): Editor | null | Promise<Editor | null>;
  set editorInChief(value: Editor | null);
}
