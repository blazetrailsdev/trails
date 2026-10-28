import { NamedBase } from "../../named-base.js";

export class ScriptGenerator extends NamedBase {
  static {
    this.methodAdded("generateScript");
  }

  /** @missingRailsCall template — CONVERGEABLE converge-generator-base-create-file-onto-thor-actions */
  generateScript(): void {
    const ext = this.ext();
    const filename = `script/${this.filePath()}${ext}`;
    const upDots = "../".repeat(this.depth());

    this.createFile(
      filename,
      `import "${upDots}config/environment${ext}";

// Your code goes here
`,
    );
  }

  private depth(): number {
    return this.classPathParts.length + 1;
  }
}
