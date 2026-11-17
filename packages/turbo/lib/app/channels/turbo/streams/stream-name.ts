import { toParam, tryCall } from "@blazetrails/activesupport";
import { Turbo } from "../../../../turbo-trails.js";

type ClassMethodsHost = {
  constructor: { verifiedStreamName(signedStreamName: unknown): unknown };
  params: Record<string, unknown>;
};

type StreamNameHost = { streamNameFrom(streamables: unknown): string };

export const StreamName = {
  verifiedStreamName(signedStreamName: unknown): unknown {
    return Turbo.signedStreamVerifier().verified(signedStreamName as string);
  },

  signedStreamName(this: StreamNameHost, streamables: unknown): string {
    return Turbo.signedStreamVerifier().generate(this.streamNameFrom(streamables));
  },

  ClassMethods: {
    verifiedStreamNameFromParams(this: ClassMethodsHost): unknown {
      return this.constructor.verifiedStreamName(this.params["signed_stream_name"]);
    },
  },

  /** @internal */
  streamNameFrom(this: StreamNameHost, streamables: unknown): string {
    if (Array.isArray(streamables)) {
      return streamables.map((streamable) => this.streamNameFrom(streamable)).join(":");
    } else {
      const streamable = streamables as object;
      return String(tryCall(streamable, "toGidParam") ?? toParam(streamable) ?? "");
    }
  },
};
Turbo.Streams.StreamName = StreamName;
