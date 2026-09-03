export class MissingRenderer extends Error {
  constructor(format: string) {
    super(`No renderer defined for format: ${format}`);
    this.name = "MissingRenderer";
  }
}

export type RendererProc = (value: unknown, options: Record<string, unknown>) => string;

const RENDERERS = new Set<string>();

export class Renderers {
  private static _registry = new Map<string, RendererProc>();

  static get RENDERERS(): ReadonlySet<string> {
    return new Set(RENDERERS);
  }

  static _renderWithRendererMethodName(key: string): string {
    return `_render_with_renderer_${key}`;
  }

  static add(key: string, block: RendererProc): void {
    RENDERERS.add(key);
    this._registry.set(this._renderWithRendererMethodName(key), block);
  }

  static remove(key: string): void {
    RENDERERS.delete(key);
    this._registry.delete(this._renderWithRendererMethodName(key));
  }

  static get(key: string): RendererProc | undefined {
    return this._registry.get(this._renderWithRendererMethodName(key));
  }

  static _renderToBodyWithRenderer(options: Record<string, unknown>): string | null {
    for (const name of RENDERERS) {
      if (Object.hasOwn(options, name)) {
        const methodName = this._renderWithRendererMethodName(name);
        const renderer = this._registry.get(methodName);
        if (renderer) return renderer(options[name], options);
      }
    }
    return null;
  }

  /** @deprecated */
  static renderToBody(options: Record<string, unknown>): string | null {
    return this._renderToBodyWithRenderer(options);
  }

  static useRenderers(...args: string[]): void {
    for (const name of args) {
      RENDERERS.add(name);
    }
  }
}
