import { Command } from "commander";
import { DevCaching } from "../dev-caching.js";

export function devCommand(): Command {
  const cmd = new Command("dev");

  cmd
    .command("cache")
    .description("Toggle Action Controller development mode caching on/off")
    .action(() => {
      DevCaching.enableByFile();
    });

  return cmd;
}
