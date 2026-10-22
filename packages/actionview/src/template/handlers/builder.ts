import "@blazetrails/builder";
import { classAttribute } from "@blazetrails/activesupport";
import type { TemplateHandler } from "../handlers.js";

export class Builder implements TemplateHandler {
  declare static defaultFormat: string;

  static {
    classAttribute.call(this, "defaultFormat", { default: "xml" });
  }

  private _required?: boolean;

  call(_template: unknown, source: string): string {
    this.requireEngine();
    return (
      "const xml = new Builder.XmlMarkup({ indent: 2, target: outputBuffer.raw() });" +
      `${source};` +
      "return outputBuffer.toString();"
    );
  }

  /** @internal */
  private requireEngine(): boolean {
    return (this._required ??= true);
  }
}
