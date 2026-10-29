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
    const selectWritable = (monitor: Monitor) => {
      void (async () => {
        while (!this._stopping && this._map.get(io) === monitor && monitor.interests === "rw") {
          let stream: Stream | null = null;
          try {
            await io.waitWritable();
            if (this._map.get(io) !== monitor) break;
            stream = monitor.value;

            if (stream.flushWriteBuffer()) {
              monitor.interests = "r";
            }
          } catch {
            try {
              (stream ?? monitor.value).close();
            } catch {
              this._map.delete(io);
            }
          }
        }
      })();
    };
    let interests: "r" | "rw" = "r";
    this._map.set(io, {
      value: null!,
      get interests() {
        return interests;
      },
      set interests(value) {
        const selectingWritable = interests === "rw";
        interests = value;
        if (value === "rw" && !selectingWritable) selectWritable(this);
      },
    });
    this._map.get(io)!.value = stream;
    const monitor = this._map.get(io)!;
    void (async () => {
      while (!this._stopping && this._map.get(io) === monitor) {
        let stream: Stream | null = null;
        try {
          await io.waitReadable();
          if (this._map.get(io) !== monitor) break;
          stream = monitor.value;

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
            (stream ?? monitor.value).close();
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
    if (monitor != null) {
      monitor.interests = "rw";
    }
  }

  /** @missingRailsCall wakeup — PERMANENT */
  stop(): void {
    this._stopping = true;
  }
}

rbDeclareIvar(StreamEventLoop, "@executor", "_executor");
