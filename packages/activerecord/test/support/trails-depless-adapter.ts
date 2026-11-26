import { LoadError } from "@blazetrails/ruby-compat/load-error";

throw Object.assign(
  new LoadError("Cannot find package 'mysql2' imported from /adapters/mysql2-adapter.js"),
  { code: "ERR_MODULE_NOT_FOUND" },
);
