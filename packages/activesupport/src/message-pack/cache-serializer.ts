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
