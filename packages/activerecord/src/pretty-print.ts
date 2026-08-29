import { rubyInspect } from "./relation/ruby-inspect.js";

export interface PrettyPrinter {
  text(str: string): void;
  breakable(sep?: string): void;
  group(indent: number, open: string, close: string, fn: () => void | Promise<void>): Promise<void>;
  seplist<I>(list: I[], sep: () => void, fn: (item: I) => void | Promise<void>): Promise<void>;
  objectAddressGroup(obj: object, fn: () => void | Promise<void>): Promise<void>;
  pp(obj: unknown): Promise<void>;
}

interface HasPrettyPrint {
  prettyPrint(pp: PrettyPrinter): void | Promise<void>;
}

function hasPrettyPrint(obj: unknown): obj is HasPrettyPrint {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as { prettyPrint?: unknown }).prettyPrint === "function"
  );
}

class PrettyPrint implements PrettyPrinter {
  private buf = "";

  text(str: string): void {
    this.buf += str;
  }

  breakable(sep = " "): void {
    this.buf += sep;
  }

  async group(
    _indent: number,
    open: string,
    close: string,
    fn: () => void | Promise<void>,
  ): Promise<void> {
    this.text(open);
    await fn();
    this.text(close);
  }

  async seplist<I>(
    list: I[],
    sep: () => void,
    fn: (item: I) => void | Promise<void>,
  ): Promise<void> {
    let first = true;
    for (const item of list) {
      if (!first) sep();
      first = false;
      await fn(item);
    }
  }

  async objectAddressGroup(obj: object, fn: () => void | Promise<void>): Promise<void> {
    const name = (obj as { constructor?: { name?: string } }).constructor?.name ?? "Object";
    this.text(`#<${name}`);
    await fn();
    this.text(">");
  }

  async pp(obj: unknown): Promise<void> {
    if (hasPrettyPrint(obj)) {
      await obj.prettyPrint(this);
      return;
    }
    if (Array.isArray(obj)) {
      await this.group(1, "[", "]", () =>
        this.seplist(
          obj,
          () => this.text(", "),
          (item) => this.pp(item),
        ),
      );
      return;
    }
    this.text(rubyInspect(obj));
  }

  flush(): string {
    return this.buf;
  }
}

export interface PPSink {
  write(str: string): void;
}

export async function pp(obj: unknown, io?: PPSink): Promise<string> {
  const printer = new PrettyPrint();
  await printer.pp(obj);
  const out = printer.flush();
  io?.write(`${out}\n`);
  return out;
}
