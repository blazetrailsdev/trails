import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Event extends Base {
  declare title: string | null;

  static {
    this.validates("title", { uniqueness: true });
  }
}
registerModel(Event);
