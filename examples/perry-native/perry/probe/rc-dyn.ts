// Forces a DYNAMIC member call on a barrel-imported class instance. The
// statically-resolved form (`mod.defineMethod(...)` with `Module` in scope)
// already works at this size — see rc-module.ts. A computed key defeats static
// resolution, so this asks whether the class's methods are reachable through a
// runtime prototype at all, which is what activemodel's failing site needs.
import { Module } from "@blazetrails/ruby-compat";

const key = ["define", "Method"].join("");
const M = new Module();
(M as unknown as Record<string, (n: string, b: () => unknown) => void>)[key](
  "greet",
  () => "hello",
);
console.log("[rc-dyn] ok", typeof (M as unknown as Record<string, unknown>).greet);
