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

  bitwiseShiftRight(n: number): number {
    return this.toI() >> n;
  }

  isStopped(): boolean {
    return false;
  }

  isExited(): boolean {
    return true;
  }
}
