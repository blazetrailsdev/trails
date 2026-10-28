// #12818 plus the author's workaround: one unrelated read before the call.
import { Base } from "./i12818-base.ts";
class Sub extends Base {
  y = 1;
}
const r = new Sub();
console.log("[t0] touched =", typeof r._add);
try {
  r.addChildren([1]);
  console.log("ok", r.children);
} catch (e) {
  console.log("fail", String(e));
}
