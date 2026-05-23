// vendor/rails/activerecord/test/models/publication.rb
import { Base } from "../../base.js";

export class Publication extends Base {
  static {
    this.belongsTo("editorInChief", {
      className: "Editor",
      inverseOf: "publication",
      optional: true,
    });
    this.hasMany("editorships");
    this.hasMany("editors", { through: "editorships" });

    this.afterInitialize(async function (this: Publication) {
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
