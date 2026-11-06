import { Application } from "@blazetrails/trailties";
import { lookupStore } from "@blazetrails/activesupport/cache";

class ProbeApp extends Application {}

const cfg = ProbeApp.config;
const cs = cfg.cacheStore;
console.log(`C1 isArray=${String(Array.isArray(cs))} json=${JSON.stringify(cs)}`);
if (Array.isArray(cs)) {
  console.log(`C2 len=${cs.length} e0=${String(cs[0])} e1=${String(cs[1])} t1=${typeof cs[1]}`);
}
console.log(`C3 cfg.root=${String(cfg.root)}`);
try {
  const store = lookupStore(cs);
  console.log(
    `C4 lookupStore ok: ${(store as { constructor: { name: string } }).constructor.name}`,
  );
  console.log(`C5 cachePath=${String((store as unknown as { cachePath?: string }).cachePath)}`);
} catch (e) {
  console.log(`C4 lookupStore THREW: ${String((e as Error).message)}`);
}
console.log("EXPECT C1 isArray=true | C2 len=2 t1=string | C4 FileStore");
