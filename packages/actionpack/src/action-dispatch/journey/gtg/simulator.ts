import { StringScanner } from "@blazetrails/ruby-compat";

export type GtgState = ReadonlyArray<readonly [state: number, dataIndex: number | null]>;

export interface TransitionTableLike {
  move(state: GtgState, string: string, startIndex: number, endIndex: number): GtgState;
  memo(state: number): readonly unknown[];
  isAccepting(state: number): boolean;
}

export class MatchData {
  readonly memos: readonly unknown[];

  constructor(memos: readonly unknown[]) {
    this.memos = memos;
  }
}

const SYM = /[/.?]|[^/.?]+/;

export class Simulator {
  static readonly INITIAL_STATE: GtgState = [[0, null]];

  readonly tt: TransitionTableLike;

  constructor(transitionTable: TransitionTableLike) {
    this.tt = transitionTable;
  }

  memos(string: string, onNoMatch: () => readonly unknown[]): readonly unknown[] {
    const input = new StringScanner(string);
    let state: GtgState = Simulator.INITIAL_STATE;
    let startIndex = 0;

    let sym: string | null;
    while ((sym = input.scan(SYM)) !== null) {
      const endIndex = startIndex + sym.length;

      state = this.tt.move(state, string, startIndex, endIndex);

      startIndex = endIndex;
    }

    const acceptanceStates: unknown[] = [];
    for (const sD of state) {
      const [s, idx] = sD;
      if (idx === null && this.tt.isAccepting(s)) {
        for (const memo of this.tt.memo(s)) acceptanceStates.push(memo);
      }
    }

    return acceptanceStates.length === 0 ? onNoMatch() : acceptanceStates;
  }
}
