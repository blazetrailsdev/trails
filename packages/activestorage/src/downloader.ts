import { OpenSSL, Tempfile, type TempfileBasename } from "@blazetrails/ruby-compat";
import { IntegrityError } from "./errors.js";
import type { Service } from "./service.js";

/** @internal */
export class Downloader {
  readonly service: Service;

  constructor(service: Service) {
    this.service = service;
  }

  async open<T>(
    key: string,
    {
      checksum = null,
      verify = true,
      name = "ActiveStorage-",
      tmpdir = null,
    }: {
      checksum?: string | null;
      verify?: boolean;
      name?: TempfileBasename;
      tmpdir?: string | null;
    },
    block: (file: Tempfile) => T,
  ): Promise<Awaited<T>> {
    return await this.openTempfile(name, tmpdir, async (file) => {
      await this.download(key, file);
      if (verify) await this.verifyIntegrityOf(file, { checksum: checksum });
      return await block(file);
    });
  }

  /** @internal */
  private async openTempfile<T>(
    name: TempfileBasename,
    tmpdir: string | null = null,
    block: (file: Tempfile) => Promise<T>,
  ): Promise<T> {
    const file = Tempfile.open(name, tmpdir ?? undefined);

    try {
      return await block(file);
    } finally {
      file.closeBang();
    }
  }

  /** @internal */
  private async download(key: string, file: Tempfile): Promise<void> {
    file.binmode();
    await this.service.download(key, (chunk) => file.write(chunk));
    file.flush();
    file.rewind();
  }

  /** @internal */
  private async verifyIntegrityOf(
    file: Tempfile,
    { checksum }: { checksum: string | null },
  ): Promise<void> {
    if (!((await OpenSSL.Digest.MD5.file(file.path()!)).base64digest() === checksum)) {
      throw new IntegrityError();
    }
  }
}
