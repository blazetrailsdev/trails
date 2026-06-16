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

    this.afterInitialize((record: Publication) => {
      (record as any).editorInChief = (record as any).buildEditorInChief({ name: "John Doe" });
    });

    this.afterSaveCommit((record: Publication) => {
      record.touchName();
    });
  }

  touchName() {
    (this as any).name = `${(this as any).name} (touched)`;
  }
}
