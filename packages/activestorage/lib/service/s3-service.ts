import "../constants.s3-service.generated.js";
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import type { Range } from "@blazetrails/ruby-compat";
import { FileNotFoundError, IntegrityError } from "../errors.js";
import type { Filename } from "../app/models/active-storage/filename.js";
import { Service } from "../service.js";

const UPLOAD_OPTION_KEYS: Record<string, string> = { acl: "ACL", sseKmsKeyId: "SSEKMSKeyId" };

type UploadableIO = { size(): number; read(length?: number): string | Uint8Array | null };

const MAXIMUM_UPLOAD_PARTS_COUNT = 10000;
const MINIMUM_UPLOAD_PART_SIZE = Numeric.megabytes(5);

export class S3Service extends Service {
  readonly client: S3Client;
  readonly bucket: string;
  readonly multipartUploadThreshold: number;
  readonly uploadOptions: Record<string, unknown>;

  constructor({
    bucket,
    upload = {},
    public: public_ = false,
    ...options
  }: Record<string, unknown>) {
    super();
    const { accessKeyId, secretAccessKey, region, endpoint, forcePathStyle, ...rest } = options;
    this.client = new S3Client({
      ...rest,
      ...(accessKeyId == null
        ? {}
        : {
            credentials: {
              accessKeyId: accessKeyId as string,
              secretAccessKey: secretAccessKey as string,
            },
          }),
      ...(region == null ? {} : { region: region as string }),
      ...(endpoint == null ? {} : { endpoint: endpoint as string }),
      ...(forcePathStyle == null ? {} : { forcePathStyle: forcePathStyle as boolean }),
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
    this.bucket = bucket as string;

    const uploadOptions = { ...(upload as Record<string, unknown>) };
    const multipartThreshold = uploadOptions.multipartThreshold;
    delete uploadOptions.multipartThreshold;
    this.multipartUploadThreshold =
      multipartThreshold != null ? (multipartThreshold as number) : Numeric.megabytes(100);
    this.public = public_ as boolean;

    this.uploadOptions = uploadOptions;
    if (this.isPublic()) this.uploadOptions.acl = "public-read";
  }

  override async upload(
    key: string,
    io: UploadableIO,
    {
      checksum = null,
      filename = null,
      contentType = null,
      disposition = null,
      customMetadata = {},
    }: {
      checksum?: string | null;
      filename?: Filename | null;
      contentType?: string | null;
      disposition?: string | null;
      customMetadata?: Record<string, string>;
      [k: string]: unknown;
    } = {},
  ): Promise<void> {
    await this.instrument("upload", { key: key, checksum: checksum }, async () => {
      let contentDisposition: string | undefined;
      if (disposition != null && filename != null)
        contentDisposition = this.contentDispositionWith({
          filename: filename,
          type: disposition,
        });

      if (io.size() < this.multipartUploadThreshold) {
        await this.uploadWithSinglePart(key, io, {
          checksum: checksum,
          contentType: contentType,
          contentDisposition: contentDisposition,
          customMetadata: customMetadata,
        });
      } else {
        await this.uploadWithMultipart(key, io, {
          contentType: contentType,
          contentDisposition: contentDisposition,
          customMetadata: customMetadata,
        });
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
          const object = await this.client.send(new GetObjectCommand(this.objectFor(key)));
          return await object.Body!.transformToByteArray();
        } catch (error) {
          if (error instanceof NoSuchKey) throw new FileNotFoundError();
          throw error;
        }
      });
    }
  }

  override async downloadChunk(key: string, range: Range<number>): Promise<Uint8Array> {
    return await this.instrument("download_chunk", { key: key, range: range }, async () => {
      try {
        const object = await this.client.send(
          new GetObjectCommand({
            ...this.objectFor(key),
            Range: `bytes=${range.begin}-${range.end == null ? "" : range.excludeEnd ? range.end - 1 : range.end}`,
          }),
        );
        return await object.Body!.transformToByteArray();
      } catch (error) {
        if (error instanceof NoSuchKey) throw new FileNotFoundError();
        throw error;
      }
    });
  }

  override async delete(key: string): Promise<void> {
    await this.instrument("delete", { key: key }, async () => {
      await this.client.send(new DeleteObjectCommand(this.objectFor(key)));
    });
  }

  override async deletePrefixed(prefix: string): Promise<void> {
    await this.instrument("delete_prefixed", { prefix: prefix }, async () => {
      let continuationToken: string | undefined;
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
          }),
        );
        if (page.Contents?.length) {
          const { Errors } = await this.client.send(
            new DeleteObjectsCommand({
              Bucket: this.bucket,
              Delete: { Objects: page.Contents.map((object) => ({ Key: object.Key })) },
            }),
          );
          if (Errors?.length)
            throw new S3ServiceException({
              name: Errors[0].Code!,
              $fault: "server",
              $metadata: {},
              message: Errors[0].Message,
            });
        }
        continuationToken = page.NextContinuationToken;
      } while (continuationToken != null);
    });
  }

  override async isExist(key: string): Promise<boolean> {
    return await this.instrument("exist", { key: key }, async (payload) => {
      let answer: boolean;
      try {
        await this.client.send(new HeadObjectCommand(this.objectFor(key)));
        answer = true;
      } catch (error) {
        if (!(error instanceof NotFound)) throw error;
        answer = false;
      }
      payload.exist = answer;
      return answer;
    });
  }

  override async urlForDirectUpload(
    key: string,
    {
      expiresIn,
      contentType,
      contentLength,
      checksum,
      customMetadata = {},
    }: {
      expiresIn: unknown;
      contentType: string;
      contentLength: number;
      checksum: string;
      customMetadata?: Record<string, unknown>;
    },
  ): Promise<string> {
    return await this.instrument("url", { key: key }, async (payload) => {
      const generatedUrl = await getSignedUrl(
        this.client,
        new PutObjectCommand({
          ...this.objectFor(key),
          ContentType: contentType,
          ContentLength: contentLength,
          ContentMD5: checksum,
          Metadata: customMetadata as Record<string, string>,
          ...this.uploadParams(this.uploadOptions),
        }),
        {
          expiresIn: Math.trunc(Number(expiresIn)),
          signableHeaders: new Set(["content-length"]),
        },
      );

      payload.url = generatedUrl;

      return generatedUrl;
    });
  }

  override headersForDirectUpload(
    _key: string,
    {
      contentType,
      checksum,
      filename = null,
      disposition = null,
      customMetadata = {},
    }: {
      contentType: string;
      checksum: string;
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

    return {
      "Content-Type": contentType,
      "Content-MD5": checksum,
      "Content-Disposition": contentDisposition!,
      ...this.customMetadataHeaders(customMetadata),
    };
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
      customMetadata?: Record<string, unknown>;
    } = {},
  ): Promise<void> {
    let contentDisposition: string | undefined;
    if (disposition != null && filename != null)
      contentDisposition = this.contentDispositionWith({ type: disposition, filename: filename });

    await this.uploadStream(
      {
        key: destinationKey,
        contentType: contentType,
        contentDisposition: contentDisposition,
        partSize: MINIMUM_UPLOAD_PART_SIZE,
        metadata: customMetadata as Record<string, string>,
        ...this.uploadOptions,
      },
      async (out) => {
        for (const sourceKey of sourceKeys) {
          await this.stream(sourceKey, async (chunk) => {
            await out.write(chunk);
          });
        }
      },
    );
  }

  /** @internal */
  private async uploadStream(
    {
      key,
      contentType = null,
      contentDisposition,
      partSize,
      metadata = {},
      ...options
    }: {
      key: string;
      contentType?: string | null;
      contentDisposition?: string;
      partSize: number;
      metadata?: Record<string, string>;
      [k: string]: unknown;
    },
    block: (out: WritableStreamDefaultWriter<Uint8Array>) => Promise<void>,
  ): Promise<void> {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const upload = new Upload({
      client: this.client,
      partSize: partSize,
      params: {
        ...this.objectFor(key),
        Body: readable,
        ContentType: contentType ?? undefined,
        ContentDisposition: contentDisposition,
        Metadata: metadata,
        ...this.uploadParams(options),
      },
    });
    const out = writable.getWriter();
    const [written, uploaded] = await Promise.allSettled([
      (async () => {
        try {
          await block(out);
          await out.close();
        } catch (error) {
          await out.abort(error);
          throw error;
        }
      })(),
      (async () => {
        try {
          await upload.done();
        } catch (error) {
          await out.abort(error);
          throw error;
        }
      })(),
    ]);
    if (written.status === "rejected") throw written.reason;
    if (uploaded.status === "rejected") throw uploaded.reason;
  }

  /** @internal */
  protected override async privateUrl(
    key: string,
    {
      expiresIn,
      filename,
      disposition,
      contentType,
    }: {
      expiresIn?: unknown;
      filename?: Filename;
      disposition?: string;
      contentType?: string | null;
      [k: string]: unknown;
    },
  ): Promise<string> {
    return await getSignedUrl(
      this.client,
      new GetObjectCommand({
        ...this.objectFor(key),
        ResponseContentDisposition: this.contentDispositionWith({
          type: disposition,
          filename: filename!,
        }),
        ResponseContentType: contentType ?? undefined,
      }),
      { expiresIn: Math.trunc(Number(expiresIn)) },
    );
  }

  /**
   * @internal
   * @missingRailsCall object_for — PERMANENT
   */
  protected override async publicUrl(
    key: string,
    { virtualHost = false }: { virtualHost?: boolean; [k: string]: unknown } = {},
  ): Promise<string> {
    const path = key.split("/").map(encodeURIComponent).join("/");
    if (virtualHost) return `https://${this.bucket}/${path}`;
    if (this.client.config.endpoint === undefined) {
      const region = await this.client.config.region();
      return this.client.config.forcePathStyle || this.bucket.includes(".")
        ? `https://s3.${region}.amazonaws.com/${this.bucket}/${path}`
        : `https://${this.bucket}.s3.${region}.amazonaws.com/${path}`;
    }
    const endpoint = await this.client.config.endpoint();
    const port = endpoint.port == null ? "" : `:${endpoint.port}`;
    const base = `${endpoint.protocol}//${endpoint.hostname}${port}${endpoint.path.endsWith("/") ? endpoint.path.slice(0, -1) : endpoint.path}`;
    return this.client.config.forcePathStyle
      ? `${base}/${this.bucket}/${path}`
      : `${endpoint.protocol}//${this.bucket}.${endpoint.hostname}${port}/${path}`;
  }

  /** @internal */
  private async uploadWithSinglePart(
    key: string,
    io: UploadableIO,
    {
      checksum = null,
      contentType = null,
      contentDisposition,
      customMetadata = {},
    }: {
      checksum?: string | null;
      contentType?: string | null;
      contentDisposition?: string;
      customMetadata?: Record<string, string>;
    } = {},
  ): Promise<void> {
    try {
      const body = io.read() ?? "";
      await this.client.send(
        new PutObjectCommand({
          ...this.objectFor(key),
          Body: body,
          ContentLength:
            typeof body === "string" ? new TextEncoder().encode(body).length : body.length,
          ContentMD5: checksum ?? undefined,
          ContentType: contentType ?? undefined,
          ContentDisposition: contentDisposition,
          Metadata: customMetadata,
          ...this.uploadParams(this.uploadOptions),
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === "BadDigest")
        throw new IntegrityError();
      throw error;
    }
  }

  /** @internal */
  private async uploadWithMultipart(
    key: string,
    io: UploadableIO,
    {
      contentType = null,
      contentDisposition,
      customMetadata = {},
    }: {
      contentType?: string | null;
      contentDisposition?: string;
      customMetadata?: Record<string, string>;
    } = {},
  ): Promise<void> {
    const partSize = Math.max(
      Math.ceil(io.size() / MAXIMUM_UPLOAD_PARTS_COUNT),
      MINIMUM_UPLOAD_PART_SIZE,
    );

    await this.uploadStream(
      {
        key: key,
        contentType: contentType,
        contentDisposition: contentDisposition,
        partSize: partSize,
        metadata: customMetadata,
        ...this.uploadOptions,
      },
      async (out) => {
        let chunk: string | Uint8Array | null;
        while ((chunk = io.read(Numeric.kilobytes(16))) != null && chunk.length > 0)
          await out.write(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
      },
    );
  }

  /** @noRailsEquivalent PERMANENT */
  private uploadParams(options: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(options).map(([k, v]) => [
        UPLOAD_OPTION_KEYS[k] ?? k[0].toUpperCase() + k.slice(1),
        v,
      ]),
    );
  }

  /** @internal */
  private objectFor(key: string): { Bucket: string; Key: string } {
    return { Bucket: this.bucket, Key: key };
  }

  /** @internal */
  private async stream(key: string, block: (chunk: Uint8Array) => unknown): Promise<void> {
    const object = this.objectFor(key);

    const chunkSize = Numeric.megabytes(5);
    let offset = 0;

    let contentLength: number;
    try {
      contentLength = (await this.client.send(new HeadObjectCommand(object))).ContentLength!;
    } catch (error) {
      if (error instanceof NotFound) throw new FileNotFoundError();
      throw error;
    }

    while (offset < contentLength) {
      const chunk = await this.client.send(
        new GetObjectCommand({ ...object, Range: `bytes=${offset}-${offset + chunkSize - 1}` }),
      );
      await block(await chunk.Body!.transformToByteArray());
      offset += chunkSize;
    }
  }

  /** @internal */
  protected override customMetadataHeaders(
    metadata: Record<string, unknown>,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(metadata).map(([key, value]) => [`x-amz-meta-${key}`, value as string]),
    );
  }
}

Service.S3Service = S3Service;
