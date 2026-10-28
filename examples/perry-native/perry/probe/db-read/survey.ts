// Which prototype members survive in a large graph, and which are dropped?
// Dump every own member of several imported classes, with its kind, and diff
// Perry against Node. No hypothesis -- just the data.
import {
  StatementInvalid,
  AdapterError,
  ActiveRecordError,
  QueryAborted,
  RecordNotUnique,
  ConnectionNotEstablished,
} from "@blazetrails/activerecord";

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

dump("StatementInvalid ", StatementInvalid);
dump("QueryAborted     ", QueryAborted);
dump("AdapterError     ", AdapterError);
dump("ActiveRecordError", ActiveRecordError);
dump("RecordNotUnique  ", RecordNotUnique);
// has its OWN method `setPool` and inherits the `connectionPool` getter --
// one class that carries both kinds.
dump("ConnNotEstablished", ConnectionNotEstablished);

// a locally declared class in the SAME large-graph build, for contrast
class LocalThing {
  aMethod(): string {
    return "m";
  }
  get anAccessor(): string {
    return "a";
  }
}
dump("LocalThing       ", LocalThing);
