import type { UuidEntry } from "./uuid-entry.js";
import { Base } from "../../base.js";

export class UuidComment extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
export interface UuidComment {
  get uuidEntry(): UuidEntry | null | Promise<UuidEntry | null>;
  set uuidEntry(value: UuidEntry | null);
}
