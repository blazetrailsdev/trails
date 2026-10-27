import { File } from "../file.js";
import { warn } from "../kernel-warn.js";
import { rbObjRespondTo } from "../object.js";

interface Dev {
  write(message: string): unknown;
  close?(): unknown;
}

/**
 * Ruby stdlib `Logger::LogDevice` (`vendor/ruby/v3.3.11/lib/logger/log_device.rb:7`).
 *
 * @missingRailsCall mon_initialize — CONVERGEABLE ruby-compat-logger-log-device-file-arms
 * @missingRailsCall next_rotate_time — CONVERGEABLE ruby-compat-logger-log-device-file-arms
 * @noRailsEquivalent PERMANENT
 */
export class LogDevice {
  /** @noRailsEquivalent PERMANENT */
  dev: Dev | null;
  /** @noRailsEquivalent PERMANENT */
  filename: string | null;
  private shiftAge: number | string | null;
  private shiftSize: number | null;
  private shiftPeriodSuffix: string | null;
  private binmode: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(
    log: unknown = null,
    {
      shiftAge = null,
      shiftSize = null,
      shiftPeriodSuffix = null,
      binmode = false,
    }: {
      shiftAge?: number | string | null;
      shiftSize?: number | null;
      shiftPeriodSuffix?: string | null;
      binmode?: boolean;
    } = {},
  ) {
    this.dev = this.filename = this.shiftAge = this.shiftSize = this.shiftPeriodSuffix = null;
    this.binmode = binmode;
    this.setDev(log);
    if (this.filename != null) {
      this.shiftAge = shiftAge ?? 7;
      this.shiftSize = shiftSize ?? 1048576;
      this.shiftPeriodSuffix = shiftPeriodSuffix ?? "%Y%m%d";
    }
  }

  /**
   * @missingRailsCall synchronize — CONVERGEABLE ruby-compat-logger-log-device-file-arms
   * @missingRailsCall check_shift_log — CONVERGEABLE ruby-compat-logger-log-device-file-arms
   * @noRailsEquivalent PERMANENT
   */
  write(message: string): void {
    try {
      this.dev!.write(message);
    } catch (error) {
      warn(`log writing failed. ${(error as Error).message}`);
    }
  }

  /**
   * @missingRailsCall synchronize — CONVERGEABLE ruby-compat-logger-log-device-file-arms
   * @noRailsEquivalent PERMANENT
   */
  close(): void {
    try {
      this.dev!.close!();
    } catch (error) {
      void error;
    }
  }

  /**
   * @missingRailsCall synchronize — CONVERGEABLE ruby-compat-logger-log-device-file-arms
   * @noRailsEquivalent PERMANENT
   */
  reopen(log: unknown = null): this {
    if (this.filename != null) log ??= this.filename;
    if (log != null) {
      if (this.filename != null && this.dev != null) {
        try {
          this.dev.close!();
        } catch (error) {
          void error;
        }
        this.filename = null;
      }
      this.setDev(log);
    }
    return this;
  }

  private setDev(log: unknown): void {
    if (rbObjRespondTo(log, "write")) {
      this.dev = log as Dev;
      const path = rbObjRespondTo(log, "path") ? (log as { path(): unknown }).path() : null;
      if (typeof path === "string") {
        if (File.isExist(path)) {
          this.filename = path;
        }
      }
    } else {
      const dev = this.openLogfile(log as string);
      dev.sync = true;
      if (this.binmode) dev.binmode();
      this.dev = dev;
      this.filename = log as string;
    }
  }

  /**
   * @missingRailsArgs open — CONVERGEABLE ruby-compat-logger-log-device-file-arms
   * @missingRailsCall create_logfile — CONVERGEABLE ruby-compat-logger-log-device-file-arms
   */
  private openLogfile(filename: string): File {
    return File.open(filename, "a");
  }
}
