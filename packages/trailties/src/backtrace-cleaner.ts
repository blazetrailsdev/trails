import { BacktraceCleaner as Base } from "@blazetrails/activesupport";

export const APP_DIRS_PATTERN = /^(?:\.\/)?(?:app|config|lib|test|\(\w+(?:-\w+)*\))/;
export const RENDER_TEMPLATE_PATTERN = /:in [`'].*_\w+_{2,3}\d+_\d+'/;

export class BacktraceCleaner extends Base {
  private _root: string | undefined;

  constructor() {
    super();
    this.addFilter((line) => {
      const root = this._root;
      return root && line.startsWith(root) ? line.slice(root.length) : line;
    });
    this.addFilter((line) =>
      RENDER_TEMPLATE_PATTERN.test(line) ? line.replace(RENDER_TEMPLATE_PATTERN, "") : line,
    );
    this.addSilencer((line) => !APP_DIRS_PATTERN.test(line));
  }

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
