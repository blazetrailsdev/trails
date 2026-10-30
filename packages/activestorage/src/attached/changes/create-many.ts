import { rbFArray, rbFSend } from "@blazetrails/ruby-compat";
import type { Attachment } from "../../attachment.js";
import type { AssociationWriter, AttachedRecord } from "../../attached.js";
import { Blob } from "../../blob.js";
import type { Relation } from "@blazetrails/activerecord";
import { Changes } from "../changes.js";
import { CreateOneOfMany } from "./create-one-of-many.js";

export class CreateMany {
  readonly name: string;
  readonly record: AttachedRecord;
  readonly attachables: unknown[];
  pendingUploads: CreateOneOfMany[];
  private _attachments?: Attachment[];
  private _blobs?: Blob[];
  private _subchanges?: CreateOneOfMany[];

  constructor(
    name: string,
    record: AttachedRecord,
    attachables: unknown,
    { pendingUploads = [] }: { pendingUploads?: CreateOneOfMany[] | null } = {},
  ) {
    this.name = name;
    this.record = record;
    this.attachables = rbFArray(attachables);
    this.pendingUploads = rbFArray(pendingUploads) as CreateOneOfMany[];
  }

  /** @noRailsEquivalent PERMANENT */
  async unfurl(): Promise<void> {
    for (const subchange of this.subchanges) await subchange.unfurl();
    this.pendingUploads = [...this.pendingUploads, ...this.subchangesWithoutBlobs()];
    void this.attachments;
  }

  get attachments(): Attachment[] {
    return (this._attachments ??= this.subchanges.map((subchange) => subchange.attachment));
  }

  get blobs(): Blob[] {
    return (this._blobs ??= this.subchanges.map((subchange) => subchange.blob));
  }

  async upload(): Promise<void> {
    for (const pendingUpload of this.pendingUploads) await pendingUpload.upload();
  }

  async save(): Promise<void> {
    await this.assignAssociatedAttachments();
    this.resetAssociatedBlobs();
  }

  /** @internal */
  private get subchanges(): CreateOneOfMany[] {
    return (this._subchanges ??= this.attachables.map((attachable) =>
      this.buildSubchangeFrom(attachable),
    ));
  }

  /** @internal */
  private buildSubchangeFrom(attachable: unknown): CreateOneOfMany {
    return new CreateOneOfMany(this.name, this.record, attachable);
  }

  /** @internal */
  private subchangesWithoutBlobs(): CreateOneOfMany[] {
    return this.subchanges.filter((subchange) => !(subchange.attachable instanceof Blob));
  }

  /**
   * @internal
   * @inventedArm writer — PERMANENT
   */
  private async assignAssociatedAttachments(): Promise<void> {
    await (
      this.record.association(`${this.name}Attachments`) as unknown as AssociationWriter
    ).writer(this.persistedOrNewAttachments());
  }

  /** @internal */
  private resetAssociatedBlobs(): void {
    (rbFSend(this.record, `${this.name}Blobs`) as Relation<Blob>).reset();
  }

  /** @internal */
  private persistedOrNewAttachments(): Attachment[] {
    return this.attachments.filter(
      (attachment) => attachment.isPersisted() || attachment.isNewRecord(),
    );
  }
}

Changes.CreateMany = CreateMany;
