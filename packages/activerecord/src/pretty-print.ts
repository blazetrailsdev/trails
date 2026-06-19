import { rubyInspect } from "./relation/ruby-inspect.js";

/**
 * Minimal subset of Ruby's `PP` / `PrettyPrint`, enough to drive the
 * `obj.prettyPrint(pp)` protocol the way `PP.pp(obj, io)` does in Rails.
 *
 * JS has no `pp` library, so rather than leave `Relation` / `CollectionProxy`
 * with no pretty-printer protocol at all (the deviation surfaced by
 * `AssociationProxyTest#test_pretty_print`), we provide just the protocol
 * surface that those `prettyPrint` methods call: `pp(obj)`, `text`,
 * `breakable`, `group`, `seplist`, and `objectAddressGroup`. The driver is
 * async because loading an unloaded relation/proxy target is async in trails
 * (Rails performs blocking DB I/O inside `pretty_print`).
 *
 * Mirrors: Ruby's `PP` (stdlib `pp`) — the narrow slice exercised by
 * ActiveRecord's `Core#pretty_print`, `Relation#pretty_print`, and
 * `CollectionProxy#pretty_print`.
 */
export interface PrettyPrinter {
  /** Append literal text. Mirrors `PP#text`. */
  text(str: string): void;
  /** Append a separator (a soft line break renders as a space here). Mirrors `PP#breakable`. */
  breakable(sep?: string): void;
  /** Wrap `fn`'s output in `open`/`close`. Mirrors `PP#group`. */
  group(indent: number, open: string, close: string, fn: () => void | Promise<void>): Promise<void>;
  /** Render `list`, calling `sep` between items. Mirrors `PP#seplist`. */
  seplist<I>(list: I[], sep: () => void, fn: (item: I) => void | Promise<void>): Promise<void>;
  /** Wrap `fn` in `#<ClassName ...>`. Mirrors `PP#object_address_group`. */
  objectAddressGroup(obj: object, fn: () => void | Promise<void>): Promise<void>;
  /** Pretty-print `obj`, dispatching to `obj.prettyPrint(this)` when defined. Mirrors `PP#pp`. */
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

/** Minimal IO sink, mirroring the `out` argument of Ruby's `PP.pp(obj, out)`. */
export interface PPSink {
  write(str: string): void;
}

/**
 * Pretty-print `obj` to `io` (defaulting to a throwaway sink), returning the
 * rendered string. Mirrors Ruby's `PP.pp(obj, out = $>)`, which writes
 * `"#{output}\n"` to `out` and returns the output.
 */
export async function pp(obj: unknown, io?: PPSink): Promise<string> {
  const printer = new PrettyPrint();
  await printer.pp(obj);
  const out = printer.flush();
  io?.write(`${out}\n`);
  return out;
}
