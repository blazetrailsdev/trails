import { RuntimeError, env as ENV, fetch, rbObjFrozenP, toI } from "@blazetrails/ruby-compat";
import { Factory, type Pool } from "@blazetrails/msgpack";
import { Extensions } from "./extensions.js";

const SIGNATURE_INT = 128;

export class Serializer {
  private factoryInstance: Factory | null = null;
  private pool: Pool | null = null;

  get messagePackFactory(): Factory {
    return (this.factoryInstance ??= new Factory());
  }

  set messagePackFactory(factory: Factory) {
    this.pool = null;
    this.factoryInstance = factory;
  }

  registerType(...args: Parameters<Factory["registerType"]>): void {
    this.messagePackFactory.registerType(...args);
  }

  warmup(): void {
    this.messagePackPool();
  }

  dump(object: unknown): Uint8Array {
    return this.messagePackPool().packer((packer) => {
      packer.write(SIGNATURE_INT);
      packer.write(object);
      return packer.fullPack();
    });
  }

  load(dumped: Uint8Array | string): unknown {
    return this.messagePackPool().unpacker((unpacker) => {
      unpacker.feedReference(dumped);
      if (!(unpacker.read() === SIGNATURE_INT))
        throw new RuntimeError("Invalid serialization format");
      return unpacker.fullUnpack();
    });
  }

  isSignature(dumped: Uint8Array): boolean {
    return dumped[0] === 0xcc && dumped[1] === 0x80;
  }

  /** @internal */
  protected messagePackPool(): Pool {
    if (this.pool === null) {
      if (!rbObjFrozenP(this.messagePackFactory)) {
        Extensions.install(this.messagePackFactory);
        this.installUnregisteredTypeHandler();
        this.messagePackFactory.freeze();
      }
      this.pool = this.messagePackFactory.pool(Number(toI(fetch(ENV, "RAILS_MAX_THREADS", 5))));
    }
    return this.pool;
  }

  /** @internal */
  protected installUnregisteredTypeHandler(): void {
    Extensions.installUnregisteredTypeError(this.messagePackFactory);
  }
}
