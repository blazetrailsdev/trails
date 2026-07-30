/**
 * Mirrors Rails `MessageMetadataTests`
 * (test/messages/message_metadata_tests.rb) — the metadata suite Rails
 * `include`s into both `MessageVerifierMetadataTest` and
 * `MessageEncryptorMetadataTest`.
 *
 * Only the module's private helpers are ported here so far; its shared test
 * bodies are still to come (they need a `TimeHelpers` port and a MessagePack
 * temporal packer to run across Rails' full serializer matrix). The two test
 * files carry the cases they cover today directly.
 */

import { Temporal } from "../temporal.js";
import { currentTimeInstant, setFrozenInstant } from "../time-travel.js";
import { Metadata } from "./metadata.js";

export function usingMessageSerializerForMetadata(value: boolean, block: () => void): void {
  const original = Metadata.useMessageSerializerForMetadata;
  Metadata.useMessageSerializerForMetadata = value;
  try {
    block();
  } finally {
    Metadata.useMessageSerializerForMetadata = original;
  }
}

/**
 * Rails' `freeze_time` / `travel` come from `ActiveSupport::Testing::TimeHelpers`,
 * which trails has not ported yet, so freeze the clock directly and hand the
 * block a `travel` that advances the frozen instant.
 */
export function freezeTime(
  block: (travel: (duration: Temporal.DurationLike) => void) => void,
): void {
  let now = currentTimeInstant();
  setFrozenInstant(now);
  try {
    block((duration) => {
      now = now.add(duration);
      setFrozenInstant(now);
    });
  } finally {
    setFrozenInstant(null);
  }
}

/**
 * Rails runs every shared case under both `use_message_serializer_for_metadata`
 * settings and across five serializers. `:message_pack` is absent from the TS
 * list: it is a `TIMESTAMP_SERIALIZERS` member, so an expiry reaches it as a raw
 * `Temporal.Instant`, which trails' MessagePack extensions cannot pack yet.
 */
export function eachScenario<T>(
  makeCodec: (serializer: "marshal" | "json") => T,
  block: (codec: T) => void,
): void {
  for (const useMessageSerializerForMetadata of [false, true]) {
    usingMessageSerializerForMetadata(useMessageSerializerForMetadata, () => {
      for (const serializer of ["marshal", "json"] as const) {
        block(makeCodec(serializer));
      }
    });
  }
}
