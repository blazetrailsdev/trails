// vendor/rails/activerecord/test/models/strict_zine.rb
import { Zine } from "./zine.js";

export class StrictZine extends Zine {
  static {
    this.strictLoadingByDefault = true;
  }
}
