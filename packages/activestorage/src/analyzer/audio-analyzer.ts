import { compact } from "@blazetrails/activesupport";
import { Errno, File, IO, JSON, kernelFloat, kernelInteger } from "@blazetrails/ruby-compat";
import type { Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Analyzer } from "../analyzer.js";
import type { Blob } from "../blob.js";

type Stream = { [k: string]: unknown };
type Probe = { streams?: Stream[] | null; [k: string]: unknown };

export class AudioAnalyzer extends Analyzer {
  private _audioStream?: Stream;
  private _probe?: Promise<Probe>;

  static override isAccept(blob: Blob): boolean {
    return blob.isAudio();
  }

  override async metadata(): Promise<{ [k: string]: unknown }> {
    return compact({
      duration: await this.duration(),
      bitRate: await this.bitRate(),
      sampleRate: await this.sampleRate(),
      tags: await this.tags(),
    });
  }

  /** @internal */
  protected async duration(): Promise<number | null> {
    const duration = (await this.audioStream())["duration"];
    return duration != null ? kernelFloat(duration) : null;
  }

  /** @internal */
  protected async bitRate(): Promise<number | null> {
    const bitRate = (await this.audioStream())["bit_rate"];
    return bitRate != null ? kernelInteger(bitRate) : null;
  }

  /** @internal */
  protected async sampleRate(): Promise<number | null> {
    const sampleRate = (await this.audioStream())["sample_rate"];
    return sampleRate != null ? kernelInteger(sampleRate) : null;
  }

  /** @internal */
  protected async tags(): Promise<Stream | null> {
    const tags = (await this.audioStream())["tags"];
    return tags != null ? (tags as Stream) : null;
  }

  /** @internal */
  protected async audioStream(): Promise<Stream> {
    return (this._audioStream ??=
      (await this.streams()).find((stream) => stream["codec_type"] === "audio") ?? {});
  }

  /** @internal */
  protected async streams(): Promise<Stream[]> {
    return (await this.probe())["streams"] ?? [];
  }

  /** @internal */
  protected probe(): Promise<Probe> {
    return (this._probe ??= this.downloadBlobToTempfile((file) => this.probeFrom(file)));
  }

  /** @internal */
  protected async probeFrom(file: Tempfile): Promise<Probe> {
    try {
      return await this.instrument(File.basename(this.ffprobePath()), () =>
        IO.popen(
          [
            this.ffprobePath(),
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            "-v",
            "error",
            file.path(),
          ],
          (output) => JSON.parse(new TextDecoder().decode(output.read())) as Probe,
        ),
      );
    } catch (error) {
      if (!(error instanceof Errno.ENOENT)) throw error;
      this.logger.info("Skipping audio analysis because ffprobe isn't installed");
      return {};
    }
  }

  /** @internal */
  protected ffprobePath(): string {
    return (ActiveStorage.paths["ffprobe"] ?? "ffprobe") as string;
  }
}
