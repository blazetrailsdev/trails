import type { Editor } from "./editor.js";
import type { Publication } from "./publication.js";
import { Base } from "../../base.js";

export class Editorship extends Base {
  declare editor_id: string;
  declare publication_id: string;

  static {
    this.belongsTo("publication");
    this.belongsTo("editor");
  }
}
export interface Editorship {
  get publication(): Publication | null | Promise<Publication | null>;
  set publication(value: Publication | null);
  get editor(): Editor | null | Promise<Editor | null>;
  set editor(value: Editor | null);
}
