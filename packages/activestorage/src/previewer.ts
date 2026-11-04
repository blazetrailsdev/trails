import { Notifications, type EventPayload } from "@blazetrails/activesupport";
import {
  chomp,
  Dir,
  IO,
  NotImplementedError,
  Process,
  rbBlockGivenP,
  rbModName,
  Tempfile,
} from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import type { Blob } from "./blob.js";
import { PreviewError } from "./errors.js";

export class Previewer {
  readonly blob: Blob;

  static isAccept(_blob: Blob): boolean {
    return false;
  }

  constructor(blob: Blob) {
    this.blob = blob;
  }

  async preview(
    _options: { [k: string]: unknown } = {},
    _block?: (attachable: { [k: string]: unknown }) => unknown,
  ): Promise<unknown> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async downloadBlobToTempfile<T>(block: (file: Tempfile) => T): Promise<Awaited<T>> {
    return await this.blob.open({ tmpdir: this.tmpdir }, block);
  }

  /** @internal */
  protected async draw<T>(
    ...argv: [...string[], (file: Tempfile) => T]
  ): Promise<Awaited<T> | undefined> {
    const block = rbBlockGivenP(argv.at(-1)) ? (argv.pop() as (file: Tempfile) => T) : undefined;
    return await this.openTempfile(async (file) => {
      await this.instrument("preview", { key: this.blob.key }, () =>
        this.capture(...(argv as string[]), { to: file }),
      );

      return await block!(file);
    });
  }

  /** @internal */
  protected async openTempfile<T>(block: (tempfile: Tempfile) => T): Promise<Awaited<T>> {
    const tempfile = Tempfile.open("ActiveStorage-", this.tmpdir);

    try {
      return await block(tempfile);
    } finally {
      tempfile.closeBang();
    }
  }

  /** @internal */
  protected instrument<T>(operation: string, payload: EventPayload = {}, block: () => T): T {
    return Notifications.instrument(
      `${operation}.active_storage`,
      { ...payload, service: this.serviceName() },
      block,
    ) as T;
  }

  /** @internal */
  protected serviceName(): string {
    return rbModName(this.blob.service.constructor)!.split("::")[2].replaceAll("Service", "");
  }

  /** @internal */
  protected async capture(...argv: [...string[], { to: Tempfile }]): Promise<void> {
    const { to } = argv.pop() as { to: Tempfile };
    to.binmode();

    await this.openTempfile(async (err) => {
      await IO.popen(argv, { err: err as unknown as IO }, (out) => IO.copyStream(out, to));
      err.rewind();

      if (!Process.lastStatus!.isSuccess()) {
        throw new PreviewError(
          `${argv[0]} failed (status ${Process.lastStatus!.exitstatus()}): ${chomp(String(err.read() ?? ""))}`,
        );
      }
    });

    to.rewind();
  }

  /** @internal */
  protected get logger() {
    return ActiveStorage.logger!;
  }

  /** @internal */
  protected get tmpdir(): string {
    return Dir.tmpdir();
  }
}

ActiveStorage.Previewer = Previewer;
