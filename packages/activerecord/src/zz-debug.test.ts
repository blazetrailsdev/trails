import { it } from "vitest";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Default } from "./test-helpers/models/default.js";
import { rbModName } from "@blazetrails/ruby-compat";
fixtures([]);
it("dbg", async () => {
  console.log("name", rbModName(Default), Default.name, (Default as any).tableName);
  const d = new Default() as any;
  console.log("char1", d.char1, Object.keys((Default as any).columnsHash ?? {}).slice(0, 3));
});
