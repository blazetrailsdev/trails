import { NamedBase, type NamedBaseOptions } from "../../named-base.js";

export class ScriptGenerator extends NamedBase {
  constructor(options: NamedBaseOptions) {
    super(options);
  }

  run(): string[] {
    const ext = this.ext();
    const filename = `script/${this.filePath()}${ext}`;
    const upDots = "../".repeat(this.depth());

    this.createFile(
      filename,
      `import "${upDots}config/environment.js";

// Your code goes here
`,
    );
    return this.getCreatedFiles();
  }

  private depth(): number {
    return this.classPathParts.length + 1;
  }
}
