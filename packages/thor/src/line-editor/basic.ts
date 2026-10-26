import { fetch, print, rtest, stdin as $stdin, stdout as $stdout } from "@blazetrails/ruby-compat";

export class Basic {
  readonly prompt: string;
  readonly options: Record<string, unknown>;

  static isAvailable(): boolean {
    return true;
  }

  constructor(prompt: string, options: Record<string, unknown>) {
    this.prompt = prompt;
    this.options = options;
  }

  readline(): Promise<string | null> {
    print.call($stdout, this.prompt);
    return this.getInput();
  }

  /** @internal */
  private getInput(): Promise<string | null> {
    if (rtest(this.isEcho())) {
      return $stdin.gets();
    } else {
      return $stdin.noecho((io) => io.gets());
    }
  }

  /** @internal */
  private isEcho(): unknown {
    return fetch(this.options, "echo", true);
  }
}
