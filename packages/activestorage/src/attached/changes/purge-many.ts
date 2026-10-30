import type { Relation } from "@blazetrails/activerecord";
import { rbFSend } from "@blazetrails/ruby-compat";
import type { Attachment } from "../../attachment.js";
import type { AttachedRecord } from "../../attached.js";
import { Changes } from "../changes.js";

export class PurgeMany {
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

  async purge(): Promise<void> {
    for (const attachment of await this.attachments) await attachment.purge();
    this.reset();
  }

  async purgeLater(): Promise<void> {
    for (const attachment of await this.attachments) await attachment.purgeLater();
    this.reset();
  }

  /** @internal */
  private reset(): void {
    delete this.record.attachmentChanges[this.name];
    (rbFSend(this.record, `${this.name}Attachments`) as Relation<Attachment>).reset();
  }
}

Changes.PurgeMany = PurgeMany;
