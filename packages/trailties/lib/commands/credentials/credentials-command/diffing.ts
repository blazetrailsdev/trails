import "../../../constants.credentials-credentials-command-diffing.generated.js";
import { root } from "../../../command.js";
import { Dir, File, Pathname, defineModule, rbFSystem } from "@blazetrails/ruby-compat";

export const GITATTRIBUTES_ENTRY = `config/credentials/*.yml.enc diff=trails_credentials
config/credentials.yml.enc diff=trails_credentials
`;

interface DiffingHost {
  _gitattributes?: Pathname;
  gitattributes(): Pathname;
  isEnrolledInCredentialsDiffing(): Promise<boolean>;
  isDiffingDriverConfigured(): Promise<boolean | null>;
  configureDiffingDriver(): Promise<void>;
  executable(commandName?: string): string;
  say(message: string): void;
}

export const Diffing = defineModule(
  { GITATTRIBUTES_ENTRY },
  {
    async enrollProjectInCredentialsDiffing(this: DiffingHost): Promise<void> {
      if (await this.isEnrolledInCredentialsDiffing()) {
        this.say("Project is already enrolled in credentials file diffing.");
      } else {
        await this.gitattributes().write(GITATTRIBUTES_ENTRY, { mode: "a" });

        this.say("Enrolled project in credentials file diffing!");
        this.say("");
        this.say(
          `Trails will configure the Git diff driver for credentials when running \`${this.executable("edit")}\`. See \`${this.executable("help")}\` for more information.`,
        );
      }
    },

    async disenrollProjectFromCredentialsDiffing(this: DiffingHost): Promise<void> {
      if (await this.isEnrolledInCredentialsDiffing()) {
        await this.gitattributes().write(
          (await this.gitattributes().read()).replaceAll(GITATTRIBUTES_ENTRY, ""),
        );
        if (await this.gitattributes().isEmpty()) await this.gitattributes().delete();

        this.say("Disenrolled project from credentials file diffing!");
      } else {
        this.say("Project is not enrolled in credentials file diffing.");
      }
    },

    async ensureDiffingDriverIsConfigured(this: DiffingHost): Promise<void> {
      if (
        (await this.isEnrolledInCredentialsDiffing()) &&
        !(await this.isDiffingDriverConfigured())
      )
        await this.configureDiffingDriver();
    },
  },
  {
    async isEnrolledInCredentialsDiffing(this: DiffingHost): Promise<boolean> {
      return (
        (await this.gitattributes().isFile()) &&
        (await this.gitattributes().read()).includes(GITATTRIBUTES_ENTRY)
      );
    },

    async isDiffingDriverConfigured(): Promise<boolean | null> {
      return rbFSystem("git config --get diff.trails_credentials.textconv", { out: File.NULL });
    },

    async configureDiffingDriver(this: DiffingHost): Promise<void> {
      await rbFSystem(`git config diff.trails_credentials.textconv '${this.executable("diff")}'`);
      this.say("Configured Git diff driver for credentials.");
    },

    gitattributes(this: DiffingHost): Pathname {
      return (this._gitattributes ??= (root() ?? new Pathname(Dir.pwd())).join(".gitattributes"));
    },
  },
);
