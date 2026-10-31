import { Notifications } from "@blazetrails/activesupport";
import { Dir, NotImplementedError, type Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "./active-storage.js";
import type { Blob } from "./blob.js";

export class Analyzer {
  readonly blob: Blob;

  static isAccept(_blob: Blob): boolean {
    return false;
  }

  static isAnalyzeLater(): boolean {
    return true;
  }

  constructor(blob: Blob) {
    this.blob = blob;
  }

  async metadata(): Promise<{ [k: string]: unknown }> {
    throw new NotImplementedError();
  }

  /** @internal */
  protected async downloadBlobToTempfile<T>(block: (file: Tempfile) => T): Promise<Awaited<T>> {
    return await this.blob.open({ tmpdir: this.tmpdir }, block);
  }

  /** @internal */
  protected get logger() {
    return ActiveStorage.logger!;
  }

  /** @internal */
  protected get tmpdir(): string {
    return Dir.tmpdir();
  }

  /** @internal */
  protected instrument<T>(analyzer: string, block: () => T): T {
    return Notifications.instrument("analyze.active_storage", { analyzer: analyzer }, block) as T;
  }
}

ActiveStorage.Analyzer = Analyzer;
