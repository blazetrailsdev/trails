import { delegateMissingTo, isPresent } from "@blazetrails/activesupport";
import { rbFSend } from "@blazetrails/ruby-compat";
import { Attached } from "../attached.js";
import type { Attachment } from "../attachment.js";
import type { Blob } from "../blob.js";
import type { CreateMany } from "./changes/create-many.js";
import { DetachMany } from "./changes/detach-many.js";
import { PurgeMany } from "./changes/purge-many.js";

export class Many extends Attached {
  async purge(): Promise<void> {
    await this.purgeMany().purge();
  }

  async purgeLater(): Promise<void> {
    await this.purgeMany().purgeLater();
  }

  async detach(): Promise<void> {
    await this.detachMany().detach();
  }

  /** @inventedArm includes — PERMANENT */
  get attachments(): PromiseLike<Attachment[]> | Attachment[] {
    return isPresent(this.change)
      ? (this.change as CreateMany).attachments
      : (
          rbFSend(this.record, `${this.name}Attachments`) as {
            includes(association: string): PromiseLike<Attachment[]>;
          }
        ).includes("blob");
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  get associationAttachments(): PromiseLike<Attachment[]> | Attachment[] {
    return isPresent(this.change)
      ? (this.change as CreateMany).attachments
      : (rbFSend(this.record, `${this.name}Attachments`) as PromiseLike<Attachment[]>);
  }

  get blobs(): PromiseLike<Blob[]> | Blob[] {
    return isPresent(this.change)
      ? (this.change as CreateMany).blobs
      : (rbFSend(this.record, `${this.name}Blobs`) as PromiseLike<Blob[]>);
  }

  async attach(...attachables: unknown[]): Promise<this | null> {
    await rbFSend(this.record, `${this.name}=`, [
      ...(await this.blobs),
      ...attachables.flat(Infinity),
    ]);
    if (this.record.isPersisted() && !this.record.isChanged) {
      if (!(await this.record.save())) return null;
    }
    return rbFSend(this.record, this.name) as this;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  async load(): Promise<void> {
    await this.associationAttachments;
  }

  /** @noRailsEquivalent PERMANENT */
  async isBlank(): Promise<boolean> {
    return !(await this.isAttached());
  }

  async isAttached(): Promise<boolean> {
    return (await this.associationAttachments).length > 0;
  }

  /** @internal */
  private purgeMany(): PurgeMany {
    return new PurgeMany(this.name, this.record, this.associationAttachments);
  }

  /** @internal */
  private detachMany(): DetachMany {
    return new DetachMany(this.name, this.record, this.associationAttachments);
  }
}

Object.setPrototypeOf(
  Many.prototype,
  delegateMissingTo.call(
    Object.create(Object.getPrototypeOf(Many.prototype) as object),
    "associationAttachments",
  ),
);

Attached.Many = Many;
