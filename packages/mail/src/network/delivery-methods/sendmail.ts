import { IO, Process, StandardError, rbInspect, warn } from "@blazetrails/ruby-compat";
import { SmtpEnvelope } from "../../smtp-envelope.js";
import { Utilities } from "../../utilities.js";
import type { Message } from "../../message.js";

export class DeliveryError extends StandardError {}

export class Sendmail {
  static readonly DEFAULTS: Record<string, unknown> = {
    location: "/usr/sbin/sendmail",
    arguments: ["-i"],
  };

  static readonly DeliveryError = DeliveryError;

  settings: Record<string, unknown>;

  constructor(values: Record<string, unknown>) {
    if (typeof values.arguments === "string") {
      this.deprecationWarn()(
        "Initializing Mail::Sendmail with :arguments of type String is deprecated." +
          ' Instead ensure :arguments is an array of strings, e.g. ["-i", "-t"]',
      );
    }
    this.settings = { ...(this.constructor as typeof Sendmail).DEFAULTS, ...values };
  }

  destinationsFor(envelope: SmtpEnvelope): string[] | null {
    return envelope.to;
  }

  async deliverBang(mail: Message): Promise<unknown> {
    const envelope = new SmtpEnvelope(mail);

    const arguments_ = this.settings.arguments;
    if (typeof arguments_ === "string") {
      return this.oldDeliver(envelope);
    }

    const command: string[] = [this.settings.location as string];
    command.push(
      ...(arguments_ == null ? [] : Array.isArray(arguments_) ? arguments_ : [arguments_]),
    );
    if (envelope.from) command.push("-f", envelope.from);

    const destinations = this.destinationsFor(envelope);
    if (destinations != null) {
      command.push("--");
      command.push(...destinations);
    }

    return this.popen(command, (io) => {
      io.puts(Utilities.binaryUnsafeToLf(envelope.message));
      io.flush();
    });
  }

  /** @internal */
  async popen(command: string[] | string, block: (io: IO) => unknown): Promise<unknown> {
    const result = await IO.popen(command, "w+", { err: "out" }, block as never);
    if (Process.lastStatus!.exitstatus() !== 0) {
      throw new DeliveryError(
        `Delivery failed with exitstatus ${Process.lastStatus!.exitstatus()}: ${rbInspect(command)}`,
      );
    }
    return result;
  }

  /** @internal */
  async oldDeliver(envelope: SmtpEnvelope): Promise<unknown> {
    const smtpFrom = envelope.from;
    const smtpTo = this.destinationsFor(envelope)!;

    const from = smtpFrom ? `-f ${this.shellquote(smtpFrom)}` : "";
    const destination = smtpTo.map((to) => this.shellquote(to)).join(" ");

    const arguments_ = `${this.settings.arguments as string} ${from} --`;
    const command = `${this.settings.location as string} ${arguments_} ${destination}`;
    return this.popen(command, (io) => {
      io.puts(Utilities.binaryUnsafeToLf(envelope.message));
      io.flush();
    });
  }

  /** @internal */
  shellquote(address: string): string {
    const escaped = address.replace(/([^A-Za-z0-9_\s+\-.,:/@~])/g, "\\$1").replaceAll("\n", "");
    return `"${escaped}"`;
  }

  /** @internal */
  deprecationWarn(): (message: string) => unknown {
    return warn;
  }
}
