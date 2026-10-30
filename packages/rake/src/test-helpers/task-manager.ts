import { include } from "@blazetrails/ruby-compat";
import { Scope } from "../scope.js";
import { TaskManager } from "../task-manager.js";

/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type */
export class TestTaskManager {
  constructor() {
    this._tasks = new Map();
    this._rules = [];
    this._scope = Scope.make() as Scope;
    this.lastDescription = null;
  }
}
export interface TestTaskManager extends TaskManager {}
include(TestTaskManager, TaskManager);
