import { Turbo } from "../../../turbo-trails.js";
import { Debouncer } from "./debouncer.js";

export class ImmediateDebouncer {
  constructor(_options: { delay?: number } = { delay: Debouncer.DEFAULT_DELAY }) {}

  debounce(block: () => unknown): unknown {
    return block();
  }

  wait(): void {}

  isComplete(): boolean {
    return true;
  }
}
Turbo.ImmediateDebouncer = ImmediateDebouncer;
