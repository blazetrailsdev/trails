import type { UuidEntry } from "./uuid-entry.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class UuidMessage extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface UuidMessage {
  get uuidEntry(): UuidEntry | null | Promise<UuidEntry | null>;
  set uuidEntry(value: UuidEntry | null);
}
