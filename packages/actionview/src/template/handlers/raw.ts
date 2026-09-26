import type { TemplateHandler } from "../handlers.js";

export class Raw implements TemplateHandler {
  call(_template: unknown, source: string): string {
    return `return htmlSafe(${JSON.stringify(source)});`;
  }
}
