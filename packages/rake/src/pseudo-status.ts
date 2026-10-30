export class PseudoStatus {
  readonly #exitstatus: number;

  constructor(code = 0) {
    this.#exitstatus = code;
  }

  exitstatus(): number {
    return this.#exitstatus;
  }

  toI(): number {
    return this.#exitstatus << 8;
  }

  isStopped(): boolean {
    return false;
  }

  isExited(): boolean {
    return true;
  }
}
