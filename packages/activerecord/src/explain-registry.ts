import { IsolatedExecutionState } from "@blazetrails/activesupport";

const REGISTRY_KEY = "active_record_explain_registry";
const SLOT_KEY = Symbol.for("ar_explain_registry_slot");

interface Slot {
  collect: boolean;
  queries: [string, unknown[]][];
}

function currentSlot(): Slot {
  return IsolatedExecutionState.fetch<Slot>(SLOT_KEY, () => ({ collect: false, queries: [] }));
}

export class ExplainRegistry {
  constructor() {}

  static get collect(): boolean {
    return currentSlot().collect;
  }

  static set collect(value: boolean) {
    currentSlot().collect = value;
  }

  static collectEnabled(): boolean {
    return currentSlot().collect;
  }

  static get queries(): [string, unknown[]][] {
    return currentSlot().queries;
  }

  static reset(): void {
    const slot = currentSlot();
    slot.collect = false;
    slot.queries = [];
  }

  static async collectingQueries<T>(
    fn: () => Promise<T>,
  ): Promise<{ value: T; queries: [string, unknown[]][] }> {
    const slot: Slot = { collect: true, queries: [] };
    try {
      const value = await IsolatedExecutionState.scope(SLOT_KEY, slot, fn);
      return { value, queries: [...slot.queries] };
    } finally {
      slot.collect = false;
      slot.queries = [];
    }
  }
}

/** @internal */
export function instance(): ExplainRegistry {
  return IsolatedExecutionState.fetch(REGISTRY_KEY, () => new ExplainRegistry());
}
