import type { Seminar } from "./seminar.js";
import type { Session } from "./session.js";
// vendor/rails/activerecord/test/models/section.rb
import { Base } from "../../base.js";

export class Section extends Base {
  declare session: Session | null;
  declare seminar: Seminar | null;
  declare loadBelongsTo: ((name: "session") => Promise<Session | null>) &
    ((name: "seminar") => Promise<Seminar | null>);
  declare seminar_id: number;
  declare session_id: number;
  declare short_name: string;

  static {
    this.belongsTo("session", { inverseOf: "sections", autosave: true });
    this.belongsTo("seminar", { inverseOf: "sections", autosave: true });
  }
}
