import { ArgumentError, RuntimeError } from "@blazetrails/ruby-compat";

type Action = (() => unknown) | ((times: number) => unknown);

export class Entry {
  readonly label: string;
  readonly action: Action | Entry;

  constructor(label: string, action: Action | string) {
    this.label = label;

    if (typeof action === "string") {
      this.compileString(action);
      this.action = this;
    } else {
      if (typeof action !== "function") {
        throw new ArgumentError("invalid action, must respond to #call");
      }

      this.action = action;

      if (action.length > 0) {
        this.compileBlockWithManualLoop();
      } else {
        this.compileBlock();
      }
    }
  }

  callTimes(_times: number): void {
    throw new RuntimeError(
      "#call_times should be redefined per Benchmark::IPS::Job::Entry instance",
    );
  }

  compileBlock(): void {
    this.callTimes = function (this: Entry, times: number): void {
      const act = this.action as () => unknown;

      let i = 0;
      while (i < times) {
        act();
        i += 1;
      }
    };
  }

  compileBlockWithManualLoop(): void {
    this.callTimes = function (this: Entry, times: number): void {
      (this.action as (times: number) => unknown)(times);
    };
  }

  compileString(_str: string): void {
    this.callTimes = function (__total: number): void {
      let __i = 0;
      while (__i < __total) {
        __i += 1;
      }
    };
  }
}
