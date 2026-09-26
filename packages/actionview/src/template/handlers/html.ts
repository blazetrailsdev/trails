import { Raw } from "./raw.js";

export class Html extends Raw {
  override call(template: unknown, source: string): string {
    return super.call(template, source).replace(/^return (.*);$/su, "return new OutputBuffer($1);");
  }
}
