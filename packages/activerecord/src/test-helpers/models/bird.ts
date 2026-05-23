// vendor/rails/activerecord/test/models/bird.rb
import { Base } from "../../base.js";

export class Bird extends Base {
  static {
    this.belongsTo("pirate");
    this.validates("name", { presence: true });

    this.beforeSave(
      function (this: any) {
        this.cancelSaveCallbackMethod();
      },
      { if: (r: any) => r.cancelSaveFromCallback },
    );
  }

  cancelSaveCallbackMethod() {
    throw "abort";
  }
}
