import { Marcel } from "@blazetrails/marcel";
import { block as rbBlock, getChildProcess, type Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import type { Blob } from "../blob.js";
import { Previewer } from "../previewer.js";

export class MuPDFPreviewer extends Previewer {
  private static _mutoolExists?: boolean | null;

  static override isAccept(blob: Blob): boolean {
    return (this.isPdf(blob.content_type!) ?? false) && (this.isMutoolExists() ?? false);
  }

  static isPdf(contentType: string): boolean | null {
    return Marcel.Magic.isChild(contentType, "application/pdf");
  }

  static mutoolPath(): string {
    return (ActiveStorage.paths["mutool"] ?? "mutool") as string;
  }

  static isMutoolExists(): boolean | null {
    if (this._mutoolExists !== undefined && this._mutoolExists !== null) return this._mutoolExists;

    const status = getChildProcess().spawnSync(this.mutoolPath(), []).status;

    return (this._mutoolExists = status === 1);
  }

  override async preview(
    options: { [k: string]: unknown } = {},
    block?: (attachable: { [k: string]: unknown }) => unknown,
  ): Promise<unknown> {
    return await this.downloadBlobToTempfile((input) =>
      this.drawFirstPageFrom(
        input,
        rbBlock((output: Tempfile) =>
          block!({
            io: output,
            filename: `${this.blob.filename.base()}.png`,
            contentType: "image/png",
            ...options,
          }),
        ),
      ),
    );
  }

  /** @internal */
  private drawFirstPageFrom(file: Tempfile, block: (output: Tempfile) => unknown) {
    const klass = this.constructor as typeof MuPDFPreviewer;
    return this.draw(klass.mutoolPath(), "draw", "-F", "png", "-o", "-", file.path()!, "1", block);
  }
}
