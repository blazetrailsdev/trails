import {
  base36,
  classAttribute,
  runLoadHooks,
  type HashWithIndifferentAccess,
} from "@blazetrails/activesupport";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import {
  InvalidForeignKey,
  RecordNotSaved,
  type Base,
  type Relation,
} from "@blazetrails/activerecord";
import { JSON as CodersJSON } from "@blazetrails/activerecord/coders/json";
import type { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { Marcel } from "@blazetrails/marcel";
import {
  ArgumentError,
  b,
  include,
  OpenSSL,
  rbObjRespondTo,
  type Included,
  type Tempfile,
} from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import { Analyzable } from "./blob/analyzable.js";
import { Identifiable } from "./blob/identifiable.js";
import { Representable } from "./blob/representable.js";
import { Servable } from "./blob/servable.js";
import { Filename } from "./filename.js";
import { PurgeJob } from "./purge-job.js";
import { Record } from "./record.js";
import type { Service } from "./service.js";
import type { VariantRecord } from "./variant-record.js";
import type { One } from "./attached/one.js";
import type { Registry } from "./service/registry.js";

interface Io {
  read(length: number, str?: Uint8Array | null): Uint8Array | null;
  rewind(): number;
  size(): number;
}

type UnfurlOptions = {
  key?: string | null;
  io: Io;
  filename: string;
  contentType?: string | null;
  metadata?: { [k: string]: unknown } | null;
  serviceName?: string | null;
  identify?: boolean;
  record?: unknown;
};

const MINIMUM_TOKEN_LENGTH = 28;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Blob
  extends
    Included<typeof Analyzable>,
    Included<typeof Identifiable>,
    Included<typeof Representable>,
    Included<typeof Servable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Blob extends Record {
  static readonly MINIMUM_TOKEN_LENGTH = MINIMUM_TOKEN_LENGTH;

  declare static unattached: () => Relation<Blob>;
  declare static services: Registry;
  declare static _signedIdVerifier: MessageVerifier | undefined;
  declare static service: Service | null | undefined;
  declare services: Registry;

  declare service_name: string | null;
  declare content_type: string | null;
  declare byte_size: number | null;
  declare checksum: string | null;
  declare metadata: HashWithIndifferentAccess;
  declare analyzed: unknown;
  declare identified: unknown;
  declare composed: unknown;
  declare attachments: Relation<Base>;
  declare variantRecords: Relation<VariantRecord>;
  declare previewImage: One;
  declare content_typePreviouslyChanged: () => boolean;
  declare metadataPreviouslyChanged: () => boolean;
  declare service_nameChanged: () => boolean;

  static {
    this.hasSecureToken("key", { length: MINIMUM_TOKEN_LENGTH });
    this.store("metadata", {
      accessors: ["analyzed", "identified", "composed"],
      coder: CodersJSON,
    });

    classAttribute.call(this, "services", { default: {} });
    classAttribute.call(this, "service", { instanceAccessor: false });

    this.hasMany("attachments", { autosave: false });

    this.scope("unattached", function () {
      return this.where().missing(":attachments");
    });

    this.afterInitialize((blob: Blob) => {
      blob.service_name ??= (blob.constructor as typeof Blob).service?.name ?? null;
    });

    this.afterUpdate(":touchAttachments");

    this.afterUpdateCommit(":updateServiceMetadata", {
      if: (blob: Blob) => blob.content_typePreviouslyChanged() || blob.metadataPreviouslyChanged(),
    });

    this.beforeDestroy(
      async (blob: Blob) => {
        if (await blob.attachments.isExists()) throw new InvalidForeignKey();
      },
      { prepend: true },
    );

    this.validates("service_name", { presence: true });
    this.validates("checksum", { presence: true, unless: ":composed" });

    this.validate((blob: Blob) => {
      if (blob.service_nameChanged() && blob.service_name) {
        blob.services.fetch(blob.service_name, () => {
          blob.errors.add("service_name", ":invalid");
        });
      }
    });
  }

  static override async findSigned<T extends typeof Base>(
    this: T,
    id: string,
    { purpose = "blob_id" }: { record?: unknown; purpose?: string } = {},
  ): Promise<InstanceType<T> | null> {
    return super.findSigned.call(this, id, { purpose: purpose }) as Promise<InstanceType<T> | null>;
  }

  static override async findSignedBang<T extends typeof Base>(
    this: T,
    id: string,
    { purpose = "blob_id" }: { record?: unknown; purpose?: string } = {},
  ): Promise<InstanceType<T>> {
    return super.findSignedBang.call(this, id, { purpose: purpose }) as Promise<InstanceType<T>>;
  }

  /** @internal */
  static buildAfterUnfurling({
    key = null,
    io,
    filename,
    contentType = null,
    metadata = null,
    serviceName = null,
    identify = true,
  }: UnfurlOptions): Blob {
    const blob = new this({
      key: key,
      filename: filename,
      content_type: contentType,
      metadata: metadata,
      service_name: serviceName,
    });
    blob.unfurl(io, { identify: identify });
    return blob;
  }

  /** @internal */
  static async createAfterUnfurlingBang({
    key = null,
    io,
    filename,
    contentType = null,
    metadata = null,
    serviceName = null,
    identify = true,
  }: UnfurlOptions): Promise<Blob> {
    const blob = this.buildAfterUnfurling({
      key: key,
      io: io,
      filename: filename,
      contentType: contentType,
      metadata: metadata,
      serviceName: serviceName,
      identify: identify,
    });
    await blob.saveBang();
    return blob;
  }

  static async createAndUploadBang({
    key = null,
    io,
    filename,
    contentType = null,
    metadata = null,
    serviceName = null,
    identify = true,
  }: UnfurlOptions): Promise<Blob> {
    const blob = await this.createAfterUnfurlingBang({
      key: key,
      io: io,
      filename: filename,
      contentType: contentType,
      metadata: metadata,
      serviceName: serviceName,
      identify: identify,
    });
    await blob.uploadWithoutUnfurling(io);
    return blob;
  }

  static async createBeforeDirectUploadBang({
    key = null,
    filename,
    byteSize,
    checksum,
    contentType = null,
    metadata = null,
    serviceName = null,
  }: {
    key?: string | null;
    filename: string;
    byteSize: number;
    checksum: string;
    contentType?: string | null;
    metadata?: { [k: string]: unknown } | null;
    serviceName?: string | null;
    record?: unknown;
  }): Promise<Blob> {
    return await this.createBang({
      key: key,
      filename: filename,
      byte_size: byteSize,
      checksum: checksum,
      content_type: contentType,
      metadata: metadata,
      service_name: serviceName,
    });
  }

  static override generateUniqueSecureToken({
    length = MINIMUM_TOKEN_LENGTH,
  }: { length?: number } = {}): string {
    return base36(length);
  }

  /** @internal */
  static override combineSignedIdPurposes(purpose?: string): string {
    return String(purpose ?? "");
  }

  /** @internal */
  static override get signedIdVerifier() {
    return (this._signedIdVerifier ??= ActiveStorage.verifier);
  }

  static override set signedIdVerifier(verifier) {
    this._signedIdVerifier = verifier;
  }

  /** @internal */
  static scopeForStrictLoading() {
    if (this.strictLoadingByDefault && ActiveStorage.trackVariants) {
      return this.includes({
        variantRecords: { imageAttachment: "blob" },
        previewImageAttachment: { blob: { variantRecords: { imageAttachment: "blob" } } },
      });
    } else {
      return this.all();
    }
  }

  static async compose(
    blobs: Blob[],
    {
      key = null,
      filename,
      contentType = null,
      metadata = null,
    }: {
      key?: string | null;
      filename: string;
      contentType?: string | null;
      metadata?: { [k: string]: unknown } | null;
    },
  ): Promise<Blob> {
    if (blobs.some((blob) => blob.isNewRecord())) {
      throw new RecordNotSaved("All blobs must be persisted.");
    }

    contentType ??= blobs.map((blob) => blob.content_type).filter((x) => x != null)[0] ?? null;

    const combinedBlob = new this({
      key: key,
      filename: filename,
      content_type: contentType,
      metadata: metadata,
      byte_size: blobs.reduce((sum, blob) => sum + blob.byte_size!, 0),
    });
    await combinedBlob.compose(blobs.map((blob) => blob.key));
    await combinedBlob.saveBang();
    return combinedBlob;
  }

  override signedId({
    purpose = "blob_id",
    expiresIn,
    expiresAt,
  }: NonNullable<Parameters<Base["signedId"]>[0]> = {}): string {
    return super.signedId({ purpose: purpose, expiresIn: expiresIn, expiresAt: expiresAt });
  }

  get key(): string {
    let key = this.readAttribute("key") as string | null;
    if (key == null) {
      key = (this.constructor as typeof Blob).generateUniqueSecureToken({
        length: MINIMUM_TOKEN_LENGTH,
      });
      this.writeAttribute("key", key);
    }
    return key;
  }

  set key(value: string | null) {
    this.writeAttribute("key", value);
  }

  get filename(): Filename {
    return new Filename(this.readAttribute("filename") as string);
  }

  set filename(value: string | Filename) {
    this.writeAttribute("filename", value);
  }

  get customMetadata(): { [k: string]: unknown } {
    return (
      ((this.readAttribute("metadata") as HashWithIndifferentAccess).get("custom") as {
        [k: string]: unknown;
      }) ?? {}
    );
  }

  set customMetadata(metadata: { [k: string]: unknown }) {
    this.writeAttribute(
      "metadata",
      (this.readAttribute("metadata") as HashWithIndifferentAccess).merge({ custom: metadata }),
    );
  }

  isImage(): boolean {
    return this.content_type!.startsWith("image");
  }

  isAudio(): boolean {
    return this.content_type!.startsWith("audio");
  }

  isVideo(): boolean {
    return this.content_type!.startsWith("video");
  }

  isText(): boolean {
    return this.content_type!.startsWith("text");
  }

  url({
    expiresIn = ActiveStorage.serviceUrlsExpireIn,
    disposition = "inline",
    filename = null,
    ...options
  }: {
    expiresIn?: unknown;
    disposition?: string;
    filename?: Filename | string | null;
    [k: string]: unknown;
  } = {}): string {
    return this.service.url(this.key, {
      expiresIn: expiresIn,
      filename: Filename.wrap(filename ?? this.filename),
      contentType: this.contentTypeForServing(),
      disposition: this.forcedDispositionForServing() ?? disposition,
      ...options,
    });
  }

  serviceUrlForDirectUpload({
    expiresIn = ActiveStorage.serviceUrlsExpireIn,
  }: { expiresIn?: unknown } = {}): string {
    return this.service.urlForDirectUpload(this.key, {
      expiresIn: expiresIn,
      contentType: this.content_type!,
      contentLength: this.byte_size!,
      checksum: this.checksum!,
      customMetadata: this.customMetadata,
    });
  }

  serviceHeadersForDirectUpload(): { [k: string]: string } {
    return this.service.headersForDirectUpload(this.key, {
      filename: this.filename,
      contentType: this.content_type!,
      contentLength: this.byte_size!,
      checksum: this.checksum!,
      customMetadata: this.customMetadata,
    });
  }

  async upload(io: Io, { identify = true }: { identify?: boolean } = {}): Promise<void> {
    this.unfurl(io, { identify: identify });
    await this.uploadWithoutUnfurling(io);
  }

  /** @internal */
  unfurl(io: Io, { identify = true }: { identify?: boolean } = {}): void {
    this.checksum = this.computeChecksumInChunks(io);
    if (this.content_type == null || identify) this.content_type = this.extractContentType(io);
    this.byte_size = io.size();
    this.identified = true;
  }

  /** @internal */
  async uploadWithoutUnfurling(io: Io): Promise<void> {
    await this.service.upload(this.key, io, { checksum: this.checksum, ...this.serviceMetadata() });
  }

  /** @internal */
  async compose(keys: string[]): Promise<void> {
    this.composed = true;
    await this.service.compose(keys, this.key, this.serviceMetadata());
  }

  async download(): Promise<Uint8Array>;
  async download(block: (chunk: Uint8Array) => unknown): Promise<void>;
  async download(block?: (chunk: Uint8Array) => unknown): Promise<Uint8Array | void> {
    return await this.service.download(this.key, block);
  }

  async downloadChunk(range: Parameters<Service["downloadChunk"]>[1]): Promise<Uint8Array> {
    return await this.service.downloadChunk(this.key, range);
  }

  async open<T>(
    { tmpdir = null }: { tmpdir?: string | null } = {},
    block: (file: Tempfile) => T,
  ): Promise<Awaited<T>> {
    return await this.service.open(
      this.key,
      {
        checksum: this.checksum,
        verify: !this.composed,
        name: [`ActiveStorage-${this.id}-`, this.filename.extensionWithDelimiter()],
        tmpdir: tmpdir,
      },
      block,
    );
  }

  /** @internal */
  async mirrorLater(): Promise<void> {
    if (rbObjRespondTo(this.service, "mirrorLater")) {
      await (
        this.service as Service & { mirrorLater(key: string, options: object): Promise<void> }
      ).mirrorLater(this.key, { checksum: this.checksum });
    }
  }

  override async delete(): Promise<this> {
    await this.service.delete(this.key);
    if (this.isImage()) await this.service.deletePrefixed(`variants/${this.key}/`);
    return this;
  }

  async purge(): Promise<void> {
    try {
      await this.destroy();
      if (this.isPreviouslyPersisted()) await this.delete();
    } catch (error) {
      if (!(error instanceof InvalidForeignKey)) throw error;
    }
  }

  async purgeLater(): Promise<void> {
    await PurgeJob.performLater(this);
  }

  /** @noRailsEquivalent PERMANENT */
  get contentType(): string | null {
    return this.content_type;
  }

  get service(): Service {
    return this.services.fetch(this.service_name!);
  }

  /** @internal */
  private computeChecksumInChunks(io: Io): string {
    if (!rbObjRespondTo(io, "rewind")) throw new ArgumentError("io must be rewindable");

    const checksum = OpenSSL.Digest.MD5.new();
    let readBuffer: Uint8Array | null = b("");
    while ((readBuffer = io.read(Numeric.megabytes(5), readBuffer)) != null) {
      checksum.update(readBuffer);
    }

    io.rewind();
    return checksum.base64digest();
  }

  /** @internal */
  private extractContentType(io: Io): string | null {
    return Marcel.MimeType.for(io, {
      name: this.filename.toString(),
      declaredType: this.content_type,
    });
  }

  /** @internal */
  isWebImage(): boolean {
    return ActiveStorage.webImageContentTypes.includes(this.content_type!);
  }

  /** @internal */
  private serviceMetadata(): { [k: string]: unknown } {
    if (this.forciblyServeAsBinary()) {
      return {
        contentType: ActiveStorage.binaryContentType,
        disposition: "attachment",
        filename: this.filename,
        customMetadata: this.customMetadata,
      };
    } else if (!this.isAllowedInline()) {
      return {
        contentType: this.content_type,
        disposition: "attachment",
        filename: this.filename,
        customMetadata: this.customMetadata,
      };
    } else {
      return { contentType: this.content_type, customMetadata: this.customMetadata };
    }
  }

  /** @internal */
  private async touchAttachments(): Promise<void> {
    const relation = ActiveStorage.touchAttachmentRecords
      ? this.attachments.includes("record")
      : this.attachments;
    for (const attachment of await relation.toArray()) {
      await attachment.touch();
    }
  }

  /** @internal */
  private async updateServiceMetadata(): Promise<void> {
    const serviceMetadata = this.serviceMetadata();
    if (Object.keys(serviceMetadata).length > 0) {
      await this.service.updateMetadata(this.key, serviceMetadata);
    }
  }
}

include(Blob, Analyzable);
include(Blob, Identifiable);
include(Blob, Representable);
include(Blob, Servable);

ActiveStorage.Blob = Blob;

runLoadHooks("active_storage_blob", Blob);
