import {
  ArgumentError,
  FrozenError,
  Method,
  Module,
  RangeError,
  TypeError,
  rbEnsure,
  rbFSend,
  rbInspect,
  rbModAncestors,
  rbModConstSet,
  rbObjClass,
  rbObjMethod,
  rbObjRespondTo,
} from "@blazetrails/ruby-compat";
import { MSGPACK_EXT_RECURSIVE, Packer } from "./packer.js";
import type { PackerExtRegistry, PackerProc } from "./packer.js";
import { Unpacker } from "./unpacker.js";
import type { UnpackerExtRegistry, UnpackerProc } from "./unpacker.js";

export type RegisterTypeOptions = {
  packer?: unknown;
  unpacker?: unknown;
  recursive?: boolean | null;
};

export type RegisteredType = {
  type: number;
  class: unknown;
  packer?: PackerProc | null;
  unpacker?: UnpackerProc | null;
};

export class MemberPool<T extends { reset(): unknown }> {
  private readonly size: number;
  private readonly newMember: () => T;
  private readonly members: T[];

  constructor(size: number, block: () => T) {
    this.size = size;
    this.newMember = block;
    this.members = [];
  }

  with<R>(block: (member: T) => R): R {
    const member = this.members.pop() || this.newMember();
    return rbEnsure(
      () => block(member),
      () => {
        if (member && this.members.length < this.size) {
          member.reset();
          this.members.push(member);
        }
      },
    );
  }
}

export class Pool {
  declare static MemberPool: typeof MemberPool;

  private readonly factory: Factory;
  private readonly packers: MemberPool<Packer>;
  private readonly unpackers: MemberPool<Unpacker>;

  constructor(factory: Factory, size: number, options: object | null = null) {
    if (options == null || Object.keys(options).length === 0) options = null;
    this.factory = factory;
    this.packers = new Pool.MemberPool(
      size,
      () => Object.freeze(factory.packer(options)) as Packer,
    );
    this.unpackers = new Pool.MemberPool(
      size,
      () => Object.freeze(factory.unpacker(options)) as Unpacker,
    );
  }

  load(data: string | Uint8Array): unknown {
    return this.unpackers.with((unpacker) => {
      unpacker.feed(data);
      return unpacker.fullUnpack();
    });
  }

  dump(object: unknown): Uint8Array {
    return this.packers.with((packer) => {
      packer.write(object);
      return packer.fullPack();
    });
  }

  unpacker<R>(block: (unpacker: Unpacker) => R): R {
    return this.unpackers.with(block);
  }

  packer<R>(block: (packer: Packer) => R): R {
    return this.packers.with(block);
  }
}

export class Factory {
  declare static Pool: typeof Pool;

  private pkrg: PackerExtRegistry = new Map();
  private ukrg: UnpackerExtRegistry = new Map();

  registerType(
    type: number,
    klass: unknown,
    options: RegisterTypeOptions | null = { packer: "toMsgpackExt", unpacker: "fromMsgpackExt" },
  ): null {
    if (Object.isFrozen(this)) throw new FrozenError("can't modify frozen MessagePack::Factory");

    if (options != null) {
      options = { ...options };
      const packer = options.packer;
      if (packer != null && typeof packer !== "function") {
        if (typeof packer === "string") {
          options.packer = (obj: unknown, ...args: unknown[]) => rbFSend(obj, packer, ...args);
        } else if (packer instanceof Method) {
          options.packer = (...args: unknown[]) => packer.call(...args);
        } else if (rbObjRespondTo(packer, "call") === packer) {
          const method = rbObjMethod(packer, "call");
          options.packer = (...args: unknown[]) => method.call(...args);
        } else {
          throw new TypeError(
            `expected :packer argument to be a callable object, got: ${rbInspect(packer)}`,
          );
        }
      }

      const unpacker = options.unpacker;
      if (unpacker != null && typeof unpacker !== "function") {
        if (typeof unpacker === "string") {
          const method = rbObjMethod(klass, unpacker);
          options.unpacker = (...args: unknown[]) => method.call(...args);
        } else if (unpacker instanceof Method) {
          options.unpacker = (...args: unknown[]) => unpacker.call(...args);
        } else if (rbObjRespondTo(packer, "call") === unpacker) {
          const method = rbObjMethod(unpacker, "call");
          options.unpacker = (...args: unknown[]) => method.call(...args);
        } else {
          throw new TypeError(
            `expected :unpacker argument to be a callable object, got: ${rbInspect(unpacker)}`,
          );
        }
      }
    }

    return this.registerTypeInternal(type, klass, options);
  }

