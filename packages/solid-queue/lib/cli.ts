import { type Hash, SystemExit, constSet } from "@blazetrails/ruby-compat";
import { SolidQueue } from "./solid-queue.js";
import { camelize } from "@blazetrails/activesupport";
import { Thor, type ThorClass } from "@blazetrails/thor";
import { Configuration } from "./configuration.js";
import { Supervisor } from "./supervisor.js";

export class Cli extends Thor {
  static {
    const klass = this as unknown as ThorClass;
    klass.classOption("config_file", {
      type: "string",
      aliases: "-c",
      desc: `Path to config file (default: ${Configuration.DEFAULT_CONFIG_FILE_PATH}).`,
      banner: "SOLID_QUEUE_CONFIG",
    });

    klass.classOption("mode", {
      type: "string",
      enum: ["fork", "async"],
      desc: "Whether to fork processes for workers and dispatchers (fork) or to run these in the same process as the supervisor (async) (default: fork).",
      banner: "SOLID_QUEUE_SUPERVISOR_MODE",
    });

    klass.classOption("recurring_schedule_file", {
      type: "string",
      desc: `Path to recurring schedule definition (default: ${Configuration.DEFAULT_RECURRING_SCHEDULE_FILE_PATH}).`,
      banner: "SOLID_QUEUE_RECURRING_SCHEDULE",
    });

    klass.classOption("skip_recurring", {
      type: "boolean",
      desc: "Whether to skip recurring tasks scheduling",
      banner: "SOLID_QUEUE_SKIP_RECURRING",
    });

    klass.classOption("only_recurring", {
      type: "boolean",
      desc: "Whether to run only the scheduler process for recurring tasks",
      banner: "SOLID_QUEUE_ONLY_RECURRING",
    });

    klass.desc(
      "start",
      "Starts Solid Queue supervisor to dispatch and perform enqueued jobs. Default command.",
    );
    klass.defaultCommand("start");
    klass.methodAdded("start");

    klass.desc(
      "check",
      "Validates the Solid Queue configuration for the current Rails env without starting anything. Exits non-zero on errors.",
    );
    klass.methodAdded("check");
  }

  static isExitOnFailure(): boolean {
    return true;
  }

  async start(): Promise<void> {
    const options = (this as unknown as { options: Hash<string, unknown> }).options;
    await Supervisor.start(
      Object.fromEntries(options.toA().map(([key, value]) => [camelize(key, false), value])),
    );
  }

  async check(): Promise<void> {
    const options = (this as unknown as { options: Hash<string, unknown> }).options;
    const configuration = new Configuration(
      Object.fromEntries(options.toA().map(([key, value]) => [camelize(key, false), value])),
    );
    if (!(await configuration.check())) throw new SystemExit(1);
  }
}

constSet(SolidQueue, "Cli", Cli);
