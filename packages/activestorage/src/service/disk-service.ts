import { isBlank, TopLevel, type Duration } from "@blazetrails/activesupport";
import { Numeric } from "@blazetrails/activesupport/core-ext/numeric/bytes";
import {
  ArgumentError,
  Dir,
  Errno,
  File,
  FileUtils,
  IO,
  OpenSSL,
  type Range,
} from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Current } from "../current.js";
import { FileNotFoundError, IntegrityError } from "../errors.js";
import type { Filename } from "../filename.js";
import { Service } from "../service.js";

type UrlHelpers = Record<string, (...args: unknown[]) => string>;

export class DiskService extends Service {
  root: string;
  /** @internal */
  private _urlHelpers: UrlHelpers | undefined;

  constructor({ root, public: public_ = false }: Record<string, unknown>) {
    super();
    this.root = root as string;
    this.public = public_ as boolean;
  }

  override async upload(
    key: string,
    io: { read(): string | Uint8Array },
    { checksum = null }: { checksum?: string | null; [k: string]: unknown } = {},
  ): Promise<void> {
    await this.instrument("upload", { key: key, checksum: checksum }, async () => {
      await IO.copyStreamAsync(io, await this.makePathFor(key));
      if (checksum != null) await this.ensureIntegrityOf(key, checksum);
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
          return (await IO.binreadAsync(this.pathFor(key)))!;
        } catch (error) {
          if (error instanceof Errno.ENOENT) throw new FileNotFoundError();
          throw error;
        }
      });
    }
  }

  override async downloadChunk(key: string, range: Range<number>): Promise<Uint8Array> {
    return await this.instrument("download_chunk", { key: key, range: range }, async () => {
      try {
        return (await IO.binreadAsync(
          this.pathFor(key),
          Number(range.size()),
          range.begin,
        )) as Uint8Array;
      } catch (error) {
        if (error instanceof Errno.ENOENT) throw new FileNotFoundError();
        throw error;
      }
    });
  }

  override async delete(key: string): Promise<void> {
    await this.instrument("delete", { key: key }, async () => {
      try {
        await File.deleteAsync(this.pathFor(key));
      } catch (error) {
        if (!(error instanceof Errno.ENOENT)) throw error;
      }
    });
  }

  override async deletePrefixed(prefix: string): Promise<void> {
    await this.instrument("delete_prefixed", { prefix: prefix }, async () => {
      for (const path of await Dir.globAsync(this.pathFor(`${prefix}*`))) {
        await FileUtils.rmRfAsync(path);
      }
    });
  }

  override async isExist(key: string): Promise<boolean> {
    return await this.instrument("exist", { key: key }, async (payload) => {
      const answer = await File.isExistAsync(this.pathFor(key));
      payload.exist = answer;
      return answer;
    });
  }

  override urlForDirectUpload(
    key: string,
    {
      expiresIn,
      contentType,
      contentLength,
      checksum,
    }: {
      expiresIn: unknown;
      contentType: string;
      contentLength: number;
      checksum: string;
      customMetadata?: Record<string, unknown>;
    },
  ): string {
    return this.instrument("url", { key: key }, (payload) => {
      const verifiedTokenWithExpiration = ActiveStorage.verifier.generate(
        {
          key: key,
          content_type: contentType,
          content_length: contentLength,
          checksum: checksum,
          service_name: this.name,
        },
        { expiresIn: expiresIn as Duration | null, purpose: "blob_token" },
      );

      const generatedUrl = this.urlHelpers().updateRailsDiskServiceUrl(
        verifiedTokenWithExpiration,
        this.urlOptions(),
      );
      payload.url = generatedUrl;
      return generatedUrl;
    });
  }

  override headersForDirectUpload(
    _key: string,
    { contentType }: { contentType: string; [k: string]: unknown },
  ): Record<string, string> {
    return { "Content-Type": contentType };
  }

  /** @internal */
  pathFor(key: string): string {
    return File.join(this.root, this.folderFor(key), key);
  }

  override async compose(
    sourceKeys: string[],
    destinationKey: string,
    _options: Record<string, unknown> = {},
  ): Promise<void> {
    const destinationFile = await this.makePathFor(destinationKey);
    await File.writeAsync(destinationFile, "");
    for (const sourceKey of sourceKeys) {
      const sourceFile = (await IO.binreadAsync(this.pathFor(sourceKey)))!;
      await File.writeAsync(destinationFile, sourceFile, { mode: "a" });
    }
  }

  /** @internal */
  protected override privateUrl(
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
  ): string {
    return this.generateUrl(key, {
      expiresIn: expiresIn,
      filename: filename!,
      contentType: contentType ?? null,
      disposition: disposition,
    });
  }

  /** @internal */
  protected override publicUrl(
    key: string,
    {
      filename,
      contentType = null,
      disposition = "attachment",
    }: {
      filename?: Filename;
      contentType?: string | null;
      disposition?: string;
      [k: string]: unknown;
    } = {},
  ): string {
    return this.generateUrl(key, {
      expiresIn: null,
      filename: filename!,
      contentType: contentType,
      disposition: disposition,
    });
  }

  /** @internal */
  private generateUrl(
    key: string,
    {
      expiresIn,
      filename,
      contentType,
      disposition,
    }: {
      expiresIn: unknown;
      filename: Filename;
      contentType: string | null;
      disposition: string | undefined;
    },
  ): string {
    const contentDisposition = this.contentDispositionWith({
      type: disposition,
      filename: filename,
    });
    const verifiedKeyWithExpiration = ActiveStorage.verifier.generate(
      {
        key: key,
        disposition: contentDisposition,
        content_type: contentType,
        service_name: this.name,
      },
      { expiresIn: expiresIn as Duration | null, purpose: "blob_key" },
    );

    if (isBlank(this.urlOptions())) {
      throw new ArgumentError(
        `Cannot generate URL for ${filename} using Disk service, please set ActiveStorage::Current.url_options.`,
      );
    }

    return this.urlHelpers().railsDiskServiceUrl(verifiedKeyWithExpiration, {
      filename: filename,
      ...this.urlOptions(),
    });
  }

  /** @internal */
  private async stream(key: string, block: (chunk: Uint8Array) => unknown): Promise<void> {
    try {
      const path = this.pathFor(key);
      let offset = 0;
      let data: Uint8Array | null;
      while ((data = await IO.binreadAsync(path, Numeric.megabytes(5), offset)) != null) {
        offset += data.length;
        await block(data);
      }
    } catch (error) {
      if (error instanceof Errno.ENOENT) throw new FileNotFoundError();
      throw error;
    }
  }

  /** @internal */
  private folderFor(key: string): string {
    return [key.slice(0, 2), key.slice(2, 4)].join("/");
  }

  /** @internal */
  private async makePathFor(key: string): Promise<string> {
    const path = this.pathFor(key);
    await FileUtils.mkdirPAsync(File.dirname(path));
    return path;
  }

  /** @internal */
  private async ensureIntegrityOf(key: string, checksum: string): Promise<void> {
    if ((await OpenSSL.Digest.MD5.file(this.pathFor(key))).base64digest() !== checksum) {
      await this.delete(key);
      throw new IntegrityError();
    }
  }

  /** @internal */
  private urlHelpers(): UrlHelpers {
    return (this._urlHelpers ??= TopLevel.Trails!.application!.routes().urlHelpers() as UrlHelpers);
  }

  /** @internal */
  private urlOptions(): Record<string, unknown> | null {
    return Current.urlOptions;
  }
}
