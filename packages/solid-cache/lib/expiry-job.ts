import { Base } from "@blazetrails/activejob";
import { constSet } from "@blazetrails/ruby-compat";
import { Entry } from "./entry.js";
import { Record } from "./record.js";
import { SolidCache } from "./solid-cache.js";

/** @noRailsEquivalent CONVERGEABLE rails-api-manifest-records-app-jobs-and-concern-class-methods */
export class ExpiryJob extends Base {
  static {
    constSet(SolidCache, "ExpiryJob", this);
  }

  async perform(
    count: number,
    {
      shard = null,
      maxAge = null,
      maxEntries = null,
      maxSize = null,
    }: { shard?: string | null; maxAge?: unknown; maxEntries?: unknown; maxSize?: unknown } = {},
  ): Promise<unknown> {
    return await Record.withShard(shard, () =>
      Entry.expire(count, { maxAge: maxAge, maxEntries: maxEntries, maxSize: maxSize }),
    );
  }
}
