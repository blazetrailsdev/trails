import "../constants.gcs-service.generated.js";
import { ApiError, Storage, type Bucket, type File } from "@google-cloud/storage";
import { isPresent } from "@blazetrails/activesupport";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { env as ENV, fetch, type Range } from "@blazetrails/ruby-compat";
import { Error as ActiveStorageError, FileNotFoundError, IntegrityError } from "../errors.js";
import type { Filename } from "../app/models/active-storage/filename.js";
import { Service } from "../service.js";

type UploadableIO = { read(): string | Uint8Array | null };
type GoogleAuth = Storage["authClient"];
type GoogleAuthClass = new (options: object) => GoogleAuth;

export class MetadataServerError extends ActiveStorageError {}
export class MetadataServerNotFoundError extends ActiveStorageError {}

export class GCSService extends Service {
  static MetadataServerError = MetadataServerError;
  static MetadataServerNotFoundError = MetadataServerNotFoundError;

  /** @internal */
  protected config: Record<string, unknown>;
  /** @internal */
  private _bucket: Bucket | undefined;
  /** @internal */
  private _client: Storage | undefined;
  /** @internal */
  private _issuer: string | undefined;
  /** @internal */
  private _iamBucket: Bucket | undefined;

  constructor({ public: public_ = false, ...config }: Record<string, unknown>) {
    super();
    this.config = config;
    this.public = public_ as boolean;
  }

  override async upload(
    key: string,
    io: UploadableIO,
    {
      checksum = null,
      contentType = null,
      disposition = null,
      filename = null,
      customMetadata = {},
    }: {
      checksum?: string | null;
      contentType?: string | null;
      disposition?: string | null;
      filename?: Filename | null;
      customMetadata?: Record<string, string>;
      [k: string]: unknown;
    } = {},
  ): Promise<void> {
    await this.instrument("upload", { key: key, checksum: checksum }, async () => {
      let contentDisposition: string | undefined;
      if (disposition != null && filename != null)
        contentDisposition = this.contentDispositionWith({ type: disposition, filename: filename });
      try {
        await this.bucket()
          .file(key)
          .save(io.read() ?? "", {
            resumable: false,
            validation: false,
            metadata: {
              md5Hash: checksum ?? undefined,
              cacheControl: this.config.cacheControl as string | undefined,
              contentType: contentType ?? undefined,
              contentDisposition: contentDisposition,
              metadata: customMetadata,
            },
          });
      } catch (error) {
        if (error instanceof ApiError && error.code === 400) throw new IntegrityError();
        throw error;
      }
    });
  }

  override async download(key: string): Promise<Uint8Array>;
  override async download(key: string, block: (chunk: Uint8Array) => unknown): Promise<void>;
  override async download(
    key: string,
    block?: (chunk: Uint8Array) => unknown,
  ): Promise<Uint8Array | void>;
  override async download(
    key: string,
    block?: (chunk: Uint8Array) => unknown,
  ): Promise<Uint8Array | void> {
    if (block !== undefined) {
      return await this.instrument("streaming_download", { key: key }, async () => {
        await this.stream(key, block);
      });
    } else {
      return await this.instrument("download", { key: key }, async () => {
        try {
          const [contents] = await (await this.fileFor(key))!.download();
          return new Uint8Array(contents);
        } catch (error) {
          if (error instanceof ApiError && error.code === 404) throw new FileNotFoundError();
          throw error;
        }
      });
    }
  }

  override async updateMetadata(
    key: string,
    {
      contentType,
      disposition = null,
      filename = null,
      customMetadata = {},
    }: {
      contentType: string;
      disposition?: string | null;
      filename?: Filename | null;
      customMetadata?: Record<string, string>;
    },
  ): Promise<void> {
    await this.instrument(
      "update_metadata",
      { key: key, content_type: contentType, disposition: disposition },
      async () => {
        const target = (await this.fileFor(key))!;
        const file: Record<string, unknown> = {};
        file.contentType = contentType;
        if (disposition != null && filename != null)
          file.contentDisposition = this.contentDispositionWith({
            type: disposition,
            filename: filename,
          });
        file.metadata = customMetadata;
        await target.setMetadata(file);
      },
    );
  }

  override async downloadChunk(key: string, range: Range<number>): Promise<Uint8Array> {
    return await this.instrument("download_chunk", { key: key, range: range }, async () => {
      try {
        const [contents] = await (await this.fileFor(key))!.download({
          start: range.begin!,
          ...(range.end == null ? {} : { end: range.excludeEnd ? range.end - 1 : range.end }),
        });
        return new Uint8Array(contents);
      } catch (error) {
        if (error instanceof ApiError && error.code === 404) throw new FileNotFoundError();
        throw error;
      }
    });
  }

