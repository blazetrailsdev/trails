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
import type { StreamsChannel } from "./app/channels/turbo/streams-channel.js";

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

  withRequestId<T>(requestId: string | null, block: () => T): T {
    const oldRequestId = this.currentRequestId;
    this.currentRequestId = requestId;
    try {
      return block();
    } finally {
      this.currentRequestId = oldRequestId;
    }
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
  Streams: {
    ActionHelper?: typeof ActionHelper;
    StreamName?: typeof StreamName;
  };
};
extend(Turbo, Autoload);
mattrAccessor.call(Turbo, "drawRoutes", { default: true });
threadMattrAccessor.call(Turbo, "currentRequestId");
Turbo.Streams = {};
constSet(TopLevel, "Turbo", Turbo);
