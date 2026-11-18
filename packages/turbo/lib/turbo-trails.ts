import {
  ArgumentError,
  JSON,
  Autoload,
  extend,
  mattrAccessor,
  threadMattrAccessor,
  type Extended,
} from "@blazetrails/activesupport";
import { MessageVerifier } from "@blazetrails/activesupport/message-verifier";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import type { Engine } from "./engine.js";
import type { DriveHelper } from "./app/helpers/turbo/drive-helper.js";
import type { FramesHelper } from "./app/helpers/turbo/frames-helper.js";
import type { IncludesHelper } from "./app/helpers/turbo/includes-helper.js";
import type { StreamsHelper } from "./app/helpers/turbo/streams-helper.js";
import type { ActionHelper } from "./app/helpers/turbo/streams/action-helper.js";
import type { StreamName } from "./app/channels/turbo/streams/stream-name.js";
import type { Broadcasts } from "./app/channels/turbo/streams/broadcasts.js";
import type { ActionBroadcastJob } from "./app/jobs/turbo/streams/action-broadcast-job.js";
import type { BroadcastJob } from "./app/jobs/turbo/streams/broadcast-job.js";
import type { BroadcastStreamJob } from "./app/jobs/turbo/streams/broadcast-stream-job.js";
import type { StreamsChannel } from "./app/channels/turbo/streams-channel.js";
import type { FrameRequest } from "./app/controllers/turbo/frames/frame-request.js";
import type { Navigation } from "./app/controllers/turbo/native/navigation.js";
import type { NavigationController } from "./app/controllers/turbo/native/navigation-controller.js";
import type { RequestIdTracking } from "./app/controllers/concerns/turbo/request-id-tracking.js";
import type { TagBuilder } from "./app/models/turbo/streams/tag-builder.js";
import type { TurboStreamsTagBuilder } from "./app/controllers/turbo/streams/turbo-streams-tag-builder.js";

type AutoloadModule = Autoload.Autoload & Extended<typeof Autoload>;

export const Turbo = {
  name: "Turbo",

  setSignedStreamVerifierKey(signedStreamVerifierKey: string | Uint8Array | null): void {
    this._signedStreamVerifierKey = signedStreamVerifierKey;
  },

  signedStreamVerifier(): MessageVerifier {
    return (this._signedStreamVerifier ??= new MessageVerifier(this.signedStreamVerifierKey(), {
      digest: "SHA256",
      serializer: JSON,
    }));
  },

  signedStreamVerifierKey(): string | Uint8Array {
    const key = this._signedStreamVerifierKey;
    if (key != null) return key;
    throw new ArgumentError("Turbo requires a signed_stream_verifier_key");
  },

  /** @inventedArm if — PERMANENT */
  withRequestId<T>(requestId: string | null, block: () => T): T {
    const oldRequestId = this.currentRequestId;
    this.currentRequestId = requestId;
    const ensure = (): void => {
      this.currentRequestId = oldRequestId;
    };
    let result: T;
    try {
      result = block();
    } catch (error) {
      ensure();
      throw error;
    }
    if (result instanceof Promise) return result.finally(ensure) as T;
    ensure();
    return result;
  },
} as AutoloadModule & {
  drawRoutes: boolean;
  currentRequestId: string | null;
  setSignedStreamVerifierKey(signedStreamVerifierKey: string | Uint8Array | null): void;
  signedStreamVerifier(): MessageVerifier;
  signedStreamVerifierKey(): string | Uint8Array;
  withRequestId<T>(requestId: string | null, block: () => T): T;
  /** @internal */
  _signedStreamVerifier?: MessageVerifier;
  /** @internal */
  _signedStreamVerifierKey?: string | Uint8Array | null;
  Engine?: typeof Engine;
  DriveHelper?: typeof DriveHelper;
  FramesHelper?: typeof FramesHelper;
  IncludesHelper?: typeof IncludesHelper;
  StreamsHelper?: typeof StreamsHelper;
  StreamsChannel?: typeof StreamsChannel;
  RequestIdTracking?: typeof RequestIdTracking;
  Frames: {
    FrameRequest?: typeof FrameRequest;
  };
  Native: {
    Navigation?: typeof Navigation;
    NavigationController?: typeof NavigationController;
  };
  Streams: {
    TagBuilder?: typeof TagBuilder;
    TurboStreamsTagBuilder?: typeof TurboStreamsTagBuilder;
    ActionHelper?: typeof ActionHelper;
    StreamName?: typeof StreamName;
    Broadcasts?: typeof Broadcasts;
    ActionBroadcastJob?: typeof ActionBroadcastJob;
    BroadcastJob?: typeof BroadcastJob;
    BroadcastStreamJob?: typeof BroadcastStreamJob;
  };
};
extend(Turbo, Autoload);
mattrAccessor.call(Turbo, "drawRoutes", { default: true });
threadMattrAccessor.call(Turbo, "currentRequestId");
Turbo.Frames = {};
Turbo.Native = {};
constSet(Turbo, "Streams", {});
constSet(TopLevel, "Turbo", Turbo);
