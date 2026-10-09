import { File, RuntimeError, StandardError } from "@blazetrails/ruby-compat";
import { parse as yamlParse } from "@blazetrails/ruby-compat/psych-adapter";
import { parse as tseParse } from "@blazetrails/tse-compiler";

export class FormatError extends StandardError {}

FormatError.prototype.name = "ActiveSupport::ConfigurationFile::FormatError";

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
    options: { context?: object; [option: string]: unknown } = {},
  ): unknown {
    return new ConfigurationFile(contentPath).parse(options);
  }

  /** @missingRailsCall load — PERMANENT */
  parse({ context, ...options }: { context?: object; [option: string]: unknown } = {}): unknown {
    const source = this.content.includes("<%") ? this.render(context) : this.content;
    try {
      const parsed: unknown = yamlParse(source, options);
      return parsed != null && parsed !== false ? parsed : {};
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new RuntimeError(
        `YAML syntax error occurred while parsing ${this.contentPath}. ` +
          `Please note that YAML must be consistently indented using spaces. Tabs are not allowed. ` +
          `Error: ${errorMessage}`,
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

  private render(context?: object): string {
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
    const template = new Function("__binding", `with (__binding) {\n${body}}`) as (
      binding: object,
    ) => string;
    return context ? template(context) : template({});
  }

  static FormatError = FormatError;
}
