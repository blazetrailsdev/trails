/* eslint-disable @typescript-eslint/no-explicit-any -- probe */
// The real error classes, imported DIRECTLY by relative path, so the graph is
// small. If setQuery survives here but not through the barrel, the trigger is
// graph size or the module hop -- not the class.
import {
  StatementInvalid,
  QueryAborted,
  AdapterError,
  ConnectionNotEstablished,
} from "../../../../../packages/activerecord/src/errors.ts";

function dump(label: string, ctor: unknown): void {
  const proto = (ctor as { prototype?: object }).prototype;
  if (proto == null) {
    console.log(label, "= NO PROTOTYPE");
    return;
  }
  const parts: string[] = [];
  for (const n of Object.getOwnPropertyNames(proto)) {
    const d = Object.getOwnPropertyDescriptor(proto, n);
    let kind: string;
    if (d == null) kind = "none";
    else if (typeof d.get === "function" || typeof d.set === "function") kind = "accessor";
    else if (typeof d.value === "function") kind = "method";
    else kind = "data";
    parts.push(n + ":" + kind);
  }
  console.log(label, "=", parts.sort().join(" "));
}

dump("StatementInvalid  ", StatementInvalid);
dump("QueryAborted      ", QueryAborted);
dump("AdapterError      ", AdapterError);
dump("ConnNotEstablished", ConnectionNotEstablished);

const si = new StatementInvalid("x");
console.log("instance setQuery  =", typeof (si as any).setQuery);
const cne = new ConnectionNotEstablished("y");
console.log("instance setPool   =", typeof (cne as any).setPool);
