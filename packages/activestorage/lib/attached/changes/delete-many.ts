import type { AssociationWriter, AttachedRecord } from "../../attached.js";
import { Attachment } from "../../attachment.js";
import { ActiveStorage } from "../../active-storage.js";
import { Changes } from "../changes.js";

export class DeleteMany {
  readonly name: string;
  readonly record: AttachedRecord;

  constructor(name: string, record: AttachedRecord) {
    this.name = name;
    this.record = record;
  }

  get attachables(): unknown[] {
    return [];
  }

  get attachments() {
    return Attachment.none();
  }

  get blobs() {
    return ActiveStorage.Blob!.none();
  }

  /** @inventedArm writer — PERMANENT */
  async save(): Promise<void> {
    await (
      this.record.association(`${this.name}Attachments`) as unknown as AssociationWriter
    ).writer([]);
  }
}

Changes.DeleteMany = DeleteMany;
