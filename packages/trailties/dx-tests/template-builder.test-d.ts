import { ref, tsClass } from "@blazetrails/trailties/template-builder";

// `extends` must be a Ref, not a string. The Ref brand is module-private,
// so a string literal cannot satisfy the type — this is the load-bearing
// constraint that blocks Ruby-shaped emit.
tsClass({
  name: "User",
  // @ts-expect-error - extends requires a Ref, not a string
  extends: "ApplicationRecord",
  body: [],
});

// Constructed via ref() — OK.
tsClass({
  name: "User",
  extends: ref("Base", "@blazetrails/activerecord"),
  body: [],
});
