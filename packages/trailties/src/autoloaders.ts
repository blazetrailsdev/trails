import { Loader } from "@blazetrails/zeitwerk";
import { include } from "@blazetrails/activesupport";
import { Enumerable, type Included } from "@blazetrails/ruby-compat";
import { Inflector } from "./autoloaders/inflector.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging
export interface Autoloaders extends Included<typeof Enumerable> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Autoloaders {
  readonly main: Loader;
  readonly once: Loader;

  constructor() {
    this.main = new Loader();
    this.main.tag = "rails.main";
    this.main.inflector = Inflector as unknown as Loader["inflector"];

    this.once = new Loader();
    this.once.tag = "rails.once";
    this.once.inflector = Inflector as unknown as Loader["inflector"];
  }

  each(block: (loader: Loader) => void): void {
    block(this.main);
    block(this.once);
  }

  set logger(logger: Loader["logger"]) {
    this.each((loader) => {
      loader.logger = logger;
    });
  }

  logBang(): void {
    this.each((loader) => loader.logBang());
  }

  isZeitwerkEnabled(): boolean {
    return true;
  }
}

include(Autoloaders, Enumerable);
