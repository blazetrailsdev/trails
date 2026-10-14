import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Squeak } from "./squeak.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Mouse extends Base {
  declare squeaks: AssociationProxy<Squeak>;
  declare name: string;

  static {
    this.hasMany("squeaks", { autosave: true });
    this.validates("name", { presence: true });
  }
}
registerModel(Mouse);
