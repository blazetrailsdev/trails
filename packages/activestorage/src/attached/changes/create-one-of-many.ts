import { rbEqual, rbFSend } from "@blazetrails/ruby-compat";
import type { Attachment } from "../../attachment.js";
import { Changes } from "../changes.js";
import { CreateOne } from "./create-one.js";

export class CreateOneOfMany extends CreateOne {
  /** @internal */
  protected override async findAttachment(): Promise<Attachment | null | undefined> {
    if (this.blob.isPersisted()) {
      const attachments = (await rbFSend(this.record, `${this.name}Attachments`)) as Attachment[];
      return attachments.find((attachment) =>
        rbEqual(attachment.readAttribute("blob_id"), this.blob.id),
      );
    } else {
      const attachments = (await this.blob.attachments) as unknown as Attachment[];
      for (const attachment of attachments) {
        if (rbEqual(await attachment.record, this.record)) return attachment;
      }
    }
  }
}

Changes.CreateOneOfMany = CreateOneOfMany;
