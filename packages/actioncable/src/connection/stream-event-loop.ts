import {
  ThreadPoolExecutor,
  TimerTask,
  rbDeclareIvar,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

interface Io {
  waitReadable(): Promise<unknown>;
  readNonblock(
    len: number,
    buf: null,
    options: { exception: false },
  ): Uint8Array | "wait_readable" | null;
  close(): unknown;
}

interface Stream {
  receive(data: unknown): unknown;
  close(): unknown;
}

export class StreamEventLoop {
  private _executor: ThreadPoolExecutor | null;
  private _map: Map<Io, Stream>;
  private _stopping: boolean;

  constructor() {
    this._executor = null;
    this._map = new Map();
    this._stopping = false;
  }

  timer(interval: number, block: (task: TimerTask) => unknown): TimerTask {
    return new TimerTask({ executionInterval: interval }, block).execute();
  }

  post(task: (() => unknown) | null = null, block?: () => unknown): ThreadPoolExecutor {
    task ??= block!;

    this._executor ??= new ThreadPoolExecutor({ minThreads: 1, maxThreads: 10, maxQueue: 0 });
    return this._executor.append(task);
  }

  attach(io: Io, stream: Stream): void {
    this._map.set(io, stream);
    void (async () => {
      while (!this._stopping && this._map.get(io) === stream) {
        try {
          await io.waitReadable();
          if (this._map.get(io) !== stream) break;

          const incoming = io.readNonblock(4096, null, { exception: false });
          if (incoming === "wait_readable") {
            continue;
          } else if (incoming == null) {
            stream.close();
          } else {
            stream.receive(incoming);
          }
        } catch {
          try {
            stream.close();
          } catch {
            this._map.delete(io);
          }
        }
      }
    })();
  }

  detach(io: Io, _stream: Stream): void {
    this._map.delete(io);
    io.close();
  }

  /** @missingRailsCall wakeup — PERMANENT */
  stop(): void {
    this._stopping = true;
  }
}

rbDeclareIvar(StreamEventLoop, "@executor", "_executor");
rbModConstSet(Connection, "StreamEventLoop", StreamEventLoop);
