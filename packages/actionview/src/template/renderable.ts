import { ArgumentError } from "@blazetrails/ruby-compat";

export class Renderable {
  private readonly renderable: unknown;

  constructor(renderable: unknown) {
    this.renderable = renderable;
  }

  identifier(): string | undefined {
    return (this.renderable as object | null)?.constructor?.name;
  }

  render(context: unknown, ..._args: unknown[]): unknown {
    const renderable = this.renderable as { renderIn?: (context: unknown) => unknown } | null;
    try {
      return renderable!.renderIn!(context);
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
      if (typeof renderable?.renderIn !== "function") {
        throw new ArgumentError(
          `'${String(this.renderable)}' is not a renderable object. It must implement #render_in.`,
        );
      } else {
        throw error;
      }
    }
  }

  format(): unknown {
    const format = (this.renderable as { format?: unknown } | null)?.format;
    return typeof format === "function"
      ? (format as () => unknown).call(this.renderable)
      : undefined;
  }
}
