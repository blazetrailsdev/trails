import { RuntimeError, env as ENV, fetch, rbObjFrozenP, toI } from "@blazetrails/ruby-compat";
import { Module } from "@blazetrails/ruby-compat/include";
import { Factory, type Pool } from "@blazetrails/msgpack";
import { delegate } from "../module-ext.js";
import { Extensions } from "./extensions.js";

const SIGNATURE = Uint8Array.of(0xcc, 0x80);
const SIGNATURE_INT = 128;

export interface Serializer {
  dump(object: unknown): Uint8Array;
  load(dumped: Uint8Array | string): unknown;
  isSignature(dumped: Uint8Array): boolean;
  messagePackFactory: Factory;
  registerType(...args: Parameters<Factory["registerType"]>): void;
  warmup(): void;
}

type SerializerHost = Serializer & {
  _messagePackFactory?: Factory;
  _messagePackPool?: Pool | null;
  messagePackPool(): Pool;
  installUnregisteredTypeHandler(): void;
};

export const Serializer = new Module((mod) => {
  delegate.call(mod, "registerType", { to: "messagePackFactory" });
}).include({
  dump(this: SerializerHost, object: unknown): Uint8Array {
    return this.messagePackPool().packer((packer) => {
      packer.write(SIGNATURE_INT);
      packer.write(object);
      return packer.fullPack();
    });
  },

  load(this: SerializerHost, dumped: Uint8Array | string): unknown {
    return this.messagePackPool().unpacker((unpacker) => {
      unpacker.feedReference(dumped);
      if (!(unpacker.read() === SIGNATURE_INT))
        throw new RuntimeError("Invalid serialization format");
      return unpacker.fullUnpack();
    });
  },

  isSignature(dumped: Uint8Array): boolean {
    return dumped[0] === SIGNATURE[0] && dumped[1] === SIGNATURE[1];
  },

  get messagePackFactory(): Factory {
    const self = this as SerializerHost;
    return (self._messagePackFactory ??= new Factory());
  },

  set messagePackFactory(factory: Factory) {
    const self = this as SerializerHost;
    self._messagePackPool = null;
    self._messagePackFactory = factory;
  },

  warmup(this: SerializerHost): void {
    this.messagePackPool();
  },

  /** @internal */
  messagePackPool(this: SerializerHost): Pool {
    if (this._messagePackPool == null) {
      if (!rbObjFrozenP(this.messagePackFactory)) {
        Extensions.install(this.messagePackFactory);
        this.installUnregisteredTypeHandler();
        this.messagePackFactory.freeze();
      }
      this._messagePackPool = this.messagePackFactory.pool(
        Number(toI(fetch(ENV, "RAILS_MAX_THREADS", 5))),
      );
    }
    return this._messagePackPool;
  },

  /** @internal */
  installUnregisteredTypeHandler(this: SerializerHost): void {
    Extensions.installUnregisteredTypeError(this.messagePackFactory);
  },
}) as Module<Serializer>;
