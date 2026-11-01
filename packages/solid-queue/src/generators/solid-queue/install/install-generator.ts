import { File } from "@blazetrails/ruby-compat";
import { chmod, gsubFile, prependToFile } from "@blazetrails/thor/actions/file-manipulation";
import { GeneratorBase } from "@blazetrails/trailties/generators";

export class InstallGenerator extends GeneratorBase {
  static {
    void this.sourceRoot(
      File.expandPath("templates", decodeURIComponent(new URL(".", import.meta.url).pathname)),
    );
    this.methodAdded("copyFiles");
    this.methodAdded("configureAdapterAndDatabase");
  }

  async copyFiles(): Promise<void> {
    await this.template("config/queue.yml");
    await this.template("config/recurring.yml");
    await this.template("db/queue_schema.ts");
    await this.template("bin/jobs");
    await chmod.call(this as never, "bin/jobs", 0o755, { verbose: false });
  }

  async configureAdapterAndDatabase(): Promise<void> {
    await prependToFile.call(
      this as never,
      "config/application.ts",
      'import "@blazetrails/solid-queue";\n',
    );

    const pathname = File.join(this.destinationRoot, "config/environments/production.ts");

    await gsubFile.call(
      this as never,
      pathname,
      /\n\s*this\.config\.solidQueue\.connectsTo\s+=.*\n/,
      "\n",
      {
        verbose: false,
      },
    );
    await gsubFile.call(
      this as never,
      pathname,
      /(\/\/ )?this\.config\.activeJob\.queueAdapter\s+=.*\n/,
      'this.config.activeJob.queueAdapter = "solid_queue";\n' +
        '  this.config.solidQueue.connectsTo = { database: { writing: ":queue" } };\n',
    );
  }
}
