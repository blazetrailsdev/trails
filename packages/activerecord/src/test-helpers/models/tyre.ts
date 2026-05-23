// vendor/rails/activerecord/test/models/tyre.rb
import { Base } from "../../base.js";

export class Tyre extends Base {
  static {
    // Rails: counter_cache: { active: true, column: :custom_tyres_count }
    this.belongsTo("car", { counterCache: "custom_tyres_count" });
  }

  static customFind(id: any) {
    return this.find(id);
  }

  static customFindBy(args: any) {
    return this.findBy(args);
  }
}
