import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Squeak } from "./squeak.js";
// vendor/rails/activerecord/test/models/mouse.rb
import { Base } from "../../base.js";

export class Mouse extends Base {
  declare squeaks: AssociationProxy<Squeak>;
  declare name: string;

  static {
    this.hasMany("squeaks", { autosave: true });
    this.validates("name", { presence: true });
  }
}
