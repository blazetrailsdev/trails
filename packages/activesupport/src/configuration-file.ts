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

  /**
   * @missingRailsCall load — PERMANENT: configuration_file.rb:26-28 `YAML.unsafe_load_file`
   *   / `YAML.load_file` — Ruby's YAML/Psych is stdlib with no port; trails
   *   reads the file through the async fs adapter and hands the source to its
   *   own YAML parser, so no `load` call exists to make.
   */
  static parse(
    contentPath: string,
    options: { context?: Record<string, unknown>; [option: string]: unknown } = {},
  ): Record<string, unknown> {
    return new ConfigurationFile(contentPath).parse(options);
  }

  /**
   * Mirrors `ConfigurationFile#parse` (configuration_file.rb:21-41). Rails'
   * rendered/raw split picks `YAML.unsafe_load` over `unsafe_load_file` (:24-34);
   * one `yamlParse(source)` covers both, since the content is already read. The
   * `render` call stays outside the `try` because Rails' rescue names
   * `Psych::SyntaxError` alone, so a template error escapes unwrapped.
   *
   * Rails' `**options` are Psych loader options, forwarded verbatim to the
   * `yaml` package's own loader options. Three Psych keys have no analogue
   * there and are inert rather than dropped in silence: `aliases:` (the `yaml`
   * loader always resolves aliases, so Rails' `aliases: true` — the form
   * `Rails::Application::Configuration#database_configuration` passes — is
   * already the behaviour, and `aliases: false` has no off switch short of
   * `maxAliasCount: 0`), `permitted_classes:` / `permitted_symbols:` (the
   * `yaml` loader builds only JSON-shaped values, never arbitrary class
   * instances or Symbols, so there is nothing to permit), and `freeze:` (no
   * deep-freeze pass). Everything else — `merge:`, `version:`, `schema:`,
   * `maxAliasCount:` — reaches the loader.
   *
   * @missingRailsCall load — PERMANENT: configuration_file.rb:26-28 `YAML.unsafe_load_file`
   *   / `YAML.load_file` — Ruby's YAML/Psych is stdlib with no port; trails
   *   reads the file through the async fs adapter and hands the source to its
   *   own YAML parser, so no `load` call exists to make.
   */
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
