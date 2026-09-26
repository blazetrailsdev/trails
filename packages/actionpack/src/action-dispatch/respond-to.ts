import { symbolToS } from "@blazetrails/ruby-compat";
import { UnknownFormat } from "../action-controller/metal/exceptions.js";
import { MimeType } from "./http/mime-type.js";

export type FormatHandler = () => unknown;

type Chain<R, T> = [R] extends [never] ? T : R;

export class Collector<H = FormatHandler, R = never, A = never> {
  private handlers: Map<string, H> = new Map();
  protected anyHandler: H | null = null;
  private _format: string | null = null;
  private _variant: string | null = null;
  private variantHandlers: Map<string, Map<string, FormatHandler>> = new Map();
  private anyVariantHandler: FormatHandler | null = null;

  html(handler?: H): Chain<R, this> {
    return this.on("html", handler);
  }
  json(handler?: H): Chain<R, this> {
    return this.on("json", handler);
  }
  xml(handler?: H): Chain<R, this> {
    return this.on("xml", handler);
  }
  js(handler?: H): Chain<R, this> {
    return this.on("js", handler);
  }
  text(handler?: H): Chain<R, this> {
    return this.on("text", handler);
  }
  csv(handler?: H): Chain<R, this> {
    return this.on("csv", handler);
  }
  atom(handler?: H): Chain<R, this> {
    return this.on("atom", handler);
  }
  rss(handler?: H): Chain<R, this> {
    return this.on("rss", handler);
  }
  yaml(handler?: H): Chain<R, this> {
    return this.on("yaml", handler);
  }
  pdf(handler?: H): Chain<R, this> {
    return this.on("pdf", handler);
  }

  on(format: string, handler?: H): Chain<R, this> {
    this.handlers.set(format, handler ?? ((() => undefined) as H));
    return this as unknown as Chain<R, this>;
  }

  any(handler?: H): Chain<A, this> {
    this.anyHandler = handler ?? ((() => undefined) as H);
    return this as unknown as Chain<A, this>;
  }

  protected handlerFor(format: string | null): H | undefined {
    return format === null ? undefined : this.handlers.get(format);
  }

  protected get hasAnyHandler(): boolean {
    return this.anyHandler !== null;
  }

  variant(name: string | string[], handler?: FormatHandler): this {
    const names = Array.isArray(name) ? name : [name];
    for (const n of names) {
      if (n === "any") {
        this.anyVariantHandler = handler ?? (() => undefined);
      } else {
        if (!this.variantHandlers.has(n)) {
          this.variantHandlers.set(n, new Map());
        }
        this.variantHandlers.get(n)!.set("_handler", handler ?? (() => undefined));
      }
    }
    return this;
  }

  get formats(): string[] {
    return [...this.handlers.keys()];
  }

  hasFormat(format: string): boolean {
    return this.handlers.has(format) || this.anyHandler !== null;
  }

  negotiate(
    options: {
      accept?: string;
      format?: string;
      variant?: string;
    } = {},
  ): { format: string; handler: H } | null {
    const { accept, format, variant } = options;
    this._variant = variant ?? null;

    if (format) {
      return this.resolveFormat(format);
    }

    if (accept) {
      const types = this.parseAccept(accept);
      for (const type of types) {
        if (type === "*/*") {
          const first = this.handlers.entries().next();
          if (!first.done) {
            this._format = first.value[0];
            return { format: first.value[0], handler: first.value[1] };
          }
          if (this.anyHandler) {
            this._format = "html";
            return { format: "html", handler: this.anyHandler };
          }
        }

        if (MimeType.isRegistered(type)) {
          const mimeType = MimeType.lookup(type);
          const result = this.resolveFormat(symbolToS(mimeType.symbol!));
          if (result) return result;
        }

        const result = this.resolveFormat(type);
        if (result) return result;
      }
    }

    if (!accept) {
      const first = this.handlers.entries().next();
      if (!first.done) {
        this._format = first.value[0];
        return { format: first.value[0], handler: first.value[1] };
      }
    }

    if (this.anyHandler) {
      const fmt = format ?? "html";
      this._format = fmt;
      return { format: fmt, handler: this.anyHandler };
    }

    return null;
  }

  get resolvedFormat(): string | null {
    return this._format;
  }

  private resolveFormat(format: string): { format: string; handler: H } | null {
    const handler = this.handlers.get(format);
    if (handler) {
      this._format = format;
      return { format, handler };
    }
    if (this.anyHandler) {
      this._format = format;
      return { format, handler: this.anyHandler };
    }
    return null;
  }

  private parseAccept(accept: string): string[] {
    return accept
      .split(",")
      .map((part) => {
        const [type, ...params] = part.trim().split(";");
        const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
        const quality = q ? parseFloat(q.slice(2)) : 1.0;
        return { type: type.trim(), quality };
      })
      .sort((a, b) => b.quality - a.quality)
      .map((entry) => entry.type);
  }
}

export function respondTo(
  block: (collector: Collector) => void,
  options: { accept?: string; format?: string; variant?: string } = {},
): unknown {
  const collector = new Collector();
  block(collector);

  const result = collector.negotiate(options);
  if (!result) {
    throw new UnknownFormat();
  }

  return result.handler();
}
