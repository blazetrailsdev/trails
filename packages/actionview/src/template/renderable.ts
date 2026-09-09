import { tryCall } from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/ruby-compat";

export class Renderable {
  private readonly renderable: unknown;

  constructor(renderable: unknown) {
    this.renderable = renderable;
  }

  identifier(): string {
    return this.renderable == null ? "NilClass" : (this.renderable as object).constructor.name;
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
    return tryCall(this.renderable as object, "format");
  }
}
