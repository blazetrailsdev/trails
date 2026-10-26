// Does a `return` inside try survive when catch ends in a `never` call,
// or when the return sits inside an infinite for-loop?
function raise(e: unknown): never {
  throw e;
}

// shape 1: exactly BetterSqlite3Statement.bind
function bindShape<T>(call: () => T): T {
  try {
    return call();
  } catch (e) {
    raise(e);
  }
}

// shape 2: exactly withNullBinds
function loopShape<T>(call: () => T): T {
  for (;;) {
    try {
      return call();
    } catch (e) {
      if (!(e instanceof RangeError)) throw e;
    }
  }
}

// shape 3: both nested, as the adapter actually has them
function nested<T>(call: () => T): T {
  try {
    return loopShape(call);
  } catch (e) {
    raise(e);
  }
}

console.log("[y1] bindShape  =", JSON.stringify(bindShape(() => ({ changes: 1 }))));
console.log("[y2] loopShape  =", JSON.stringify(loopShape(() => ({ changes: 2 }))));
console.log("[y3] nested     =", JSON.stringify(nested(() => ({ changes: 3 }))));
console.log("[y4] nested.changes =", String(nested(() => ({ changes: 4 })).changes));

// and with a generic-typed object return, like RunResult
interface R {
  changes: number;
  lastInsertRowid: number;
}
function asR(): R {
  return { changes: 9, lastInsertRowid: 9 };
}
const r = nested<R>(asR);
console.log("[y5] typed nested =", JSON.stringify(r), "changes =", String(r.changes));
