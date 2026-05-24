// vendor/rails/activerecord/test/models/frog.rb
import { Base } from "../../base.js";

export class Frog extends Base {
  static {
    this.afterSave(async function (this: Frog) {
      await this.withLock(async () => {});
    });
  }
}
