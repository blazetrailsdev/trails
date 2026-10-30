import { UploadedFile } from "@blazetrails/actionpack";
import { UploadedFile as RackTestUploadedFile } from "@blazetrails/rack-test";
import {
  ArgumentError,
  fetch,
  File,
  isPlainHash,
  Pathname,
  rbEqual,
  rbInspect,
  rbObjRespondTo,
  rbProcCall,
} from "@blazetrails/ruby-compat";
import { Attachment } from "../../attachment.js";
import { Attached, type AssociationWriter, type AttachedRecord } from "../../attached.js";
import { Blob } from "../../blob.js";
import { Changes } from "../changes.js";

type BlobIo = Parameters<typeof Blob.buildAfterUnfurling>[0]["io"];

export class CreateOne {
  readonly name: string;
  readonly record: AttachedRecord;
  readonly attachable: unknown;
  private _blob!: Blob;
  private _attachment!: Attachment;

  constructor(name: string, record: AttachedRecord, attachable: unknown) {
    this.name = name;
    this.record = record;
    this.attachable = attachable;
  }

  /** @noRailsEquivalent PERMANENT */
  async unfurl(): Promise<void> {
    this._blob = await this.findOrBuildBlob();
    await this._blob.identifyWithoutSaving();
    this._attachment = await this.findOrBuildAttachment();
  }

  get attachment(): Attachment {
    return this._attachment;
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
    } else if (isPlainHash(attachable)) {
      await this.blob.uploadWithoutUnfurling(fetch<BlobIo>(attachable, "io"));
    } else if (attachable instanceof File) {
      await this.blob.uploadWithoutUnfurling(attachable as unknown as BlobIo);
    } else if (attachable instanceof Pathname) {
      await this.blob.uploadWithoutUnfurling(attachable.open() as BlobIo);
    } else if (!(attachable instanceof Blob) && typeof attachable !== "string") {
      throw new ArgumentError(
        `Could not upload: expected attachable, got ${rbInspect(attachable)}`,
      );
    }
  }

  /** @inventedArm writer — PERMANENT */
  async save(): Promise<void> {
    await (
      this.record.association(`${this.name}Attachment`) as unknown as AssociationWriter
    ).writer(this.attachment);
    await (this.record.association(`${this.name}Blob`) as unknown as AssociationWriter).writer(
      this.blob,
    );
  }

  /** @internal */
  private async findOrBuildAttachment(): Promise<Attachment> {
    return (await this.findAttachment()) || this.buildAttachment();
  }

  /** @internal */
  protected async findAttachment(): Promise<Attachment | null | undefined> {
    const record = this.record as unknown as { [k: string]: unknown };
    if (rbEqual(await record[`${this.name}Blob`], this.blob)) {
      return (await record[`${this.name}Attachment`]) as Attachment | null;
    }
  }

  /** @internal */
  private buildAttachment(): Attachment {
    return new Attachment({ record: this.record, name: this.name, blob: this.blob });
  }

  /** @internal */
  private async findOrBuildBlob(): Promise<Blob> {
    const attachable = this.attachable;
    if (attachable instanceof Blob) {
      return attachable;
    } else if (attachable instanceof UploadedFile) {
      return Blob.buildAfterUnfurling({
        io: attachable.open() as unknown as BlobIo,
        filename: attachable.originalFilename!,
        contentType: attachable.contentType,
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else if (attachable instanceof RackTestUploadedFile) {
      return Blob.buildAfterUnfurling({
        io: (rbObjRespondTo(attachable, "open")
          ? (attachable as unknown as { open(): BlobIo }).open()
          : attachable) as unknown as BlobIo,
        filename: attachable.originalFilename!,
        contentType: attachable.contentType,
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else if (isPlainHash(attachable)) {
      return Blob.buildAfterUnfurling({
        record: this.record,
        serviceName: this.attachmentServiceName(),
        ...(attachable as Parameters<typeof Blob.buildAfterUnfurling>[0]),
      });
    } else if (typeof attachable === "string") {
      return await Blob.findSignedBang(attachable, { record: this.record });
    } else if (attachable instanceof File) {
      return Blob.buildAfterUnfurling({
        io: attachable as unknown as BlobIo,
        filename: File.basename(attachable.path()!),
        record: this.record,
        serviceName: this.attachmentServiceName(),
      });
    } else if (attachable instanceof Pathname) {
      return Blob.buildAfterUnfurling({
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
