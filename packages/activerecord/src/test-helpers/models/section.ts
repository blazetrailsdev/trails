import type { Seminar } from "./seminar.js";
import type { Session } from "./session.js";
import { Base } from "../../base.js";

export class Section extends Base {
  declare seminar_id: number;
  declare session_id: number;
  declare short_name: string;

  static {
    this.belongsTo("session", { inverseOf: "sections", autosave: true });
    this.belongsTo("seminar", { inverseOf: "sections", autosave: true });
  }
}
export interface Section {
  get session(): Session | null | Promise<Session | null>;
  set session(value: Session | null);
  get seminar(): Seminar | null | Promise<Seminar | null>;
  set seminar(value: Seminar | null);
}
