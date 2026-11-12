import { defineConstants } from "@blazetrails/ruby-compat";
import * as m0 from "./connection-adapters/postgresql/oid/xml.js";

defineConstants([
  [() => m0.Xml, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Xml"],
  [() => m0.Data, "ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Xml::Data"],
]);
