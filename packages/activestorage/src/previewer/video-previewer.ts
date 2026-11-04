import {
  block as rbBlock,
  getChildProcess,
  Shellwords,
  type Tempfile,
} from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import type { Blob } from "../blob.js";
import { Previewer } from "../previewer.js";

export class VideoPreviewer extends Previewer {
  private static _ffmpegExists?: boolean | null;

  static override isAccept(blob: Blob): boolean {
    return blob.isVideo() && (this.isFfmpegExists() ?? false);
  }

  /** @inventedArm spawnSync — PERMANENT */
  static isFfmpegExists(): boolean | null {
    if (this._ffmpegExists !== undefined && this._ffmpegExists !== null) return this._ffmpegExists;

    const { status, error } = getChildProcess().spawnSync(this.ffmpegPath(), ["-version"]);

    return (this._ffmpegExists = error !== undefined ? null : status === 0);
  }

  static ffmpegPath(): string {
    return (ActiveStorage.paths["ffmpeg"] ?? "ffmpeg") as string;
  }

  override async preview(
    options: { [k: string]: unknown } = {},
    block?: (attachable: { [k: string]: unknown }) => unknown,
  ): Promise<unknown> {
    return await this.downloadBlobToTempfile((input) =>
      this.drawRelevantFrameFrom(
        input,
        rbBlock((output: Tempfile) =>
          block!({
            io: output,
            filename: `${this.blob.filename.base()}.jpg`,
            contentType: "image/jpeg",
            ...options,
          }),
        ),
      ),
    );
  }

  /** @internal */
  private drawRelevantFrameFrom(file: Tempfile, block: (output: Tempfile) => unknown) {
    return this.draw(
      (this.constructor as typeof VideoPreviewer).ffmpegPath(),
      "-i",
      file.path()!,
      ...Shellwords.shellwords(ActiveStorage.videoPreviewArguments),
      "-",
      block,
    );
  }
}
