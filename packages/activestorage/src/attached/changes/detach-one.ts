import type { Attachment } from "../../attachment.js";
import type { AssociationWriter, AttachedRecord } from "../../attached.js";
import { Changes } from "../changes.js";

export class DetachOne {
  readonly name: string;
  readonly record: AttachedRecord;
  readonly attachment: Attachment | null;

  constructor(name: string, record: AttachedRecord, attachment: Attachment | null) {
    this.name = name;
    this.record = record;
    this.attachment = attachment;
  }

  async detach(): Promise<void> {
    if (this.attachment != null) {
      await this.attachment.delete();
      await this.reset();
    }
  }

  /**
   * @internal
   * @inventedArm writer — PERMANENT
   */
  private async reset(): Promise<void> {
    delete this.record.attachmentChanges[this.name];
    await (
      this.record.association(`${this.name}Attachment`) as unknown as AssociationWriter
    ).writer(null);
  }
}

Changes.DetachOne = DetachOne;
