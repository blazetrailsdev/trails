import { isPresent, pluralize } from "@blazetrails/activesupport";
import { ArgumentError, constSet } from "@blazetrails/ruby-compat";
import { Sharded } from "./connections/sharded.js";
import { Single } from "./connections/single.js";
import { Unmanaged } from "./connections/unmanaged.js";
import { SolidCache } from "./solid-cache.js";

export const Connections = {
  Sharded,
  Single,
  Unmanaged,

  fromConfig(options: string[] | null | undefined): Sharded | Single | Unmanaged {
    if (isPresent(options) || SolidCache.configuration.isSharded()) {
      let names!: string[];
      if (options == null) {
        names = SolidCache.configuration.shardKeys();
      } else if (Array.isArray(options)) {
        names = options.map((option) => String(option));
      }

      const unknownShards = names.filter(
        (name) => !SolidCache.configuration.shardKeys().includes(name),
      );
      if (unknownShards.length > 0) {
        throw new ArgumentError(
          `Unknown ${pluralize("shard", unknownShards as unknown as number)}: ${unknownShards.join(", ")}`,
        );
      }

      if (names.length === 1) {
        return new Single(names[0]);
      } else {
        return new Sharded(names);
      }
    } else {
      return new Unmanaged();
    }
  },
};

constSet(SolidCache, "Connections", Connections);
