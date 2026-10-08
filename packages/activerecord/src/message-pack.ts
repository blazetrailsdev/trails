import { BinaryData } from "@blazetrails/activemodel";
import { Extensions as ActiveSupportExtensions } from "@blazetrails/activesupport/message-pack";
import type { Factory, Packer, Unpacker } from "@blazetrails/msgpack";
import { RuntimeError, rbInspect } from "@blazetrails/ruby-compat";
import { AssociationNotFoundError } from "./associations/errors.js";
import type { Base } from "./base.js";
import { ActiveRecord } from "./namespaces.js";

export const FORMAT_VERSION = 1;

export function dump(input: unknown): unknown[] {
  const encoder = new Encoder();
  return [FORMAT_VERSION, encoder.encode(input), encoder.entries];
}

export function load(dumped: unknown): unknown {
  const [formatVersion, topLevel, entries] = dumped as [unknown, unknown, unknown[][]];
  if (!(formatVersion === FORMAT_VERSION)) {
    throw new RuntimeError(`Invalid format version: ${rbInspect(formatVersion)}`);
  }
  return new Decoder(entries).decode(topLevel);
}

export const Extensions = {
  install(registry: Factory): void {
    registry.registerType(119, BinaryData, {
      packer: "toString",
      unpacker: "new",
    });

    registry.registerType(120, ActiveRecord.Base, {
      packer: Extensions.writeRecord,
      unpacker: Extensions.readRecord,
      recursive: true,
    });
  },

  writeRecord(record: Base, packer: Packer): void {
    packer.write(dump(record));
  },

  readRecord(unpacker: Unpacker): unknown {
    return load(unpacker.read());
  },
};

export class Encoder {
  readonly entries: unknown[][];
  private refs: Map<Base, number>;

  constructor() {
    this.entries = [];
    this.refs = new Map();
  }

  encode(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.map((record: Base) => this.encodeRecord(record));
    } else if (input != null && input !== false) {
      return this.encodeRecord(input as Base);
    }
    return null;
  }

  encodeRecord(record: Base): number {
    let ref = this.refs.get(record);

    if (ref == null) {
      ref = this.entries.length;
      this.refs.set(record, ref);
      this.entries.push(this.buildEntry(record));
      this.addCachedAssociations(record, this.entries[this.entries.length - 1]);
    }

    return ref;
  }

  /** @missingRailsName class — PERMANENT */
  buildEntry(record: Base): unknown[] {
    return [
      ActiveSupportExtensions.dumpClass(record.constructor),
      record.attributesForDatabase(),
      record.isNewRecord(),
    ];
  }

  addCachedAssociations(record: Base, entry: unknown[]): void {
    for (const reflection of Object.values(
      (record.constructor as typeof Base).normalizedReflections(),
    )) {
      if (
        record.isAssociationCached(reflection.name) &&
        record.association(reflection.name).isLoaded()
      ) {
        entry.push(reflection.name);
        entry.push(this.encode(record.association(reflection.name).target));
      }
    }
  }
}

export class Decoder {
  private records: Base[];

  constructor(entries: unknown[][]) {
    this.records = entries.map((entry) => this.buildRecord(entry));
    this.records.forEach((record, i) => this.resolveCachedAssociations(record, entries[i]));
  }

  decode(ref: unknown): unknown {
    if (Array.isArray(ref)) {
      return ref.map((r: number) => this.records[r]);
    } else if (ref != null && ref !== false) {
      return this.records[ref as number];
    }
    return null;
  }

  buildRecord(entry: unknown[]): Base {
    const [className, attributesHash, isNewRecord] = entry as [
      string,
      Record<string, unknown>,
      boolean,
    ];
    const klass = ActiveSupportExtensions.loadClass(className) as unknown as typeof Base;
    const attributes = klass.attributesBuilder().buildFromDatabase(attributesHash);
    return klass.allocate().initWithAttributes(attributes, isNewRecord);
  }

  resolveCachedAssociations(record: Base, entry: unknown[]): void {
    let i = 3;
    while (i < entry.length) {
      try {
        record.association(entry[i] as string).target = this.decode(entry[i + 1]) as
          | Base
          | Base[]
          | null;
      } catch (e) {
        if (!(e instanceof AssociationNotFoundError)) throw e;
      }
      i += 2;
    }
  }
}
