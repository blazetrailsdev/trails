import { Concern, extend } from "@blazetrails/activesupport";
import { Turbo } from "../../../../turbo-trails.js";

interface RequestIdTrackingHost {
  request: { headers: { get(name: string): unknown } };
}

export const RequestIdTracking = {
  /** @internal */
  turboTrackingRequestId<T>(this: RequestIdTrackingHost, block: () => T): T {
    return Turbo.withRequestId(
      (this.request.headers.get("X-Turbo-Request-Id") as string | null | undefined) ?? null,
      block,
    );
  },
};
extend(RequestIdTracking, Concern);
(
  RequestIdTracking as unknown as {
    included(base: null, block: (this: { aroundAction(name: string): void }) => void): void;
  }
).included(null, function (this: { aroundAction(name: string): void }) {
  this.aroundAction(":turboTrackingRequestId");
});
Turbo.RequestIdTracking = RequestIdTracking;
