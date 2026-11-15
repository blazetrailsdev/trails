import { Concern, extend, seconds } from "@blazetrails/activesupport";
import { ARRAY_METHOD_TABLE, classModule, cmp } from "@blazetrails/ruby-compat";
import type { Entry } from "../entry.js";

type MaxOptions = { maxAge: unknown; maxEntries: unknown; maxSize: unknown };

export class ClassMethods {
  static async expire(
    this: typeof Entry,
    count: number,
    { maxAge, maxEntries, maxSize }: MaxOptions,
  ): Promise<number | undefined> {
    const ids = await this.expiryCandidateIds(count, { maxAge, maxEntries, maxSize });
    if (ids.length > 0) {
      return await this.delete(ids);
    }
  }

  /** @internal */
  static async isCacheFull(
    this: typeof Entry,
    { maxEntries, maxSize }: { maxEntries: unknown; maxSize: unknown },
  ): Promise<boolean> {
    if (
      maxEntries != null &&
      maxEntries !== false &&
      (maxEntries as number) < Number(await this.idRange())
    ) {
      return true;
    } else if (
      maxSize != null &&
      maxSize !== false &&
      (maxSize as number) < (await this.estimatedSize())
    ) {
      return true;
    } else {
      return false;
    }
  }

  /** @internal */
  static async expiryCandidateIds(
    this: typeof Entry,
    count: number,
    { maxAge, maxEntries, maxSize }: MaxOptions,
  ): Promise<unknown[]> {
    const cacheFull = await this.isCacheFull({ maxEntries, maxSize });
    if (!(cacheFull || (maxAge != null && maxAge !== false))) return [];

    const retrieveCount = count * 3;

    return await this.uncached(async () => {
      const candidates = this.order("id").limit(retrieveCount);

      let candidateIds: unknown[];
      if (cacheFull) {
        candidateIds = await candidates.pluck("id");
      } else {
        const minCreatedAt = seconds(Number(maxAge)).ago();
        candidateIds = ((await candidates.pluck("id", "created_at")) as [unknown, unknown][])
          .filter(([, createdAt]) => cmp(createdAt, minCreatedAt)! < 0)
          .map(([id]) => id);
      }

      return (ARRAY_METHOD_TABLE.sample as (self: unknown[], n: number) => unknown[])(
        candidateIds,
        count,
      );
    });
  }
}

export class Expiration {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;
}
extend(Expiration, Concern);
Object.defineProperty(Expiration, "ClassMethods", { value: ClassMethods });
