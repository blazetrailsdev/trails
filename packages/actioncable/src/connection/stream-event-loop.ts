import { ThreadPoolExecutor, TimerTask, rbDeclareIvar } from "@blazetrails/ruby-compat";

interface Io {
  waitReadable(): Promise<unknown>;
  readNonblock(
    len: number,
    buf: null,
    options: { exception: false },
  ): Uint8Array | "wait_readable" | null;
  close(): unknown;
  waitWritable(): Promise<unknown>;
}

interface Stream {
  receive(data: unknown): unknown;
  close(): unknown;
  flushWriteBuffer(): boolean;
}

interface Monitor {
  value: Stream;
  interests: "r" | "rw";
}

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
    this._map.set(io, { value: stream, interests: "r" });
    const monitor = this._map.get(io)!;
    void (async () => {
      while (!this._stopping && this._map.get(io) === monitor) {
        try {
          await io.waitReadable();
          if (this._map.get(io) !== monitor) break;

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

  writesPending(io: Io): void {
    const monitor = this._map.get(io);
    if (monitor == null || monitor.interests === "rw") return;
    monitor.interests = "rw";
    const stream = monitor.value;
    void (async () => {
      try {
        while (!this._stopping && this._map.get(io) === monitor) {
          await io.waitWritable();
          if (this._map.get(io) !== monitor) break;

          if (stream.flushWriteBuffer()) {
            monitor.interests = "r";
            break;
          }
        }
      } catch {
        try {
          stream.close();
        } catch {
          this._map.delete(io);
        }
      }
    })();
  }

  /** @missingRailsCall wakeup — PERMANENT */
  stop(): void {
    this._stopping = true;
  }
}

rbDeclareIvar(StreamEventLoop, "@executor", "_executor");
