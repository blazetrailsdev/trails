import { rbObjRespondTo } from "@blazetrails/ruby-compat";
import type { Attachment } from "../../attachment.js";
import type { AttachedRecord } from "../../attached.js";
import { Changes } from "../changes.js";

export class DetachMany {
  readonly name: string;
  readonly record: AttachedRecord;
  readonly attachments: PromiseLike<Attachment[]> | Attachment[];

  constructor(
    name: string,
    record: AttachedRecord,
    attachments: PromiseLike<Attachment[]> | Attachment[],
  ) {
    this.name = name;
    this.record = record;
    this.attachments = attachments;
  }

  async detach(): Promise<void> {
    if ((await this.attachments).length > 0) {
      if (rbObjRespondTo(this.attachments, "deleteAll")) {
        await (this.attachments as unknown as { deleteAll(): Promise<number> }).deleteAll();
      }
      delete this.record.attachmentChanges[this.name];
    }
  }
}

Changes.DetachMany = DetachMany;
