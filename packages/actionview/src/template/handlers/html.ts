import { Raw } from "./raw.js";

export class Html extends Raw {
  override call(template: unknown, source: string): string {
    return `new OutputBuffer(${super.call(template, source).replace(/;$/u, "")});`;
  }
}
