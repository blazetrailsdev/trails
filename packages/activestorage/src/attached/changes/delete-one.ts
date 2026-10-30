import type { AssociationWriter, AttachedRecord } from "../../attached.js";
import { Changes } from "../changes.js";

export class DeleteOne {
  readonly name: string;
  readonly record: AttachedRecord;

  constructor(name: string, record: AttachedRecord) {
    this.name = name;
    this.record = record;
  }

  get attachment(): null {
    return null;
  }

  /** @inventedArm writer — PERMANENT */
  async save(): Promise<void> {
    await (
      this.record.association(`${this.name}Attachment`) as unknown as AssociationWriter
    ).writer(null);
  }
}

Changes.DeleteOne = DeleteOne;
