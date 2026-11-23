import type { EngineStatement } from "../statement.js";

const COMPLETE_KEYWORDS: Record<string, number> = {
  explain: 3,
  create: 4,
  temp: 5,
  temporary: 5,
  trigger: 6,
  end: 7,
};

const COMPLETE_WORD = /[A-Za-z_\u0080-\uffff][\w$\u0080-\uffff]*/y;

const COMPLETE_TRANS = [
  [1, 0, 2, 3, 4, 2, 2, 2],
  [1, 1, 2, 3, 4, 2, 2, 2],
  [1, 2, 2, 2, 2, 2, 2, 2],
  [1, 3, 3, 2, 4, 2, 2, 2],
  [1, 4, 2, 2, 2, 4, 5, 2],
  [6, 5, 5, 5, 5, 5, 5, 5],
  [6, 6, 5, 5, 5, 5, 5, 7],
  [1, 7, 5, 5, 5, 5, 5, 5],
];

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function statementTail(sql: string): [tail: number, empty: boolean] {
  let state = 1;
  let empty = true;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    let token = 2;
    if (c === ";") {
      token = 0;
      i++;
    } else if (/[ \r\t\n\f]/.test(c)) {
      token = 1;
      i++;
    } else if (c === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      if (close === -1) return [sql.length, empty];
      token = 1;
      i = close + 2;
    } else if (c === "-" && sql[i + 1] === "-") {
      const newline = sql.indexOf("\n", i);
      if (newline === -1) return [sql.length, empty];
      token = 1;
      i = newline + 1;
    } else if (c === "[" || c === "`" || c === '"' || c === "'") {
      const close = sql.indexOf(c === "[" ? "]" : c, i + 1);
      if (close === -1) return [sql.length, false];
      i = close + 1;
    } else {
      COMPLETE_WORD.lastIndex = i;
      const word = COMPLETE_WORD.exec(sql)?.[0];
      if (word !== undefined) token = COMPLETE_KEYWORDS[word.toLowerCase()] ?? 2;
      i += word?.length ?? 1;
    }
    if (token > 1) empty = false;
    state = COMPLETE_TRANS[state][token];
    if (token === 0 && state === 1) return [i, empty];
  }
  return [sql.length, empty];
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export const closedStatement: EngineStatement = {
  close: () => {},
  isClosed: () => true,
  bindParam: () => {},
  resetBang: () => {},
  step: () => null,
  isDone: () => true,
  columnCount: () => 0,
  columnName: () => null,
  columnDecltype: () => null,
  bindParameterCount: () => 0,
  setReadBigInts: () => {},
};
