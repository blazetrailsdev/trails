import { Concern, extend, isPresent } from "@blazetrails/activesupport";
import { Turbo } from "../../../../turbo-trails.js";

interface FrameRequestHost {
  request: { headers: { get(name: string): unknown } };
  isTurboFrameRequest(): boolean;
  turboFrameRequestId(): unknown;
}

interface FrameRequestBase {
  layout(layout: (this: FrameRequestHost) => string | null): void;
  etag(etagger: (this: FrameRequestHost) => unknown): void;
  helperMethod(...methods: string[]): void;
}

export const FrameRequest = {
  /** @internal */
  isTurboFrameRequest(this: FrameRequestHost): boolean {
    return isPresent(this.turboFrameRequestId());
  },

  /** @internal */
  turboFrameRequestId(this: FrameRequestHost): unknown {
    return this.request.headers.get("Turbo-Frame");
  },
};
extend(FrameRequest, Concern);
(
  FrameRequest as unknown as {
    included(base: null, block: (this: FrameRequestBase) => void): void;
  }
).included(null, function (this: FrameRequestBase) {
  this.layout(function (this: FrameRequestHost) {
    return this.isTurboFrameRequest() ? "turbo_rails/frame" : null;
  });
  this.etag(function (this: FrameRequestHost) {
    return this.isTurboFrameRequest() ? "frame" : null;
  });

  this.helperMethod("isTurboFrameRequest", "turboFrameRequestId");
});
Turbo.Frames.FrameRequest = FrameRequest;
