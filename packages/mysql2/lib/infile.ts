import { Errno, File, Thread } from "@blazetrails/ruby-compat";

const CR_UNKNOWN_ERROR = 2000;

interface Mysql2LocalInfileData {
  fd: File | null;
  filename: string;
  error: string;
}

type Listener = (arg?: unknown) => void;

function strerror(e: unknown): string {
  const klass = Errno[(e as { code?: string } | null)?.code as keyof typeof Errno];
  if (klass === undefined) throw e;
  return new klass().message;
}

async function mysql2LocalInfileInit(
  ptr: { data?: Mysql2LocalInfileData },
  filename: string,
): Promise<number> {
  const data: Mysql2LocalInfileData = { fd: null, filename, error: "" };
  ptr.data = data;
  try {
    data.fd = await File.openAsync(filename, "rb");
  } catch (e) {
    data.error = `${strerror(e)}: ${filename}`;
    return 1;
  }
  return 0;
}

async function mysql2LocalInfileRead(
  data: Mysql2LocalInfileData,
  bufLen: number,
): Promise<Uint8Array | null> {
  try {
    return await data.fd!.readAsync(bufLen);
  } catch (e) {
    data.error = `${strerror(e)}: ${data.filename}`;
    throw e;
  }
}

function mysql2LocalInfileEnd(data: Mysql2LocalInfileData | undefined): void {
  data?.fd?.close();
}

function mysql2LocalInfileError(data: Mysql2LocalInfileData | undefined): globalThis.Error {
  if (data) return Object.assign(new globalThis.Error(data.error), { errno: CR_UNKNOWN_ERROR });
  return Object.assign(new globalThis.Error("Out of memory"), { errno: 2008 });
}

export function mysql2SetLocalInfile(): (filename: string) => object {
  return (filename) => {
    const listeners: Record<string, Listener[]> = {};
    const emit = (event: string, arg?: unknown) => {
      for (const listener of listeners[event] ?? []) listener(arg);
    };
    let resume: (() => void) | null = null;
    let paused = false;
    const stream = {
      on(event: string, listener: Listener) {
        (listeners[event] ??= []).push(listener);
        return stream;
      },
      removeListener(event: string, listener: Listener) {
        listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener);
        return stream;
      },
      pause() {
        paused = true;
      },
      resume() {
        paused = false;
        resume?.();
        resume = null;
      },
    };
    new Thread(async () => {
      const ptr: { data?: Mysql2LocalInfileData } = {};
      try {
        if ((await mysql2LocalInfileInit(ptr, filename)) !== 0) {
          emit("error", mysql2LocalInfileError(ptr.data));
          return;
        }
        for (;;) {
          if (paused) await new Promise<void>((r) => (resume = r));
          const buf = await mysql2LocalInfileRead(ptr.data!, 16384);
          if (buf == null || buf.length === 0) break;
          emit(
            "data",
            Object.assign(buf, { copy: (target: Uint8Array, at: number) => target.set(buf, at) }),
          );
        }
        emit("end");
      } catch {
        emit("error", mysql2LocalInfileError(ptr.data));
      } finally {
        mysql2LocalInfileEnd(ptr.data);
      }
    });
    return stream;
  };
}
