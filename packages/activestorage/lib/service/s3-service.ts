import "../constants.s3-service.generated.js";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from "@aws-sdk/client-s3";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import { NotImplementedError, type Range } from "@blazetrails/ruby-compat";
import { FileNotFoundError, IntegrityError } from "../errors.js";
import type { Filename } from "../filename.js";
import { Service } from "../service.js";

const UPLOAD_OPTION_KEYS: Record<string, string> = { acl: "ACL", sseKmsKeyId: "SSEKMSKeyId" };

type UploadableIO = { size(): number; read(): string | Uint8Array | null };

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
        /** @inventedArm throw — CONVERGEABLE activestorage-s3-service-multipart-and-compose */
        throw new NotImplementedError();
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

  /** @internal */
  private async uploadWithSinglePart(
    key: string,
    io: UploadableIO,
    {
      checksum = null,
      contentType = null,
      contentDisposition = undefined,
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
          ...Object.fromEntries(
            Object.entries(this.uploadOptions).map(([k, v]) => [
              UPLOAD_OPTION_KEYS[k] ?? k[0].toUpperCase() + k.slice(1),
              v,
            ]),
          ),
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException && error.name === "BadDigest")
        throw new IntegrityError();
      throw error;
    }
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
}

Service.S3Service = S3Service;
