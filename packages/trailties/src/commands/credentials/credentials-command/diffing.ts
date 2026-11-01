import "../../../class-paths.diffing.generated.js";
import { root } from "../../../command.js";
import { Dir, File, Pathname, defineModule, rbFSystem } from "@blazetrails/ruby-compat";

export const GITATTRIBUTES_ENTRY = `config/credentials/*.yml.enc diff=rails_credentials
config/credentials.yml.enc diff=rails_credentials
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
        await File.writeAsync(this.gitattributes().toString(), GITATTRIBUTES_ENTRY, { mode: "a" });

        this.say("Enrolled project in credentials file diffing!");
        this.say("");
        this.say(
          `Rails will configure the Git diff driver for credentials when running \`${this.executable("edit")}\`. See \`${this.executable("help")}\` for more information.`,
        );
      }
    },

    /** @missingRailsCall delete — CONVERGEABLE pathname-answers-read-write-delete */
    async disenrollProjectFromCredentialsDiffing(this: DiffingHost): Promise<void> {
      if (await this.isEnrolledInCredentialsDiffing()) {
        const path = this.gitattributes().toString();
        const content = (await File.readAsync(path)).replaceAll(GITATTRIBUTES_ENTRY, "");
        await File.writeAsync(path, content);
        if (content === "") await File.deleteAsync(path);

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
      const path = this.gitattributes().toString();
      return (
        (await File.isFileAsync(path)) && (await File.readAsync(path)).includes(GITATTRIBUTES_ENTRY)
      );
    },

    async isDiffingDriverConfigured(): Promise<boolean | null> {
      return rbFSystem("git config --get diff.rails_credentials.textconv", { out: File.NULL });
    },

    async configureDiffingDriver(this: DiffingHost): Promise<void> {
      await rbFSystem(`git config diff.rails_credentials.textconv '${this.executable("diff")}'`);
      this.say("Configured Git diff driver for credentials.");
    },

    gitattributes(this: DiffingHost): Pathname {
      return (this._gitattributes ??= (root() ?? new Pathname(Dir.pwd())).join(".gitattributes"));
    },
  },
);
