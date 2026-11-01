import { Interrupt, Shellwords, defineModule, env, rbFSystem } from "@blazetrails/ruby-compat";

interface EditorHost {
  currentSubcommand: string | null | undefined;
  editor(): string | undefined;
  displayHintIfSystemEditorNotSpecified(): boolean | undefined;
  executable(commandName?: string): string;
  say(message: string): void;
}

export const Editor = defineModule(
  {},
  {},
  {
    editor(): string | undefined {
      return (env.VISUAL ?? "") === "" ? env.EDITOR : env.VISUAL;
    },

    displayHintIfSystemEditorNotSpecified(this: EditorHost): boolean | undefined {
      if ((this.editor() ?? "") === "") {
        this.say("No $VISUAL or $EDITOR to open file in. Assign one like this:");
        this.say("");
        this.say(`VISUAL="code --wait" ${this.executable(this.currentSubcommand ?? undefined)}`);
        this.say("");
        this.say("For editors that fork and exit immediately, it's important to pass a wait flag;");
        this.say("otherwise, the file will be saved immediately with no chance to edit.");

        return true;
      }
    },

    async systemEditor(this: EditorHost, filePath: string): Promise<boolean | null> {
      return rbFSystem(...Shellwords.shellwords(this.editor()!), String(filePath));
    },

    async usingSystemEditor(this: EditorHost, block: () => Promise<void>): Promise<void> {
      try {
        if (!this.displayHintIfSystemEditorNotSpecified()) await block();
      } catch (e) {
        if (!(e instanceof Interrupt)) throw e;
        this.say("Aborted changing file: nothing saved.");
      }
    },
  },
);
