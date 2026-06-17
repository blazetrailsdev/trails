// vendor/rails/activerecord/test/models/frog.rb
import { Base } from "../../base.js";

export class Frog extends Base {
  declare name: string;

  static {
    this.afterSave(async (frog: Frog) => {
      await frog.withLock(async () => {});
    });
  }
}
