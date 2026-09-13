import type { UuidEntry } from "./uuid-entry.js";
import { Base } from "../../base.js";

export class UuidMessage extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
export interface UuidMessage {
  get uuidEntry(): UuidEntry | null | Promise<UuidEntry | null>;
  set uuidEntry(value: UuidEntry | null);
}
