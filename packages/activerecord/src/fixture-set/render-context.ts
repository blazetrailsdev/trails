/**
 * Fixture render context — provides the evaluation context for
 * fixture templates (ERB in Rails, template literals in TS).
 *
 * Mirrors: ActiveRecord::FixtureSet::RenderContext
 */

export class RenderContext {
  private _helpers = new Map<string, () => unknown>();

  registerHelper(name: string, fn: () => unknown): void {
    this._helpers.set(name, fn);
  }

  getHelper(name: string): (() => unknown) | undefined {
    return this._helpers.get(name);
  }

  render(template: string, locals: Record<string, unknown> = {}): string {
    return template.replace(/\$\{(\w+)\}/g, (_match, key) => {
      if (Object.prototype.hasOwnProperty.call(locals, key)) {
        const value = locals[key];
        return value == null ? "" : String(value);
      }
      const helper = this._helpers.get(key);
      if (helper) {
        const value = helper();
        return value == null ? "" : String(value);
      }
      throw new Error(`Unknown fixture placeholder: ${key}`);
    });
  }
}
