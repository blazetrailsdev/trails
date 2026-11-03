import { ActionController } from "@blazetrails/actionpack";
import { Concern, extend, isBlank } from "@blazetrails/activesupport";
import { Utils } from "@blazetrails/rack";
import { include, Range, rbStrPlus, SecureRandom } from "@blazetrails/ruby-compat";
import type { Blob } from "./blob.js";
import { FileNotFoundError } from "./errors.js";

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

  if (isBlank(ranges) || ranges!.every((range) => isBlank(range))) {
    return this.head("range_not_satisfiable");
  }

  let contentType: string;
  let data: Uint8Array;
  if (ranges!.length === 1) {
    const range = ranges![0];
    contentType = blob.contentTypeForServing()!;
    data = await blob.downloadChunk(new Range(range[0], range[1]));

    this.response.headers.set("Content-Range", `bytes ${range[0]}-${range[1]}/${blob.byte_size}`);
  } else {
    const boundary = SecureRandom.hex();
    contentType = `multipart/byteranges; boundary=${boundary}`;
    data = new Uint8Array();

    for (const range of ranges!.filter((range) => range != null)) {
      const chunk = await blob.downloadChunk(new Range(range[0], range[1]));

      data = rbStrPlus(data, `\r\n--${boundary}\r\n`) as Uint8Array;
      data = rbStrPlus(data, `Content-Type: ${blob.contentTypeForServing()}\r\n`) as Uint8Array;
      data = rbStrPlus(
        data,
        `Content-Range: bytes ${range[0]}-${range[1]}/${blob.byte_size}\r\n\r\n`,
      ) as Uint8Array;
      data = rbStrPlus(data, chunk) as Uint8Array;
    }

    data = rbStrPlus(data, `\r\n--${boundary}--\r\n`) as Uint8Array;
  }

  this.response.headers.set("Accept-Ranges", "bytes");
  this.response.headers.set("Content-Length", data.length.toString());

  return this.sendData(
    data as never,
    {
      disposition:
        blob.forcedDispositionForServing() ?? disposition ?? DEFAULT_BLOB_STREAMING_DISPOSITION,
      filename: blob.filename.sanitized(),
      status: "partial_content",
      type: contentType,
    } as never,
  );
}

/** @internal */
async function sendBlobStream(
  this: StreamingHost,
  blob: Blob,
  { disposition = null }: { disposition?: string | null } = {},
): Promise<void> {
  await this.sendStream(
    {
      filename: blob.filename.sanitized(),
      disposition:
        blob.forcedDispositionForServing() ?? disposition ?? DEFAULT_BLOB_STREAMING_DISPOSITION,
      type: blob.contentTypeForServing(),
    },
    async (stream: ActionController.LiveBuffer) => {
      try {
        await blob.download((chunk) => {
          stream.write(chunk as never);
        });
      } catch (error) {
        if (error instanceof FileNotFoundError) {
          this.expiresNow();
          this.head("not_found");
        } else {
          this.expiresNow();
          this.head("internal_server_error");
          throw error;
        }
      }
    },
  );
}

export const Streaming = {
  DEFAULT_BLOB_STREAMING_DISPOSITION,
  sendBlobByteRangeData,
  sendBlobStream,
};
extend(Streaming, Concern);
include(Streaming, ActionController.DataStreaming);
include(Streaming, ActionController.Live);
