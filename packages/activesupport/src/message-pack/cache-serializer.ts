/**
 * Mirrors: ActiveSupport::MessagePack::CacheSerializer
 *
 * Same wire format as the base serializer, but type 127 falls back to the
 * object protocol (`toMsgpackExt`/`fromMsgpackExt`, `asJson`/`jsonCreate`)
 * instead of raising, and a `MissingClassError` on load is swallowed to a cache
 * miss (returns undefined).
 */

import { Serializer } from "./serializer.js";
import { Extensions, MissingClassError } from "./extensions.js";

export class CacheSerializer extends Serializer {
  override load(dumped: Buffer): unknown {
    try {
      return super.load(dumped);
    } catch (e) {
      if (e instanceof MissingClassError) return undefined;
      throw e;
    }
  }

  /** @internal */
  protected override installUnregisteredTypeHandler(): void {
    Extensions.installUnregisteredTypeFallback(this.messagePackFactory);
  }
}
