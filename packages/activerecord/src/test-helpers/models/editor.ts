// vendor/rails/activerecord/test/models/editor.rb
import { Base } from "../../base.js";

export class Editor extends Base {
  static {
    this.primaryKey = "name";

    this.hasOne("publication", { foreignKey: "editor_in_chief_id", inverseOf: "editorInChief" });
    this.hasMany("editorships");
  }
}