  registeredTypes(selector: string = "both"): RegisteredType[] {
    const [packer, unpacker] = this.registeredTypesInternal();

    const list: RegisteredType[] = [];

    switch (selector) {
      case "both":
        for (const [klass, ary] of packer) {
          const type = ary[0];
          const packerProc = ary[1];
          let unpackerProc = null;
          if (unpacker.has(type)) {
            unpackerProc = unpacker.get(type)![1];
            unpacker.delete(type);
          }
          list.push({ type: type, class: klass, packer: packerProc, unpacker: unpackerProc });
        }

        for (const [type, ary] of unpacker) {
          list.push({ type: type, class: ary[0], packer: null, unpacker: ary[1] });
        }
        break;

      case "packer":
        for (const [klass, ary] of packer) {
          if (ary[1] != null) {
            list.push({ type: ary[0], class: klass, packer: ary[1] });
          }
        }
        break;

      case "unpacker":
        for (const [type, ary] of unpacker) {
          if (ary[1] != null) {
            list.push({ type: type, class: ary[0], unpacker: ary[1] });
          }
        }
        break;

      default:
        throw new ArgumentError(`invalid selector ${selector}`);
    }

    return list.sort((a, b) => a.type - b.type);
  }

  isTypeRegistered(klassOrType: unknown, selector: string = "both"): boolean {
    if (typeof klassOrType === "function") {
      const klass = klassOrType;
      return this.registeredTypes(selector).some((entry) =>
        rbModAncestors(klass).includes(entry.class as object),
      );
    } else if (typeof klassOrType === "number") {
      const type = klassOrType;
      return this.registeredTypes(selector).some((entry) => type === entry.type);
    } else {
      throw new ArgumentError("class or type id");
    }
  }

  load(src: unknown, param: object | null = null): unknown {
    let unpacker: Unpacker;

    if (typeof src === "string" || src instanceof Uint8Array) {
      unpacker = this.unpacker(param);
      unpacker.feed(src);
    } else {
      unpacker = this.unpacker(src, param);
    }

    return unpacker.fullUnpack();
  }

  unpack(src: unknown, param: object | null = null): unknown {
    return this.load(src, param);
  }

  dump(v: unknown, ...rest: ConstructorParameters<typeof Packer>): Uint8Array {
    const packer = this.packer(...rest);
    packer.write(v);
    return packer.fullPack();
  }

  pack(v: unknown, ...rest: ConstructorParameters<typeof Packer>): Uint8Array {
    return this.dump(v, ...rest);
  }

  pool(size: number = 1, options: object = {}): Pool {
    return new Factory.Pool(
      Object.isFrozen(this) ? this : this.dup().freeze(),
      size,
      Object.keys(options).length === 0 ? null : options,
    );
  }

  dup(): Factory {
    const clone = new (rbObjClass(this) as typeof Factory)();

    clone.ukrg = new Map(this.ukrg);
    clone.pkrg = new Map(this.pkrg);

    return clone;
  }

  freeze(): this {
    if (!Object.isFrozen(this)) {
      Object.freeze(this);
    }

    return this;
  }

  packer(...argv: ConstructorParameters<typeof Packer>): Packer {
    const packer = new Packer(...argv);

    packer.extRegistry.clear();
    for (const [klass, entry] of this.pkrg) packer.extRegistry.set(klass, entry);

    return packer;
  }

  unpacker(...argv: ConstructorParameters<typeof Unpacker>): Unpacker {
    const unpacker = new Unpacker(...argv);

    for (const [type, entry] of this.ukrg) unpacker.extRegistry.set(type, entry);

    return unpacker;
  }

  private registeredTypesInternal(): [PackerExtRegistry, UnpackerExtRegistry] {
    return [new Map(this.pkrg), new Map(this.ukrg)];
  }

  private registerTypeInternal(
    extType: number,
    extModule: unknown,
    options: RegisterTypeOptions | null,
  ): null {
    if (typeof extModule !== "function" && !(extModule instanceof Module)) {
      throw new ArgumentError(
        `expected Module/Class but found ${(rbObjClass(extModule) as { name: string }).name}.`,
      );
    }

    let flags = 0;

    let packerProc: PackerProc | null = null;
    let unpackerProc: UnpackerProc | null = null;
    if (options != null) {
      packerProc = (options.packer as PackerProc | undefined) ?? null;
      unpackerProc = (options.unpacker as UnpackerProc | undefined) ?? null;
    }

    if (Object.isFrozen(this)) {
      throw new FrozenError("can't modify frozen MessagePack::Factory");
    }

    if (extType < -128 || extType > 127) {
      throw new RangeError(`integer ${extType} too big to convert to \`signed char'`);
    }

    if (options != null) {
      if (options.recursive != null && options.recursive !== false) {
        flags |= MSGPACK_EXT_RECURSIVE;
      }
    }

    this.pkrg.set(extModule, [extType, packerProc, flags]);
    this.ukrg.set(extType, [extModule, unpackerProc, flags]);

    return null;
  }
}

rbModConstSet(Pool, "MemberPool", MemberPool);
rbModConstSet(Factory, "Pool", Pool);
