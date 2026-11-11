import { UploadedFile } from "@blazetrails/actionpack";
import { UploadedFile as RackTestUploadedFile } from "@blazetrails/rack-test";
import {
  ArgumentError,
  fetch,
  File,
  Hash,
  isPlainHash,
  Pathname,
  rbEqual,
  rbInspect,
  rbObjRespondTo,
  rbProcCall,
} from "@blazetrails/ruby-compat";
import { Attachment } from "../../attachment.js";
import { Attached, type AssociationWriter, type AttachedRecord } from "../../attached.js";
import { ActiveStorage } from "../../active-storage.js";
import type { Blob } from "../../blob.js";
import { Changes } from "../changes.js";

type BlobIo = Parameters<typeof Blob.buildAfterUnfurling>[0]["io"];

export class CreateOne {
  readonly name: string;
  readonly record: AttachedRecord;
  readonly attachable: unknown;
  private _blob!: Blob;
  private _attachment: Attachment | Promise<Attachment> | undefined;

  constructor(name: string, record: AttachedRecord, attachable: unknown) {
    this.name = name;
    this.record = record;
    this.attachable = attachable;
  }

  /** @noRailsEquivalent PERMANENT */
  async unfurl(): Promise<void> {
    this._blob = await this.findOrBuildBlob();
    await this._blob.identifyWithoutSaving();
  }

  get attachment(): Attachment | Promise<Attachment> {
    return (this._attachment ??= this.findOrBuildAttachment());
  }

  get blob(): Blob {
    return this._blob;
  }

  async upload(): Promise<void> {
    const attachable = this.attachable;
    if (attachable instanceof UploadedFile) {
      await this.blob.uploadWithoutUnfurling(attachable.open() as unknown as BlobIo);
    } else if (attachable instanceof RackTestUploadedFile) {
      await this.blob.uploadWithoutUnfurling(
        (rbObjRespondTo(attachable, "open")
          ? (attachable as unknown as { open(): BlobIo }).open()
          : attachable) as unknown as BlobIo,
      );
    } else if (isPlainHash(attachable) || attachable instanceof Hash) {
      await this.blob.uploadWithoutUnfurling(
        fetch<BlobIo>(attachable as Record<string, unknown>, "io"),
      );
    } else if (attachable instanceof File) {
      await this.blob.uploadWithoutUnfurling(attachable as unknown as BlobIo);
    } else if (attachable instanceof Pathname) {
      await this.blob.uploadWithoutUnfurling(attachable.open() as BlobIo);
    } else if (!(attachable instanceof ActiveStorage.Blob!) && typeof attachable !== "string") {
      throw new ArgumentError(
        `Could not upload: expected attachable, got ${rbInspect(attachable)}`,
      );
    }
  }

  /** @inventedArm writer — PERMANENT */
  async save(): Promise<void> {
    await (
      this.record.association(`${this.name}Attachment`) as unknown as AssociationWriter
    ).writer(await this.attachment);
    await (this.record.association(`${this.name}Blob`) as unknown as AssociationWriter).writer(
      this.blob,
    );
  }

  /**
   * @internal
   * @inventedArm then — PERMANENT
   */
  private findOrBuildAttachment(): Attachment | Promise<Attachment> {
    const attachment = this.findAttachment();
    if (attachment instanceof Promise) {
      return attachment.then((found) => (this._attachment = found || this.buildAttachment()));
    }
    return attachment || this.buildAttachment();
  }

  /**
   * @internal
   * @inventedArm then — PERMANENT
   */
  protected findAttachment():
    | Attachment
    | null
    | undefined
    | Promise<Attachment | null | undefined> {
    const record = this.record as unknown as { [k: string]: unknown };
    const blob = record[`${this.name}Blob`];
    if (blob instanceof Promise) {
      return blob.then((found) =>
        rbEqual(found, this.blob)
          ? (record[`${this.name}Attachment`] as Attachment | null | Promise<Attachment | null>)
          : undefined,
      );
    }
    if (rbEqual(blob, this.blob)) {
      return record[`${this.name}Attachment`] as Attachment | null | Promise<Attachment | null>;
    }
  }

  /** @internal */
  private buildAttachment(): Attachment {
    return new Attachment({ record: this.record, name: this.name, blob: this.blob });
  }

  /** @internal */
  private async findOrBuildBlob(): Promise<Blob> {
    const attachable = this.attachable;
    if (attachable instanceof ActiveStorage.Blob!) {
      return attachable;
    } else if (attachable instanceof UploadedFile) {
      return ActiveStorage.Blob!.buildAfterUnfurling({
        io: attachable.open() as unknown as BlobIo,
        filename: attachable.originalFilename!,
        contentType: attachable.contentType,
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else if (attachable instanceof RackTestUploadedFile) {
      return ActiveStorage.Blob!.buildAfterUnfurling({
        io: (rbObjRespondTo(attachable, "open")
          ? (attachable as unknown as { open(): BlobIo }).open()
          : attachable) as unknown as BlobIo,
        filename: attachable.originalFilename!,
        contentType: attachable.contentType,
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else if (isPlainHash(attachable) || attachable instanceof Hash) {
      return ActiveStorage.Blob!.buildAfterUnfurling({
        record: this.record,
        serviceName: this.attachmentServiceName(),
        ...((attachable instanceof Hash
          ? Object.fromEntries(attachable)
          : attachable) as Parameters<typeof Blob.buildAfterUnfurling>[0]),
      });
    } else if (typeof attachable === "string") {
      return await ActiveStorage.Blob!.findSignedBang(attachable, { record: this.record });
    } else if (attachable instanceof File) {
      return ActiveStorage.Blob!.buildAfterUnfurling({
        io: attachable as unknown as BlobIo,
        filename: File.basename(attachable.path()!),
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else if (attachable instanceof Pathname) {
      return ActiveStorage.Blob!.buildAfterUnfurling({
        io: attachable.open() as BlobIo,
        filename: File.basename(attachable.toString()),
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else {
      throw new ArgumentError(
        `Could not find or build blob: expected attachable, got ${rbInspect(attachable)}`,
      );
    }
  }

  /** @internal */
  private attachmentServiceName(): string | null {
    let serviceName = this.record.attachmentReflections[this.name].options.serviceName;
    if (typeof serviceName === "function") {
      serviceName = rbProcCall(serviceName, this.record);
      Attached.Model.validateServiceConfiguration(
        serviceName as string | null,
        this.record.constructor,
        this.name,
      );
    }
    return serviceName as string | null;
  }
}

Changes.CreateOne = CreateOne;
