import { getFs } from "./fs-adapter.js";
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

  static parse(
    contentPath: string,
    options: { context?: Record<string, unknown> } = {},
  ): Record<string, unknown> {
    return new ConfigurationFile(contentPath).parse(options);
  }

  parse({ context }: { context?: Record<string, unknown> } = {}): Record<string, unknown> {
    // Rails: `source = @content.include?("<%") ? render(context) : @content`
    // (configuration_file.rb:22). The rendered/raw split then decides between
    // `YAML.unsafe_load` and `unsafe_load_file` (:24-34) — one `yamlParse(source)`
    // here, since we already hold the file's content either way.
    //
    // The `render` call sits outside the `try` on purpose: Rails' rescue names
    // `Psych::SyntaxError` only, so a template error raised by `render` escapes
    // unwrapped and keeps the `sourceURL` frame the backtrace test asserts on.
    const source = this.content.includes("<%") ? this.render(context) : this.content;
    try {
      const parsed = yamlParse(source);
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

  /** Mirrors the private `read` (configuration_file.rb:44-52). */
  private read(contentPath: string): string {
    const content = getFs().readFileSync(contentPath, "utf8");
    if (content.includes("\u00A0")) {
      console.warn(
        `${contentPath} contains invisible non-breaking spaces, you may want to remove those`,
      );
    }
    return content;
  }

  /**
   * Mirrors the private `render` (configuration_file.rb:54-58).
   *
   * Rails compiles the file with `ERB.new(@content)`, stamps `e.filename =
   * @content_path` so raises inside the template point at the config file, and
   * evaluates it — against `context` (a Binding) when one is given, otherwise
   * against ERB's own. trails' TSE template pipeline is compile-time and lives
   * in actionview, above activesupport, so the ERB seat is taken here by the
   * dependency-free `@blazetrails/tse-compiler` parser plus a plain `Function`
   * — the same "compile the template to source, then eval it" shape ERB has.
   * `context`'s keys become the template's locals, standing in for the names a
   * Binding brings into scope; `//# sourceURL` is `e.filename`, and it is what
   * puts `@content_path` in the stack of a raise from inside the template.
   *
   * No HTML escaping: Ruby's stdlib ERB does not escape either, and a config
   * file is not markup.
   */
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
