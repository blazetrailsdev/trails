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
   * @internal
   * @missingRailsCall fetch — PERMANENT
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
