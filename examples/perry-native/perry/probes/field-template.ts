class BaseCfg {
  get root(): string | null {
    return this._root;
  }
  protected _root: string | null = null;
}

class Cfg extends BaseCfg {
  timeZone = "UTC";
  cacheStore: unknown = [":file_store", `${this.root ?? ""}/tmp/cache/`];
  reloadClassesOnlyOnChange = true;
}

class CfgWithRoot extends BaseCfg {
  protected override _root = "/app";
  cacheStore: unknown = [":file_store", `${this.root ?? ""}/tmp/cache/`];
}

const c = new Cfg();
const arr = c.cacheStore as unknown[];
console.log(`F1 len=${arr.length} json=${JSON.stringify(arr)}`);
console.log(`F2 elem0=${String(arr[0])} elem1=${String(arr[1])} typeof1=${typeof arr[1]}`);

const d = new CfgWithRoot();
const arr2 = d.cacheStore as unknown[];
console.log(`F3 len=${arr2.length} json=${JSON.stringify(arr2)}`);

function sink(...parameters: unknown[]): string {
  return `n=${parameters.length} p0=${String(parameters[0])}`;
}
console.log(`F4 respread: ${sink(...(arr.slice(1) as unknown[]))}`);
console.log(`F5 full respread: ${sink(...arr)}`);

console.log(
  'EXPECT F1 len=2 json=[":file_store","/tmp/cache/"] | F3 json=[":file_store","/app/tmp/cache/"] | F4 n=1 p0=/tmp/cache/ | F5 n=2',
);
