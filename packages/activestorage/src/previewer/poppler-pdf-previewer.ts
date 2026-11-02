import { Marcel } from "@blazetrails/marcel";
import { block as rbBlock, getChildProcess, type Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import type { Blob } from "../blob.js";
import { Previewer } from "../previewer.js";

export class PopplerPDFPreviewer extends Previewer {
  private static _pdftoppmExists?: boolean | null;

  static override isAccept(blob: Blob): boolean {
    return (this.isPdf(blob.content_type!) ?? false) && (this.isPdftoppmExists() ?? false);
  }

  static isPdf(contentType: string): boolean | null {
    return Marcel.Magic.isChild(contentType, "application/pdf");
  }

  static pdftoppmPath(): string {
    return (ActiveStorage.paths["pdftoppm"] ?? "pdftoppm") as string;
  }

  /** @inventedArm spawnSync — PERMANENT */
  static isPdftoppmExists(): boolean | null {
    if (this._pdftoppmExists !== undefined && this._pdftoppmExists !== null) {
      return this._pdftoppmExists;
    }

    const { status, error } = getChildProcess().spawnSync(this.pdftoppmPath(), ["-v"]);

    return (this._pdftoppmExists = error !== undefined ? null : status === 0);
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
    const klass = this.constructor as typeof PopplerPDFPreviewer;
    return this.draw(
      klass.pdftoppmPath(),
      "-singlefile",
      "-cropbox",
      "-r",
      "72",
      "-png",
      file.path()!,
      block,
    );
  }
}
