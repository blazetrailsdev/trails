import { IsolatedExecutionState } from "@blazetrails/activesupport";

const REGISTRY_KEY = "active_record_explain_registry";

export class ExplainRegistry {
  static get collect(): boolean {
    return instance().collect;
  }

  static set collect(value: boolean) {
    instance().collect = value;
  }

  static isCollect(): boolean {
    return instance().isCollect();
  }

  static get queries(): [string, unknown[]][] {
    return instance().queries;
  }

  static reset(): void {
    instance().reset();
  }

  collect!: boolean;
  #queries!: [string, unknown[]][];

  constructor() {
    this.reset();
  }

  get queries(): [string, unknown[]][] {
    return this.#queries;
  }

  isCollect(): boolean {
    return this.collect;
  }

  reset(): void {
    this.collect = false;
    this.#queries = [];
  }
}

/** @internal */
export function instance(): ExplainRegistry {
  return IsolatedExecutionState.fetch(REGISTRY_KEY, () => new ExplainRegistry());
}
