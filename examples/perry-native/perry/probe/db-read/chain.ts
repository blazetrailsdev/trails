// Walk the error heritage chain bottom-up: which link first misbehaves?
// StatementInvalid -> AdapterError -> ActiveRecordError -> StandardError -> Exception -> Error
import { Exception, StandardError } from "@blazetrails/ruby-compat";
import { ActiveRecordError, AdapterError, StatementInvalid } from "@blazetrails/activerecord";

function probe(label: string, o: unknown): void {
  const r = o as Record<string, unknown>;
  console.log(
    `[${label}] message=${String(r.message)} name=${String(r.name)} isError=${o instanceof Error}`,
  );
}

probe("Error           ", new Error("m0"));
probe("Exception       ", new Exception("m1"));
probe("StandardError   ", new StandardError("m2"));
probe("ActiveRecordErr ", new ActiveRecordError("m3"));
probe("AdapterError    ", new AdapterError("m4"));
probe("StatementInvalid", new StatementInvalid("m5"));

const si = new StatementInvalid("m6", { sql: "select 1", binds: [] });
console.log("[si] setQuery=", typeof (si as unknown as Record<string, unknown>).setQuery);
console.log("[si] instanceof StatementInvalid=", si instanceof StatementInvalid);
console.log("[si] instanceof AdapterError=", si instanceof AdapterError);
console.log("[si] instanceof Exception=", si instanceof Exception);
