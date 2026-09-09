import type { CompiledMethodContainer } from "../base.js";
import { Template } from "../template.js";

export class Inline extends Template {
  protected override compile(mod: CompiledMethodContainer): void {
    super.compile(mod);
  }
}
