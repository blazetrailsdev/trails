import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./mini-mime.js";

registerClassPaths([
  [() => m0.Configuration, "MiniMime::Configuration"],
  [() => m0.Db, "MiniMime::Db"],
  [() => m0.Db.Cache, "MiniMime::Db::Cache"],
  [() => m0.Db.RandomAccessDb, "MiniMime::Db::RandomAccessDb"],
  [() => m0.Info, "MiniMime::Info"],
]);
