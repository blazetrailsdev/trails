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
