import { RuntimeError } from "@blazetrails/ruby-compat";

export class ThreadTerminatedError extends RuntimeError {
  constructor(name: string) {
    super(`Thread ${name} terminated unexpectedly`);
  }
}
