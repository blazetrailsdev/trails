import { ThreadPoolExecutor, TimerTask, rbModConstSet } from "@blazetrails/ruby-compat";
import { Connection } from "../namespaces.js";

interface Io {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  off(event: string, listener: (...args: unknown[]) => void): unknown;
  destroy(): unknown;
}

interface Stream {
  receive(data: unknown): unknown;
  close(): unknown;
}

type Monitor = Record<"data" | "end" | "error", (...args: unknown[]) => void>;

export class StreamEventLoop {
  private _executor: ThreadPoolExecutor | null;
  private _map: Map<Io, Monitor>;
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
    const monitor: Monitor = {
      data: (incoming) => {
        stream.receive(incoming);
      },
      end: () => {
        stream.close();
      },
      error: () => {
        try {
          stream.close();
        } catch {
          for (const [event, listener] of Object.entries(monitor)) io.off(event, listener);
          this._map.delete(io);
        }
      },
    };
    this._map.set(io, monitor);
    for (const [event, listener] of Object.entries(monitor)) io.on(event, listener);
  }

  detach(io: Io, _stream: Stream): void {
    const monitor = this._map.get(io);
    if (monitor) for (const [event, listener] of Object.entries(monitor)) io.off(event, listener);
    this._map.delete(io);
    io.destroy();
  }

  /** @missingRailsCall wakeup — PERMANENT */
  stop(): void {
    this._stopping = true;
  }
}

rbModConstSet(Connection, "StreamEventLoop", StreamEventLoop);
