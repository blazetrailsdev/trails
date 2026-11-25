import { ActionController } from "@blazetrails/actionpack";
import { Concern, extend, isBlank } from "@blazetrails/activesupport";
import { Utils } from "@blazetrails/rack";
import { include, rbStrPlus, SecureRandom, type Range } from "@blazetrails/ruby-compat";
import type { Blob } from "../../../models/active-storage/blob.js";
import type { Filename } from "../../../models/active-storage/filename.js";
import { FileNotFoundError } from "../../../../errors.js";
import { ActiveStorage } from "../../../../active-storage.js";

export const DEFAULT_BLOB_STREAMING_DISPOSITION = "inline";

type StreamingHost = InstanceType<typeof ActionController.Base> & {
  sendStream: OmitThisParameter<(typeof ActionController.Live)["sendStream"]>;
};

/** @internal */
async function sendBlobByteRangeData(
  this: StreamingHost,
  blob: Blob,
  rangeHeader: string,
  { disposition = null }: { disposition?: string | null } = {},
): Promise<unknown> {
  const ranges = Utils.getByteRanges(rangeHeader, blob.byte_size!);

  if (!rangesValid.call(this, ranges)) return this.head(":range_not_satisfiable");
  if (ranges!.length > ActiveStorage.streamingMaxRanges()) {
    return this.head(":range_not_satisfiable");
  }

  let contentType: string;
  let data: Uint8Array;
  if (ranges!.length === 1) {
    const range = ranges![0];
    contentType = (await blob.contentTypeForServing())!;
    data = await blob.downloadChunk(range);

    this.response.headers.set(
      "Content-Range",
      `bytes ${range.begin}-${range.end}/${blob.byte_size}`,
    );
  } else {
    const boundary = SecureRandom.hex();
    contentType = `multipart/byteranges; boundary=${boundary}`;
    data = new Uint8Array();

    for (const range of ranges!.filter((range) => range != null)) {
      const chunk = await blob.downloadChunk(range);

      data = rbStrPlus(data, `\r\n--${boundary}\r\n`) as Uint8Array;
      data = rbStrPlus(
        data,
        `Content-Type: ${await blob.contentTypeForServing()}\r\n`,
      ) as Uint8Array;
      data = rbStrPlus(
        data,
        `Content-Range: bytes ${range.begin}-${range.end}/${blob.byte_size}\r\n\r\n`,
      ) as Uint8Array;
      data = rbStrPlus(data, chunk) as Uint8Array;
    }

    data = rbStrPlus(data, `\r\n--${boundary}--\r\n`) as Uint8Array;
  }

  this.response.headers.set("Accept-Ranges", "bytes");
  this.response.headers.set("Content-Length", data.length.toString());

  return this.sendData(data, {
    disposition:
      (await blob.forcedDispositionForServing()) ??
      disposition ??
      DEFAULT_BLOB_STREAMING_DISPOSITION,
    filename: (await blob.filename).sanitized(),
    status: ":partial_content",
    type: contentType,
  });
}

/** @internal */
function rangesValid(this: StreamingHost, ranges: Range<number>[] | null): boolean {
  if (isBlank(ranges) || ranges!.every((range) => isBlank(range))) return false;

  return (
    ranges!.reduce((sum, range) => sum + (range.end! - range.begin!), 0) <
    ActiveStorage.streamingChunkMaxSize
  );
}

/** @internal */
async function sendBlobStream(
  this: StreamingHost,
  blob: {
    forcedDispositionForServing(): "attachment" | undefined | Promise<"attachment" | undefined>;
    contentTypeForServing(): string | null | Promise<string | null>;
    filename: Filename | Promise<Filename>;
    download(block: (chunk: Uint8Array) => unknown): Promise<unknown>;
  },
  { disposition = null }: { disposition?: string | null } = {},
): Promise<void> {
  await this.sendStream(
    {
      filename: (await blob.filename).sanitized(),
      disposition:
        (await blob.forcedDispositionForServing()) ??
        disposition ??
        DEFAULT_BLOB_STREAMING_DISPOSITION,
      type: await blob.contentTypeForServing(),
    },
    async (stream: ActionController.LiveBuffer) => {
      try {
        await blob.download(async (chunk) => {
          await stream.write(chunk);
        });
      } catch (error) {
        if (error instanceof FileNotFoundError) {
          if (this.response.committed) throw error;

          this.expiresNow();
          await this.head(":not_found");
        } else {
          if (!this.response.committed) {
            this.expiresNow();
            await this.head(":internal_server_error");
          }

          throw error;
        }
      }
    },
  );
}

export const Streaming = {
  DEFAULT_BLOB_STREAMING_DISPOSITION,
  sendBlobByteRangeData,
  rangesValid,
  sendBlobStream,
};
extend(Streaming, Concern);
include(Streaming, ActionController.DataStreaming);
include(Streaming, ActionController.Live);
