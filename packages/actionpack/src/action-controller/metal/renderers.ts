/**
 * ActionController::Renderers
 *
 * Registry for renderer procs (:json, :js, :xml, etc.).
 * @see https://api.rubyonrails.org/classes/ActionController/Renderers.html
 */

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

  static add(key: string, block: RendererProc): void {
    RENDERERS.add(key);
    this._registry.set(key, block);
  }

  static remove(key: string): void {
    RENDERERS.delete(key);
    this._registry.delete(key);
  }

  static get(key: string): RendererProc | undefined {
    return this._registry.get(key);
  }

  static renderToBody(options: Record<string, unknown>): string | null {
    for (const name of RENDERERS) {
      if (name in options) {
        const renderer = this._registry.get(name);
        if (renderer) return renderer(options[name], options);
      }
    }
    return null;
  }

  static useRenderers(...renderers: string[]): void {
    for (const name of renderers) {
      RENDERERS.add(name);
    }
  }
}
