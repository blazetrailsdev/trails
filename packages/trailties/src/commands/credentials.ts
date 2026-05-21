import { Command } from "commander";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { editEncryptedFile, showEncryptedFile } from "../encrypted-file-editor.js";

interface Opts {
  environment?: string;
}

export function buildFile(opts: Opts): EncryptedFile {
  const env = opts.environment;
  const contentPath = env ? `config/credentials/${env}.yml.enc` : "config/credentials.yml.enc";
  const keyPath = env ? `config/credentials/${env}.key` : "config/master.key";
  return new EncryptedFile({
    contentPath,
    keyPath,
    envKey: "RAILS_MASTER_KEY",
    raiseIfMissingKey: true,
  });
}

async function missingMessage(file: EncryptedFile): Promise<string> {
  if (!(await file.isKey())) {
    return `Missing '${file.keyPath}' to decrypt credentials. See \`trails credentials --help\`.`;
  }
  return `File '${file.contentPath}' does not exist. Use \`trails credentials edit\` to change that.`;
}

export function credentialsCommand(): Command {
  const cmd = new Command("credentials").description("Edit and show encrypted credentials");
  const envOpt: [string, string] = [
    "-e, --environment <env>",
    "Use config/credentials/<env>.yml.enc and .key",
  ];

  cmd
    .command("edit")
    .description("Open the decrypted credentials in `$VISUAL` or `$EDITOR` for editing")
    .option(...envOpt)
    .action(async (opts: Opts) => editEncryptedFile(buildFile(opts), "trails credentials edit"));

  cmd
    .command("show")
    .description("Show the decrypted credentials")
    .option(...envOpt)
    .action(async (opts: Opts) => {
      const file = buildFile(opts);
      await showEncryptedFile(file, await missingMessage(file));
    });

  return cmd;
}
