import { Command } from "commander";
import { Base } from "../command/base.js";
import { VERSION } from "../version.js";

export class VersionCommand extends Base {
  /** @missingRailsCall invoke — CONVERGEABLE port-application-command-and-argv-scrubber */
  perform(): void {
    this.say(`Trails ${VERSION}`);
  }
}

export function versionCommand(): Command {
  return new Command("version")
    .description("Show the Trails version")
    .action(() => new VersionCommand().perform());
}
