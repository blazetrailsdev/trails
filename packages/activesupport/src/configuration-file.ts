import { readFileSync } from "node:fs";
import { parse as yamlParse } from "yaml";

export class ConfigurationFile {
  private content: string;
  private contentPath: string;

  constructor(contentPath: string) {
    this.contentPath = contentPath;
    this.content = readFileSync(contentPath, "utf8");
  }

  static parse(contentPath: string): Record<string, unknown> {
    return new ConfigurationFile(contentPath).parse();
  }

  parse(): Record<string, unknown> {
    if (this.content.includes("\u00A0")) {
      console.warn(
        `${this.contentPath} contains invisible non-breaking spaces, you may want to remove those`,
      );
    }

    try {
      const parsed = yamlParse(this.content);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ConfigurationFile.FormatError(
        `YAML syntax error occurred while parsing ${this.contentPath}. ` +
          `Please note that YAML must be consistently indented using spaces. Tabs are not allowed. ` +
          `Error: ${errorMessage}`,
        error,
      );
    }
  }

  static FormatError = class FormatError extends Error {
    constructor(message: string, cause?: unknown) {
      super(message, cause !== undefined ? { cause } : undefined);
      this.name = "FormatError";
    }
  };
}