  override async delete(key: string): Promise<void> {
    await this.instrument("delete", { key: key }, async () => {
      try {
        await (await this.fileFor(key))!.delete();
      } catch (error) {
        if (!(error instanceof ApiError && error.code === 404)) throw error;
      }
    });
  }

  override async deletePrefixed(prefix: string): Promise<void> {
    await this.instrument("delete_prefixed", { prefix: prefix }, async () => {
      const [files] = await this.bucket().getFiles({ prefix: prefix, autoPaginate: true });
      for (const file of files) {
        try {
          await file.delete();
        } catch (error) {
          if (!(error instanceof ApiError && error.code === 404)) throw error;
        }
      }
    });
  }

  override async isExist(key: string): Promise<boolean> {
    return await this.instrument("exist", { key: key }, async (payload) => {
      const [answer] = await (await this.fileFor(key))!.exists();
      payload.exist = answer;
      return answer;
    });
  }

  override async urlForDirectUpload(
    key: string,
    {
      expiresIn,
      checksum,
      contentLength,
      customMetadata = {},
    }: {
      expiresIn: unknown;
      checksum: string;
      contentLength: number;
      customMetadata?: Record<string, unknown>;
      [k: string]: unknown;
    },
  ): Promise<string> {
    return await this.instrument("url", { key: key }, async (payload) => {
      const args = {
        contentMd5: checksum,
        expires: Date.now() + Number(expiresIn) * 1000,
        extensionHeaders: {
          "x-goog-content-length-range": this.contentLengthRange(contentLength),
          ...this.customMetadataHeaders(customMetadata),
        },
        action: "write" as const,
        version: "v2" as const,
      };

      let bucket = this.bucket();
      if (this.config.iam) {
        bucket = this.iamBucket({ issuer: await this.issuer(), signer: this.signer() });
      }

      const [generatedUrl] = await bucket.file(key).getSignedUrl(args);

      payload.url = generatedUrl;

      return generatedUrl;
    });
  }

  override headersForDirectUpload(
    _key: string,
    {
      checksum,
      contentLength,
      filename = null,
      disposition = null,
      customMetadata = {},
    }: {
      checksum: string;
      contentLength: number;
      filename?: Filename | null;
      disposition?: string | null;
      customMetadata?: Record<string, unknown>;
      [k: string]: unknown;
    },
  ): Record<string, string> {
    let contentDisposition: string | undefined;
    if (filename != null)
      contentDisposition = this.contentDispositionWith({
        type: disposition ?? undefined,
        filename: filename,
      });

    const headers: Record<string, string> = {
      "Content-MD5": checksum,
      "Content-Disposition": contentDisposition!,
      "x-goog-content-length-range": this.contentLengthRange(contentLength),
      ...this.customMetadataHeaders(customMetadata),
    };
    if (isPresent(this.config.cacheControl)) {
      headers["Cache-Control"] = this.config.cacheControl as string;
    }

    return headers;
  }

  override async compose(
    sourceKeys: string[],
    destinationKey: string,
    {
      filename = null,
      contentType = null,
      disposition = null,
      customMetadata = {},
    }: {
      filename?: Filename | null;
      contentType?: string | null;
      disposition?: string | null;
      customMetadata?: Record<string, string>;
    } = {},
  ): Promise<void> {
    const [composed] = await this.bucket().combine(sourceKeys, destinationKey);
    const file: Record<string, unknown> = {};
    file.contentType = contentType;
    if (disposition != null && filename != null)
      file.contentDisposition = this.contentDispositionWith({
        type: disposition,
        filename: filename,
      });
    file.metadata = customMetadata;
    await composed.setMetadata(file);
  }

  /** @internal */
  protected override async privateUrl(
    key: string,
    {
      expiresIn,
      filename,
      contentType,
      disposition,
    }: {
      expiresIn?: unknown;
      filename?: Filename;
      contentType?: string | null;
      disposition?: string;
      [k: string]: unknown;
    },
  ): Promise<string> {
    const args = {
      expires: Date.now() + Number(expiresIn) * 1000,
      queryParams: {
        "response-content-disposition": this.contentDispositionWith({
          type: disposition,
          filename: filename!,
        }),
        ...(contentType == null ? {} : { "response-content-type": contentType }),
      },
      action: "read" as const,
    };

    let file = (await this.fileFor(key))!;
    if (this.config.iam) {
      file = this.iamBucket({ issuer: await this.issuer(), signer: this.signer() }).file(key);
    }

    const [url] = await file.getSignedUrl(args);
    return url;
  }

