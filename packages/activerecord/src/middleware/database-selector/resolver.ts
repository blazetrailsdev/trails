/**
 * Mirrors: ActiveRecord::Middleware::DatabaseSelector::Resolver
 */

import { Notifications } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/activesupport/temporal";
import { Session } from "./resolver/session.js";
import { Base } from "../../base.js";

export interface ResolverContext {
  lastWriteTimestamp(): Temporal.Instant;
  updateLastWriteTimestamp(): void;
  save(response: unknown): void;
}

const SEND_TO_REPLICA_DELAY = 2000;

export class Resolver {
  /** @internal */
  readonly context: ResolverContext;
  /** @internal */
  readonly delay: number;
  /** @internal */
  readonly instrumenter: typeof Notifications;

  constructor(context: ResolverContext, options: { delay?: number } = {}) {
    this.context = context;
    this.delay = options.delay !== undefined ? options.delay : SEND_TO_REPLICA_DELAY;
    this.instrumenter = Notifications;
  }

  static call(context: ResolverContext, options: { delay?: number } = {}): Resolver {
    return new Resolver(context, options);
  }

  async read<T>(blk: () => T | Promise<T>): Promise<T> {
    return this.isReadFromPrimaryQ() ? this.readFromPrimary(blk) : this.readFromReplica(blk);
  }

  async write<T>(blk: () => T | Promise<T>): Promise<T> {
    return this.writeToPrimary(blk);
  }

  updateContext(response: unknown): void {
    this.context.save(response);
  }

  isReadingRequest(request: { method: string }): boolean {
    const m = request.method.toUpperCase();
    return m === "GET" || m === "HEAD";
  }

  /** @internal */
  sendToReplicaDelay(): number {
    return this.delay;
  }

  private isReadFromPrimaryQ(): boolean {
    return !this.isTimeSinceLastWriteOk();
  }

  private isTimeSinceLastWriteOk(): boolean {
    return (
      Temporal.Now.instant().epochMilliseconds -
        this.context.lastWriteTimestamp().epochMilliseconds >=
      this.delay
    );
  }

  private async readFromPrimary<T>(blk: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ role: "writing", preventWrites: true }, () =>
      this.instrumenter.instrumentAsync(
        "database_selector.active_record.read_from_primary",
        {},
        () => Promise.resolve(blk()),
      ),
    ) as Promise<T>;
  }

  private async readFromReplica<T>(blk: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ role: "reading", preventWrites: true }, () =>
      this.instrumenter.instrumentAsync(
        "database_selector.active_record.read_from_replica",
        {},
        () => Promise.resolve(blk()),
      ),
    ) as Promise<T>;
  }

  private async writeToPrimary<T>(blk: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ role: "writing", preventWrites: false }, () =>
      this.instrumenter.instrumentAsync(
        "database_selector.active_record.wrote_to_primary",
        {},
        async () => {
          try {
            return await blk();
          } finally {
            this.context.updateLastWriteTimestamp();
          }
        },
      ),
    ) as Promise<T>;
  }
}

export { Session };
