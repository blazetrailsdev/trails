import "../constants.devcontainer.generated.js";
import { chomp } from "@blazetrails/activesupport";
import { File } from "@blazetrails/ruby-compat/file";
import { constDefined } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import type { ThorClass } from "@blazetrails/thor";
import { Base } from "../command/base.js";
import { DevcontainerGenerator } from "../generators/trails/devcontainer/devcontainer-generator.js";
import { Trails } from "../trails.js";

export class DevcontainerCommand extends Base {
  /** @internal */
  private _devcontainerOptions?: Record<string, unknown>;

  static {
    const klass = this as unknown as ThorClass;
    klass.desc(
      "devcontainer",
      "Generate a Dev Container setup based on current application configuration",
    );
    klass.methodAdded("perform");
  }

  async perform(..._args: unknown[]): Promise<void> {
    await this.bootApplicationBang();

    this.say("Generating Dev Container with the following options:");
    for (const [option, value] of Object.entries(await this.devcontainerOptions())) {
      this.say(`${option}: ${String(value)}`);
    }

    await new DevcontainerGenerator([], await this.devcontainerOptions()).invokeAll();
  }

  /** @internal */
  private async devcontainerOptions(): Promise<Record<string, unknown>> {
    return (this._devcontainerOptions ??= {
      appName: chomp(Trails.application!.railtieName, "_application"),
      database: constDefined(TopLevel, "ActiveRecord") && this.database(),
      activeStorage: constDefined(TopLevel, "ActiveStorage"),
      redis:
        (constDefined(TopLevel, "ActionCable") && !constDefined(TopLevel, "SolidCable")) ||
        (constDefined(TopLevel, "ActiveJob") && !constDefined(TopLevel, "SolidQueue")),
      systemTest: await File.isExistAsync("test/application-system-test-case.ts"),
      node: await File.isExistAsync(".node-version"),
      kamal: await File.isExistAsync("config/deploy.yml"),
    });
  }

  /** @internal */
  private database(): string {
    const adapter = (
      TopLevel as unknown as {
        ActiveRecord: { Base: { connectionDbConfig(): { adapter: string } } };
      }
    ).ActiveRecord.Base.connectionDbConfig().adapter;
    return adapter === "mysql2" ? "mysql" : adapter;
  }
}
