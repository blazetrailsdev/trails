/**
 * Mirrors: ActiveSupport::MessagePack::Serializer
 *
 * `dump` writes the `SIGNATURE_INT` (128) sentinel before the object; `load`
 * rejects input that doesn't open with it. The factory is lazily built and the
 * extension types + unregistered-type handler installed once (Ruby freezes the
 * factory at this point; here we just latch a flag).
 *
 * Ruby returns/accepts binary strings; we use `Buffer` throughout. Consumers
 * that need a string-typed channel (e.g. the encryption serializer) carry the
 * bytes as latin1.
 */

import { Factory, MessagePackError } from "./factory.js";
import { Extensions } from "./extensions.js";

const SIGNATURE_INT = 128;

export class Serializer {
  private factoryInstance: Factory | null = null;
  private installed = false;

  get messagePackFactory(): Factory {
    return (this.factoryInstance ??= new Factory());
  }

  registerType(...args: Parameters<Factory["registerType"]>): void {
    this.messagePackFactory.registerType(...args);
  }

  warmup(): void {
    this.messagePackPool();
  }

  dump(object: unknown): Buffer {
    const packer = this.messagePackPool().packer();
    packer.write(SIGNATURE_INT);
    packer.write(object);
    return packer.toBuffer();
  }

  load(dumped: Buffer): unknown {
    const unpacker = this.messagePackPool().unpacker(dumped);
    if (unpacker.read() !== SIGNATURE_INT)
      throw new MessagePackError("Invalid serialization format");
    return unpacker.read();
  }

  isSignature(dumped: Buffer): boolean {
    return dumped[0] === 0xcc && dumped[1] === 0x80;
  }

  /**
   * @internal Memoizes extension install + handler registration, then returns
   * the factory. Ruby builds and freezes a packer/unpacker pool here; with no
   * threads to pool against, the factory itself plays the role of the pool.
   */
  protected messagePackPool(): Factory {
    if (!this.installed) {
      Extensions.install(this.messagePackFactory);
      this.installUnregisteredTypeHandler();
      this.installed = true;
    }
    return this.messagePackFactory;
  }

  /** @internal */
  protected installUnregisteredTypeHandler(): void {
    Extensions.installUnregisteredTypeError(this.messagePackFactory);
  }
}
