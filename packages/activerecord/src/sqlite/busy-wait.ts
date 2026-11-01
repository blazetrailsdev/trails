import type { SqliteConnection } from "../sqlite-adapter.js";
import { BusyException } from "./errors.js";

/** @noRailsEquivalent PERMANENT */
export async function retryBusy<T>(
  rawConnection: SqliteConnection,
  step: () => T | Promise<T>,
  sharedLockHeld = false,
): Promise<T> {
  let count = 0;
  while (true) {
    try {
      return await step();
    } catch (error) {
      if (!(error instanceof BusyException) || !rawConnection.busyHandler || sharedLockHeld) {
        throw error;
      }
      if ((await rawConnection.busyHandler(count++)) === false) throw error;
    }
  }
}

/** @noRailsEquivalent PERMANENT */
export function setBusyHandlerTimeout(rawConnection: SqliteConnection, milliseconds: number): void {
  rawConnection.busyHandlerTimeout = milliseconds;
  let timeoutDeadline = 0;
  rawConnection.busyHandler = async (count) => {
    const now = performance.now();
    if (count === 0) {
      timeoutDeadline = now + milliseconds;
    } else if (now > timeoutDeadline) {
      return false;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    return true;
  };
}

const TOKEN =
  /;|\s+|\/\*[\s\S]*?(?:\*\/|$)|--[^\n]*|'[^']*(?:''[^']*)*(?:'|$)|"[^"]*(?:""[^"]*)*(?:"|$)|`[^`]*(?:``[^`]*)*(?:`|$)|\[[^\]]*(?:\]|$)|[A-Za-z_$\u0080-\uffff][\w$\u0080-\uffff]*|./g;
const TK_SEMI = 0;
const TK_WS = 1;
const TK_OTHER = 2;
const KEYWORDS: Record<string, number> = {
  EXPLAIN: 3,
  CREATE: 4,
  TEMP: 5,
  TEMPORARY: 5,
  TRIGGER: 6,
  END: 7,
};
const START = 1;
const TRANS = [
  [1, 0, 2, 3, 4, 2, 2, 2],
  [1, 1, 2, 3, 4, 2, 2, 2],
  [1, 2, 2, 2, 2, 2, 2, 2],
  [1, 3, 3, 2, 4, 2, 2, 2],
  [1, 4, 2, 2, 2, 4, 5, 2],
  [6, 5, 5, 5, 5, 5, 5, 5],
  [6, 6, 5, 5, 5, 5, 5, 7],
  [1, 7, 5, 5, 5, 5, 5, 5],
];

function token(text: string): number {
  if (text === ";") return TK_SEMI;
  if (/^(?:\s|\/\*|--)/.test(text)) return TK_WS;
  return KEYWORDS[text.toUpperCase()] ?? TK_OTHER;
}

function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let state = START;
  let begin = 0;
  let blank = true;
  for (const { 0: text, index } of sql.matchAll(TOKEN)) {
    const tk = token(text);
    state = TRANS[state][tk];
    if (tk !== TK_SEMI && tk !== TK_WS) blank = false;
    if (state === START && tk === TK_SEMI) {
      if (!blank) statements.push(sql.slice(begin, index + 1));
      begin = index + 1;
      blank = true;
    }
  }
  if (!blank) statements.push(sql.slice(begin));
  return statements;
}

/** @noRailsEquivalent PERMANENT */
export async function execBatch(rawConnection: SqliteConnection, sql: string): Promise<void> {
  for (const statement of splitStatements(sql)) {
    const stmt = await retryBusy(rawConnection, () => rawConnection.prepare(statement));
    try {
      await retryBusy(rawConnection, () => stmt.step());
    } finally {
      await stmt.close();
    }
  }
}
