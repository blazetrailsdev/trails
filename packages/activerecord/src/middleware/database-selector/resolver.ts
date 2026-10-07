import { Notifications, seconds, type Duration } from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import { cmp, rbCmpint } from "@blazetrails/ruby-compat";
import { Session } from "./resolver/session.js";
import { Base } from "../../base.js";
import { readingRole, writingRole } from "../../active-record.js";

export interface ResolverContext {
  lastWriteTimestamp(): Time;
  updateLastWriteTimestamp(): void;
  save(response: unknown): void;
}

const SEND_TO_REPLICA_DELAY = seconds(2);

export class Resolver {
  readonly context: ResolverContext;
  readonly delay: Duration | number;
  readonly instrumenter: typeof Notifications;

  constructor(context: ResolverContext, options: { delay?: Duration | number | null } | null = {}) {
    this.context = context;
    this.delay = options != null && options.delay != null ? options.delay : SEND_TO_REPLICA_DELAY;
    this.instrumenter = Notifications;
  }

  static call(
    context: ResolverContext,
    options: { delay?: Duration | number | null } | null = {},
  ): Resolver {
    return new Resolver(context, options);
  }

  async read<T>(blk: () => T | Promise<T>): Promise<T> {
    return this.isReadFromPrimary() ? this.readFromPrimary(blk) : this.readFromReplica(blk);
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
  sendToReplicaDelay(): Duration | number {
    return this.delay;
  }

  private isReadFromPrimary(): boolean {
    return !this.isTimeSinceLastWriteOk();
  }

  private isTimeSinceLastWriteOk(): boolean {
    const elapsed = Time.now().minus(this.context.lastWriteTimestamp());
    const sendToReplicaDelay = this.sendToReplicaDelay();
    return rbCmpint(cmp(elapsed, sendToReplicaDelay), elapsed, sendToReplicaDelay) >= 0;
  }

  private async readFromPrimary<T>(blk: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ role: writingRole(), preventWrites: true }, () =>
      this.instrumenter.instrument("database_selector.active_record.read_from_primary", {}, () =>
        Promise.resolve(blk()),
      ),
    ) as Promise<T>;
  }

  private async readFromReplica<T>(blk: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ role: readingRole(), preventWrites: true }, () =>
      this.instrumenter.instrument("database_selector.active_record.read_from_replica", {}, () =>
        Promise.resolve(blk()),
      ),
    );
  }

  private async writeToPrimary<T>(blk: () => T | Promise<T>): Promise<T> {
    return Base.connectedTo({ role: writingRole(), preventWrites: false }, () =>
      this.instrumenter.instrument(
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
    );
  }
}

export { Session };
