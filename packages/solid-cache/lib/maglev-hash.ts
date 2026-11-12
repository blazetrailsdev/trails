import { ArgumentError, Digest, Zlib, toS, unpack1 } from "@blazetrails/ruby-compat";
import { SolidCache } from "./solid-cache.js";

export class MaglevHash {
  readonly nodes: string[];

  static readonly TABLE_SIZE = 2053;

  /** @internal */
  declare static Preferences: typeof Preferences;

  /** @internal */
  private readonly lookup: (number | null)[];

  constructor(nodes: string[]) {
    if (nodes.length === 0) throw new ArgumentError("No nodes specified");
    if (nodes.length > MaglevHash.TABLE_SIZE) {
      throw new ArgumentError(`Maximum node count is ${MaglevHash.TABLE_SIZE}`);
    }

    this.nodes = [...new Set(nodes)].sort();
    this.lookup = this.buildLookup();
  }

  node(key: unknown): string {
    return this.nodes[this.lookup[this.quickHash(key) % MaglevHash.TABLE_SIZE]!];
  }

  /**
   * @internal
   * @missingRailsArgs new — PERMANENT
   */
  private buildLookup(): (number | null)[] {
    const lookup = new Array<number | null>(MaglevHash.TABLE_SIZE).fill(null);

    const nodePreferences = this.nodes.map((node) => this.buildPreferences(node));
    const nodeCount = this.nodes.length;

    for (let i = 0; i < MaglevHash.TABLE_SIZE; i++) {
      const nodeIndex = i % nodeCount;
      const preferences = nodePreferences[nodeIndex];
      const slot = preferences.preferredFreeSlot(lookup);
      lookup[slot] = nodeIndex;
    }

    return lookup;
  }

  /** @internal */
  private buildPreferences(node: string): Preferences {
    const offset = this.md5(node, "offset") % MaglevHash.TABLE_SIZE;
    const skip = (this.md5(node, "skip") % (MaglevHash.TABLE_SIZE - 1)) + 1;

    return new MaglevHash.Preferences(offset, skip);
  }

  /**
   * @internal
   * @missingRailsArgs unpack1 — PERMANENT
   */
  private md5(...args: string[]): number {
    return unpack1(Digest.MD5.digest(args.join("")), "L>") as number;
  }

  /** @internal */
  private quickHash(key: unknown): number {
    return Zlib.crc32(toS(key));
  }
}

/** @internal */
class Preferences {
  /** @internal */
  private readonly preferredSlots: number[];
  /** @internal */
  private rank: number;

  constructor(offset: number, skip: number) {
    this.preferredSlots = Array.from(
      { length: MaglevHash.TABLE_SIZE },
      (_, i) => (offset + i * skip) % MaglevHash.TABLE_SIZE,
    );
    this.rank = 0;
  }

  preferredFreeSlot(lookup: (number | null)[]): number {
    while (true) {
      const slot = this.nextSlot();
      if (lookup[slot] == null) return slot;
    }
  }

  /** @internal */
  private nextSlot(): number {
    return this.preferredSlots[this.rank++];
  }
}
MaglevHash.Preferences = Preferences;
SolidCache.MaglevHash = MaglevHash;
