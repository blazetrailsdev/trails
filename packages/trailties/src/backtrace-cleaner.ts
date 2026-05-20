// Port of `Rails::BacktraceCleaner` from
// `railties/lib/rails/backtrace_cleaner.rb`. Extends activesupport's
// BacktraceCleaner with Rails app-aware filters and silencers.
import { BacktraceCleaner as Base } from "@blazetrails/activesupport";

export const APP_DIRS_PATTERN = /^(?:\.\/)?(?:app|config|lib|test|\(\w+(?:-\w+)*\))/;
export const RENDER_TEMPLATE_PATTERN = /:in [`'].*_\w+_{2,3}\d+_\d+'/;

export class BacktraceCleaner extends Base {
  private _root: string | undefined;

  constructor() {
    super();
    this.addFilter((line) => {
      // We may be called before Rails.root is assigned.
      // When that happens we fallback to not truncating.
      const root = this._root;
      return root && line.startsWith(root) ? line.slice(root.length) : line;
    });
    this.addFilter((line) =>
      RENDER_TEMPLATE_PATTERN.test(line) ? line.replace(RENDER_TEMPLATE_PATTERN, "") : line,
    );
    this.addSilencer((line) => !APP_DIRS_PATTERN.test(line));
  }

  /** Sets the application root used to convert absolute paths to relative. */
  setRoot(root: string | undefined): this {
    this._root = root ? (root.endsWith("/") ? root : `${root}/`) : undefined;
    return this;
  }

  override dup(): this {
    const copy = super.dup();
    copy._root = this._root;
    return copy;
  }
}
