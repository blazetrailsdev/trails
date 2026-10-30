import { include } from "@blazetrails/ruby-compat";
import { Rake } from "../rake-module.js";
import { Scope } from "../scope.js";
import { TaskManager } from "../task-manager.js";

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
export class TestTaskManager {
  name = "rake";
  options: Record<string, unknown> = {};

  constructor() {
    this._tasks = new Map();
    this._rules = [];
    this._scope = Scope.make() as Scope;
    this.lastDescription = null;
    Rake.application = this as typeof Rake.application;
  }

  trace(): void {}
}
export interface TestTaskManager extends TaskManager {}
include(TestTaskManager, TaskManager);
