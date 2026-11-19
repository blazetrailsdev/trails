import { constSet } from "@blazetrails/ruby-compat";
import { include, runLoadHooks } from "@blazetrails/activesupport";
import { Base, type Relation } from "@blazetrails/activerecord";
import { sql } from "@blazetrails/arel";
import { SolidQueue } from "./solid-queue.js";
import {
  DistinctValues,
  type ClassMethods as DistinctValuesClassMethods,
} from "./record/distinct-values.js";
import { nextMajorVersion } from "./version.js";

/** @missingRailsCall connectsTo — PERMANENT */
export class Record extends Base {
  declare static distinctValuesOf: typeof DistinctValuesClassMethods.distinctValuesOf;

  static {
    this.abstractClass = true;

    include(this, DistinctValues);
  }

  static nonBlockingLock<T extends typeof Record>(this: T): Relation<InstanceType<T>> {
    if (SolidQueue.useSkipLocked) {
      return this.lock(sql("FOR UPDATE SKIP LOCKED"));
    } else {
      return this.lock();
    }
  }

  static async isSupportsInsertConflictTarget(): Promise<boolean> {
    return await this.connectionPool().withConnection(
      async (connection) => await connection.supportsInsertConflictTarget(),
    );
  }

  static warnAboutPendingMigrations(): void {
    SolidQueue.deprecator()
      .warn(`Solid Queue has pending database migrations. To get the new migration files, run:
  trails solid-queue:update
And then:
  trails db:migrate
These migrations will be required after version ${nextMajorVersion()}.0
`);
  }

  static useIndex<T extends typeof Record>(
    this: T,
    ...indexes: string[]
  ): Relation<InstanceType<T>> {
    return this.optimizerHints(`INDEX(${this.quotedTableName()} ${indexes.join(", ")})`);
  }
}

constSet(SolidQueue, "Record", Record);

runLoadHooks("solid_queue_record", Record);

declare module "@blazetrails/activerecord" {
  // eslint-disable-next-line unused-imports/no-unused-vars
  interface RelationScopes<T extends import("@blazetrails/activerecord").Base> {
    nonBlockingLock<R extends Record>(this: Relation<R>): Relation<R>;
    useIndex<R extends Record>(this: Relation<R>, ...indexes: string[]): Relation<R>;
    distinctValuesOf(column: string): Promise<unknown[]>;
  }
}
