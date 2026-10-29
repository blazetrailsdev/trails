import { File } from "@blazetrails/ruby-compat";
import { GeneratorBase } from "@blazetrails/trailties/generators";

export class InstallGenerator extends GeneratorBase {
  static {
    void this.sourceRoot(
      File.expandPath("templates", decodeURIComponent(new URL(".", import.meta.url).pathname)),
    );
    this.methodAdded("copyFiles");
  }

  async copyFiles(): Promise<void> {
    await this.template("db/cable_schema.ts");
    await this.template("config/cable.ts", { force: true });
  }
}
