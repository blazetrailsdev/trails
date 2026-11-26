import { Dir, File, defineModule, included, setEnv } from "@blazetrails/ruby-compat";
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

    availableEnvironments(this: EnvironmentArgumentHost): string[] {
      return (this._availableEnvironments ||= Dir.glob("config/environments/*.ts").map((filename) =>
        File.basename(filename, ".*"),
      ));
    },

    expandEnvironmentName(this: EnvironmentArgumentHost, name: string): string {
      return (
        ["production", "development", "test"].find((fullName) => fullName.startsWith(name)) || name
      );
    },
  },
);
