import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./mini-mime.js";

defineConstants([
  [() => m0.Configuration, "MiniMime::Configuration"],
  [() => m0.Db, "MiniMime::Db"],
  [() => m0.Db.Cache, "MiniMime::Db::Cache"],
  [() => m0.Db.PReadFile, "MiniMime::Db::PReadFile"],
  [() => m0.Db.RandomAccessDb, "MiniMime::Db::RandomAccessDb"],
  [() => m0.Info, "MiniMime::Info"],
]);
