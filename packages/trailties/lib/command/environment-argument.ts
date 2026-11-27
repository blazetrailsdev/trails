import { Dir } from "@blazetrails/ruby-compat/dir";
import { File } from "@blazetrails/ruby-compat/file";
import { defineModule, included } from "@blazetrails/ruby-compat/include";
import { setEnv } from "@blazetrails/ruby-compat/process-adapter";
import { requireApplicationBang } from "./actions.js";
import type { ThorClass } from "@blazetrails/thor";
import type { Base } from "./base.js";

interface EnvironmentArgumentHost {
  options: { environment?: string };
  _environment?: string | null;
  _environmentSpecified?: boolean;
  _availableEnvironments?: string[];
  environment(): string;
}

export const EnvironmentArgument = defineModule(
  {
    [included](base: typeof Base): void {
      (base as unknown as ThorClass).classOption("environment", {
        aliases: "-e",
        type: "string",
        desc: `The environment to run \`${base.commandName()}\` in (e.g. test / development / production).`,
      });
    },
  },
  {},
  {
    async requireApplicationBang(this: EnvironmentArgumentHost): Promise<void> {
      setEnv("TRAILS_ENV", this.environment());
      await requireApplicationBang();
    },

    environment(this: EnvironmentArgumentHost): string {
      return (this._environment ||= this.options.environment!);
    },

    setEnvironment(this: EnvironmentArgumentHost, environment: string | null | undefined): void {
      this._environment = environment;
    },

    isEnvironmentSpecified(this: EnvironmentArgumentHost): boolean {
      return this._environmentSpecified!;
    },

    /** @inventedArm filter — PERMANENT */
    availableEnvironments(this: EnvironmentArgumentHost): string[] {
      return (this._availableEnvironments ||= [
        ...new Set(
          Dir.glob("config/environments/*.{ts,js}")
            .filter((filename) => !filename.endsWith(".d.ts"))
            .map((filename) => File.basename(filename, ".*")),
        ),
      ]);
    },

    expandEnvironmentName(this: EnvironmentArgumentHost, name: string): string {
      return (
        ["production", "development", "test"].find((fullName) => fullName.startsWith(name)) || name
      );
    },
  },
);
