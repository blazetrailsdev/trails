import type { TemplateHandler } from "../handlers.js";

export class Raw implements TemplateHandler {
  readonly extensions = ["raw", "txt", "html", "ruby"];

  call(_template: unknown, source: string): string {
    return `htmlSafe(${JSON.stringify(source)});`;
  }
}
