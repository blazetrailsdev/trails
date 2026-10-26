import { camelize, transformKeys } from "@blazetrails/activesupport";
import { Thor, type ThorClass } from "@blazetrails/trailties/thor";
import { Configuration } from "./configuration.js";
import { Supervisor } from "./supervisor.js";

export class Cli extends Thor {
  static override toString(): string {
    return "SolidQueue::Cli";
  }

  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("config_file", {
      type: "string",
      aliases: "-c",
      desc: `Path to config file (default: ${Configuration.DEFAULT_CONFIG_FILE_PATH}).`,
      banner: "SOLID_QUEUE_CONFIG",
    });

    klass.classOption("recurring_schedule_file", {
      type: "string",
      desc: `Path to recurring schedule definition (default: ${Configuration.DEFAULT_RECURRING_SCHEDULE_FILE_PATH}).`,
      banner: "SOLID_QUEUE_RECURRING_SCHEDULE",
    });

    klass.classOption("skip_recurring", {
      type: "boolean",
      default: false,
      desc: "Whether to skip recurring tasks scheduling",
    });

    klass.desc(
      "start",
      "Starts Solid Queue supervisor to dispatch and perform enqueued jobs. Default command.",
    );
    klass.defaultCommand("start");
    klass.methodAdded("start");
  }

  static isExitOnFailure(): boolean {
    return true;
  }

  async start(): Promise<void> {
    const options = (this as unknown as { options: { [key: string]: unknown } }).options;
    await Supervisor.start(transformKeys({ ...options }, (key) => camelize(key, false)));
  }
}
