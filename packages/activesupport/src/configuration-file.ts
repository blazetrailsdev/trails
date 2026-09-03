import { File } from "@blazetrails/ruby-compat";
import { parse as yamlParse } from "yaml";
import { parse as tseParse } from "@blazetrails/tse-compiler";

export class FormatError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "FormatError";
  }
}

export class ConfigurationFile {
  private content: string;
  private contentPath: string;

  constructor(contentPath: string) {
    this.contentPath = contentPath;
    this.content = this.read(contentPath);
  }

  /** @missingRailsCall load — PERMANENT */
  static parse(
    contentPath: string,
    options: { context?: Record<string, unknown>; [option: string]: unknown } = {},
  ): Record<string, unknown> {
    return new ConfigurationFile(contentPath).parse(options);
  }

  /** @missingRailsCall load — PERMANENT */
  parse({
    context,
    ...options
  }: { context?: Record<string, unknown>; [option: string]: unknown } = {}): Record<
    string,
    unknown
  > {
    const source = this.content.includes("<%") ? this.render(context) : this.content;
    try {
      const parsed = yamlParse(source, options);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new FormatError(
        `YAML syntax error occurred while parsing ${this.contentPath}. ` +
          `Please note that YAML must be consistently indented using spaces. Tabs are not allowed. ` +
          `Error: ${errorMessage}`,
        error,
      );
    }
  }

  private read(contentPath: string): string {
    const content = File.read(contentPath);
    if (content.includes("\u00A0")) {
      console.warn(
        `${contentPath} contains invisible non-breaking spaces, you may want to remove those`,
      );
    }
    return content;
  }

  private render(context?: Record<string, unknown>): string {
    const { nodes } = tseParse(this.content);
    let body = 'let __out = "";\n';
    for (const node of nodes) {
      switch (node.kind) {
        case "text":
          body += `__out += ${JSON.stringify(node.value)};\n`;
          break;
        case "expr":
        case "rawExpr":
          body += `__out += String(${node.value});\n`;
          break;
        case "code":
        case "blockExpr":
          body += `${node.value}\n`;
          break;
      }
    }
    body += `return __out;\n//# sourceURL=${this.contentPath}\n`;
    const names = context ? Object.keys(context) : [];
    const template = new Function(...names, body) as (...args: unknown[]) => string;
    return context ? template(...names.map((n) => context[n])) : template();
  }

  static FormatError = FormatError;
}
