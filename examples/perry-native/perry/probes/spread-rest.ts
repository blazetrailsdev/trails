function f(first?: unknown, ...rest: unknown[]): string {
  return `first=${String(first)} restIsArray=${String(Array.isArray(rest))} restLen=${String(rest.length)} rest=${JSON.stringify(rest)}`;
}

const two: unknown[] = [":file_store", "/tmp/cache/"];
console.log(`S1 all-from-one-spread : ${f(...two)}`);
console.log(`S2 literal args        : ${f(":file_store", "/tmp/cache/")}`);
console.log(`S3 leading non-spread  : ${f(":file_store", ...two.slice(1))}`);

const three: unknown[] = ["a", "b", "c"];
console.log(`S4 spread of three     : ${f(...three)}`);

const one: unknown[] = ["solo"];
console.log(`S5 spread of one       : ${f(...one)}`);

console.log("EXPECT S1 restIsArray=true restLen=1 | S4 restLen=2 | S5 restLen=0");
