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

const TOKEN = /([/.?]|[^/.?]+)/y;

export class Simulator {
  static readonly INITIAL_STATE: GtgState = [[0, null]];

  readonly tt: TransitionTableLike;

  constructor(transitionTable: TransitionTableLike) {
    this.tt = transitionTable;
  }

  memos(string: string, onNoMatch: () => readonly unknown[]): readonly unknown[] {
    let state: GtgState = Simulator.INITIAL_STATE;
    let startIndex = 0;

    TOKEN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = TOKEN.exec(string)) !== null) {
      const endIndex = startIndex + match[0].length;
      state = this.tt.move(state, string, startIndex, endIndex);
      startIndex = endIndex;
      TOKEN.lastIndex = endIndex;
    }

    const acceptance: unknown[] = [];
    for (const [s, idx] of state) {
      if (idx === null && this.tt.isAccepting(s)) {
        acceptance.push(...this.tt.memo(s));
      }
    }
    return acceptance.length === 0 ? onNoMatch() : acceptance;
  }
}
