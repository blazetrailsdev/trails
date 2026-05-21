import { Command } from "commander";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { editEncryptedFile, showEncryptedFile } from "../encrypted-file-editor.js";

interface Opts {
  key: string;
}

function buildFile(contentPath: string, opts: Opts): EncryptedFile {
  return new EncryptedFile({
    contentPath,
    keyPath: opts.key,
    envKey: "RAILS_MASTER_KEY",
    raiseIfMissingKey: true,
  });
}

async function missingMessage(file: EncryptedFile): Promise<string> {
  if (!(await file.isKey())) {
    return `Missing '${file.keyPath}' to decrypt data. See \`trails encrypted --help\`.`;
  }
  return `File '${file.contentPath}' does not exist. Use \`trails encrypted edit ${file.contentPath} --key ${file.keyPath}\` to change that.`;
}

export function encryptedCommand(): Command {
  const cmd = new Command("encrypted").description("Edit and show encrypted files");
  const keyOpt: [string, string, string] = [
    "-k, --key <path>",
    "Path to the encryption key (Rails.root-relative)",
    "config/master.key",
  ];

  cmd
    .command("edit <file>")
    .description("Open the decrypted file in `$VISUAL` or `$EDITOR` for editing")
    .option(...keyOpt)
    .action(async (file: string, opts: Opts) =>
      editEncryptedFile(buildFile(file, opts), `trails encrypted edit ${file}`),
    );

  cmd
    .command("show <file>")
    .description("Show the decrypted contents of the file")
    .option(...keyOpt)
    .action(async (file: string, opts: Opts) => {
      const enc = buildFile(file, opts);
      await showEncryptedFile(enc, await missingMessage(enc));
    });

  return cmd;
}
