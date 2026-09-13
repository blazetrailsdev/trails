import type { Seminar } from "./seminar.js";
import type { Session } from "./session.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Section extends Base {
  declare seminar_id: number;
  declare session_id: number;
  declare short_name: string;

  static {
    this.belongsTo("session", { inverseOf: "sections", autosave: true });
    this.belongsTo("seminar", { inverseOf: "sections", autosave: true });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Section {
  get session(): Session | null | Promise<Session | null>;
  set session(value: Session | null);
  get seminar(): Seminar | null | Promise<Seminar | null>;
  set seminar(value: Seminar | null);
}
