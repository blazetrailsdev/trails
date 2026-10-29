import {
  Callbacks,
  include,
  threadMattrAccessor,
  type Extended,
  type Included,
} from "@blazetrails/activesupport";
import {
  ArgumentError,
  type Block,
  ThreadPoolExecutor,
  excBacktrace,
  rbBlockGivenP,
  rbFSend,
  rbObjClassname,
  rbObjRespondTo,
  rbScanArgs,
} from "@blazetrails/ruby-compat";
import { ActionCable } from "../namespaces.js";
import { ActiveRecordConnectionManagement } from "./worker/active-record-connection-management.js";

interface Logger {
  error(message: unknown): unknown;
}

export class Worker {
  declare static defineCallbacks: Extended<typeof Callbacks.ClassMethods>["defineCallbacks"];
  declare static setCallback: Extended<typeof Callbacks.ClassMethods>["setCallback"];
  declare runCallbacks: Included<typeof Callbacks>["runCallbacks"];
  declare static connection: unknown;
  declare connection: unknown;

  private _executor: ThreadPoolExecutor;

  get executor(): ThreadPoolExecutor {
    return this._executor;
  }

  constructor({ maxSize = 5 }: { maxSize?: number } = {}) {
    this._executor = new ThreadPoolExecutor({
      name: "ActionCable",
      minThreads: 1,
      maxThreads: maxSize,
      maxQueue: 0,
    });
  }

  halt(): void {
    this._executor.shutdown();
  }

  isStopping(): boolean {
    return this._executor.isShuttingdown();
  }

  async work(connection: unknown, block: () => unknown): Promise<unknown> {
    try {
      this.connection = connection;

      return await this.runCallbacks("work", block);
    } finally {
      this.connection = null;
    }
  }

  asyncExec(receiver: unknown, ...args: unknown[] | [...unknown[], Block<unknown>]): unknown {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as Block<unknown>) : undefined;
    const [rest, kw] = rbScanArgs<{ connection?: unknown }>(args);
    if (!Object.hasOwn(kw, "connection")) throw new ArgumentError("missing keyword: :connection");
    const { connection } = kw;
    return this.asyncInvoke(
      receiver,
      "instanceExec",
      ...rest,
      { connection },
      ...(block ? [block] : []),
    );
  }

  asyncInvoke(
    receiver: unknown,
    method: string,
    ...args: unknown[] | [...unknown[], Block<unknown>]
  ): unknown {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as Block<unknown>) : undefined;
    const [rest, { connection = receiver }] = rbScanArgs<{ connection?: unknown }>(args);
    return this._executor.post(() =>
      this.invoke(receiver, method, ...rest, { connection }, ...(block ? [block] : [])),
    );
  }

  invoke(
    receiver: unknown,
    method: string,
    ...args: unknown[] | [...unknown[], Block<unknown>]
  ): Promise<unknown> {
    const block = rbBlockGivenP(args.at(-1)) ? (args.pop() as Block<unknown>) : undefined;
    const [rest, kw] = rbScanArgs<{ connection?: unknown }>(args);
    if (!Object.hasOwn(kw, "connection")) throw new ArgumentError("missing keyword: :connection");
    const { connection } = kw;
    return this.work(connection, async () => {
      try {
        return await rbFSend(receiver, method, ...rest, ...(block ? [block] : []));
      } catch (e) {
        this.logger.error(
          `There was an exception - ${rbObjClassname(e)}(${e instanceof Error ? e.message : String(e)})`,
        );
        this.logger.error((excBacktrace(e as Error) ?? []).join("\n"));

        if (rbObjRespondTo(receiver, "handleException")) {
          return (receiver as { handleException(): unknown }).handleException();
        }
      }
    });
  }

  /** @internal */
  private get logger(): Logger {
    return (ActionCable.server() as { logger: Logger }).logger;
  }
}

include(Worker, Callbacks);

threadMattrAccessor.call(Worker as never, "connection");
Worker.defineCallbacks("work");
include(Worker, ActiveRecordConnectionManagement);
