import { BacktraceCleaner as Base, TopLevel } from "@blazetrails/activesupport";

export const APP_DIRS_PATTERN = /^(?:\.\/)?(?:app|config|lib|test|\(\w+(?:-\w+)*\))/;
export const RENDER_TEMPLATE_PATTERN = /:in [`'].*_\w+_{2,3}\d+_\d+'/;

export class BacktraceCleaner extends Base {
  private _root: string | undefined;

  constructor() {
    super();
    this.addFilter((line) => {
      const root = TopLevel.Trails?.application?.config.root;
      this._root ||= root ? `${root}/` : undefined;
      return this._root && line.startsWith(this._root) ? line.slice(this._root.length) : line;
    });
    this.addFilter((line) =>
      RENDER_TEMPLATE_PATTERN.test(line) ? line.replace(RENDER_TEMPLATE_PATTERN, "") : line,
    );
    this.addSilencer((line) => !APP_DIRS_PATTERN.test(line));
  }

  override dup(): this {
    const copy = super.dup();
    copy._root = this._root;
    return copy;
  }
}
