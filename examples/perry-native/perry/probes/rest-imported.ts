import { restFn, restAlias } from "./rest-helper.js";

const ctx = {};
class Host {
  static result = "";
  static {
    Host.result = restAlias.call(this, "attr", { d: 1 });
  }
}
console.log(`I1 imported direct : ${restFn("attr", { d: 1 })}`);
console.log(`I2 imported .call  : ${restFn.call(ctx, "attr", { d: 1 })}`);
console.log(`I3 alias direct    : ${restAlias("attr", { d: 1 })}`);
console.log(`I4 alias .call     : ${restAlias.call(ctx, "attr", { d: 1 })}`);
console.log(`I5 alias in static : ${Host.result}`);
