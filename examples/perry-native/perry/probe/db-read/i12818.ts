// #12818 verbatim: inherited arrow-function field calling another field,
// base class in another module. Node: ok [ 1 ].
import { Base } from "./i12818-base.ts";
class Sub extends Base {
  y = 1;
}
const r = new Sub();
try {
  r.addChildren([1]);
  console.log("ok", r.children);
} catch (e) {
  console.log("fail", String(e));
}
