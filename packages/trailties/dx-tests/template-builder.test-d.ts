import { ref, tsClass } from "@blazetrails/trailties/template-builder";

tsClass({
  name: "User",
  // @ts-expect-error - extends requires a Ref, not a string
  extends: "ApplicationRecord",
  body: [],
});

tsClass({
  name: "User",
  extends: ref("Base", "@blazetrails/activerecord"),
  body: [],
});
