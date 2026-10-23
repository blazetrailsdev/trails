// ruby-compat's Module, constructed with a body that calls an instance method.
// No namespace re-export anywhere in this graph, so it isolates the
// `defineMethod is not a function` failure from the namespace-import path.
import { Module } from "@blazetrails/ruby-compat";

const M = new Module((mod) => {
  mod.defineMethod("greet", () => "hello");
});
console.log(
  "[rc-module]",
  typeof M,
  typeof (M as unknown as { defineMethod?: unknown }).defineMethod,
);
