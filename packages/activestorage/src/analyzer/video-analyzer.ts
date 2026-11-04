import { compact, isPresent } from "@blazetrails/activesupport";
import { find } from "@blazetrails/ruby-compat/enumerable";
import {
  Errno,
  File,
  Hash,
  IO,
  JSON,
  kernelFloat,
  kernelInteger,
  stringSplit,
} from "@blazetrails/ruby-compat";
import type { Tempfile } from "@blazetrails/ruby-compat";
import { ActiveStorage } from "../active-storage.js";
import { Analyzer } from "../analyzer.js";
import type { Blob } from "../blob.js";

type Stream = { [k: string]: unknown };
type Probe = { streams?: Stream[] | null; format?: Stream | null; [k: string]: unknown };

export class VideoAnalyzer extends Analyzer {
  private _encodedWidth?: number;
  private _encodedHeight?: number;
  private _displayHeightScale?: number;
  private _tags?: Stream;
  private _sideData?: Stream[] | Hash<string, Stream>;
  private _videoStream?: Stream;
  private _audioStream?: Stream;
  private _probe?: Promise<Probe>;

  static override isAccept(blob: Blob): boolean {
    return blob.isVideo();
  }

  override async metadata(): Promise<{ [k: string]: unknown }> {
    return compact({
      width: await this.width(),
      height: await this.height(),
      duration: await this.duration(),
      angle: await this.angle(),
      displayAspectRatio: await this.displayAspectRatio(),
      audio: await this.isAudio(),
      video: await this.isVideo(),
    });
  }

  /** @internal */
  protected async width(): Promise<number | null> {
    if (await this.isRotated()) {
      return (await this.computedHeight()) ?? (await this.encodedHeight());
    } else {
      return await this.encodedWidth();
    }
  }

  /** @internal */
  protected async height(): Promise<number | null> {
    if (await this.isRotated()) {
      return await this.encodedWidth();
    } else {
      return (await this.computedHeight()) ?? (await this.encodedHeight());
    }
  }

  /** @internal */
  protected async duration(): Promise<number | null> {
    const duration = (await this.videoStream())["duration"] ?? (await this.container())["duration"];
    return duration != null ? kernelFloat(duration) : null;
  }

  /** @internal */
  protected async angle(): Promise<number | null> {
    const tags = await this.tags();
    if (tags["rotate"] != null) {
      return kernelInteger(tags["rotate"]);
    } else if (
      (await this.displayMatrix()) != null &&
      (await this.displayMatrix())!["rotation"] != null
    ) {
      return kernelInteger((await this.displayMatrix())!["rotation"]);
    }
    return null;
  }

  /** @internal */
  protected async displayMatrix(): Promise<Stream | null> {
    return find(
      (await this.sideData()) as Iterable<Stream>,
      (data: Stream) => data["side_data_type"] === "Display Matrix",
    ) as Stream | null;
  }

  /** @internal */
  protected async displayAspectRatio(): Promise<[number, number] | null> {
    const descriptor = (await this.videoStream())["display_aspect_ratio"] as string | undefined;
    if (descriptor != null) {
      const terms = stringSplit(descriptor, ":", 2);
      if (terms != null) {
        const numerator = kernelInteger(terms[0]);
        const denominator = kernelInteger(terms[1]);

        if (numerator !== 0) return [numerator, denominator];
      }
    }
    return null;
  }

  /** @internal */
  protected async isRotated(): Promise<boolean> {
    const angle = await this.angle();
    return angle === 90 || angle === 270 || angle === -90 || angle === -270;
  }

  /** @internal */
  protected async isAudio(): Promise<boolean> {
    return isPresent(await this.audioStream());
  }

  /** @internal */
  protected async isVideo(): Promise<boolean> {
    return isPresent(await this.videoStream());
  }

  /** @internal */
  protected async computedHeight(): Promise<number | null> {
    if ((await this.encodedWidth()) != null && (await this.displayHeightScale()) != null) {
      return (await this.encodedWidth())! * (await this.displayHeightScale())!;
    }
    return null;
  }

  /** @internal */
  protected async encodedWidth(): Promise<number | null> {
    const videoStream = await this.videoStream();
    if (videoStream["width"] == null) return null;
    return (this._encodedWidth ??= kernelFloat(videoStream["width"]));
  }

  /** @internal */
  protected async encodedHeight(): Promise<number | null> {
    const videoStream = await this.videoStream();
    if (videoStream["height"] == null) return null;
    return (this._encodedHeight ??= kernelFloat(videoStream["height"]));
  }

  /** @internal */
  protected async displayHeightScale(): Promise<number | null> {
    const displayAspectRatio = await this.displayAspectRatio();
    if (displayAspectRatio == null) return null;
    return (this._displayHeightScale ??=
      kernelFloat(displayAspectRatio[1]) / displayAspectRatio[0]);
  }

  /** @internal */
  protected async tags(): Promise<Stream> {
    return (this._tags ??= ((await this.videoStream())["tags"] as Stream | undefined) ?? {});
  }

  /** @internal */
  protected async sideData(): Promise<Stream[] | Hash<string, Stream>> {
    return (this._sideData ??=
      ((await this.videoStream())["side_data_list"] as Stream[] | undefined) ??
      new Hash<string, Stream>());
  }

  /** @internal */
  protected async videoStream(): Promise<Stream> {
    return (this._videoStream ??=
      (await this.streams()).find((stream) => stream["codec_type"] === "video") ?? {});
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
  protected async container(): Promise<Stream> {
    return (await this.probe())["format"] ?? {};
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
      this.logger.info("Skipping video analysis because ffprobe isn't installed");
      return {};
    }
  }

  /** @internal */
  protected ffprobePath(): string {
    return (ActiveStorage.paths["ffprobe"] ?? "ffprobe") as string;
  }
}
