import { compact } from "@blazetrails/ruby-compat";
import { NamedBase } from "./named-base.js";

export class Base extends NamedBase {
  protected formats(): string[] {
    return [this.format()];
  }

  protected format(): string {
    return "html";
  }

  protected handler(): string {
    return "tse";
  }

  protected filenameWithExtensions(name: string, fileFormat: string = this.format()): string {
    return compact([name, fileFormat, this.handler()]).join(".");
  }
}