  /** @internal */
  protected override async publicUrl(key: string): Promise<string> {
    return (await this.fileFor(key))!.publicUrl();
  }

  /**
   * @internal
   * @missingRailsArgs file — PERMANENT
   */
  private async fileFor(key: string, { skipLookup = true } = {}): Promise<File | null> {
    const file = this.bucket().file(key);
    if (skipLookup) return file;
    try {
      await file.getMetadata();
      return file;
    } catch (error) {
      if (error instanceof ApiError && error.code === 404) return null;
      throw error;
    }
  }

  /** @internal */
  private async stream(key: string, block: (chunk: Uint8Array) => unknown): Promise<void> {
    const file = await this.fileFor(key, { skipLookup: false });

    const chunkSize = Numeric.megabytes(5);
    let offset = 0;

    if (file == null) throw new FileNotFoundError();

    while (offset < Number(file.metadata.size)) {
      const [contents] = await file.download({ start: offset, end: offset + chunkSize - 1 });
      await block(new Uint8Array(contents));
      offset += chunkSize;
    }
  }

  /**
   * @internal
   * @missingRailsArgs bucket — PERMANENT
   */
  private bucket(): Bucket {
    return (this._bucket ??= this.client().bucket(fetch<string>(this.config, "bucket")));
  }

  /** @internal */
  private client(): Storage {
    if (this._client === undefined) {
      const { project, ...options } = Object.fromEntries(
        Object.entries(this.config).filter(
          ([key]) => !["bucket", "cacheControl", "iam", "gsaEmail"].includes(key),
        ),
      );
      this._client = new Storage({
        ...options,
        ...(project == null ? {} : { projectId: project as string }),
      });
    }
    return this._client;
  }

  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  private iamBucket({
    issuer,
    signer,
  }: {
    issuer: string;
    signer: (stringToSign: string) => Promise<string>;
  }): Bucket {
    if (this._iamBucket !== undefined) return this._iamBucket;
    const GoogleAuth = this.client().authClient.constructor as new (options: object) => object;
    const IamAuth = class extends GoogleAuth {
      async getCredentials() {
        return { client_email: issuer };
      }

      async sign(stringToSign: string) {
        return await signer(stringToSign);
      }
    };
    return (this._iamBucket = new Storage({
      apiEndpoint: this.client().apiEndpoint,
      projectId: this.client().projectId,
      authClient: new IamAuth({}) as unknown as GoogleAuth,
    }).bucket(fetch<string>(this.config, "bucket")));
  }

  /** @internal */
  private async issuer(): Promise<string> {
    return (this._issuer ??=
      (isPresent(this.config.gsaEmail) ? (this.config.gsaEmail as string) : null) ??
      (await this.emailFromMetadataServer()));
  }

  /** @internal */
  private async emailFromMetadataServer(): Promise<string> {
    const host = ENV["GCE_METADATA_HOST"] ?? "169.254.169.254";
    const lookupMetadata = async (path: string) =>
      await globalThis.fetch(`http://${host}/computeMetadata/v1/${path}`, {
        headers: { "Metadata-Flavor": "Google" },
      });
    let isMetadata: boolean;
    try {
      isMetadata = (await lookupMetadata("")).headers.get("Metadata-Flavor") === "Google";
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      isMetadata = false;
    }
    if (!isMetadata) throw new MetadataServerNotFoundError();

    const response = await lookupMetadata("instance/service-accounts/default/email");
    const email = response.ok ? await response.text() : null;
    if (isPresent(email)) return email!;
    throw new MetadataServerError();
  }

  /**
   * @internal
   * @missingRailsArgs new — PERMANENT
   */
  private signer(): (stringToSign: string) => Promise<string> {
    return async (stringToSign: string) => {
      const GoogleAuth = this.client().authClient.constructor as GoogleAuthClass;
      const scopes = ["https://www.googleapis.com/auth/iam"];
      const iamClient = new GoogleAuth({ scopes: scopes });

      const request = { payload: btoa(stringToSign) };
      const resource = `projects/-/serviceAccounts/${await this.issuer()}`;
      const response = await iamClient.request<{ signedBlob: string }>({
        url: `https://iamcredentials.googleapis.com/v1/${resource}:signBlob`,
        method: "POST",
        data: request,
      });
      return response.data.signedBlob;
    };
  }

  /** @internal */
  protected override customMetadataHeaders(
    metadata: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [`x-goog-meta-${key}`, value as string]),
    );
  }

  /** @internal */
  private contentLengthRange(contentLength: number): string {
    return `${contentLength},${contentLength}`;
  }
}

Service.GCSService = GCSService;
