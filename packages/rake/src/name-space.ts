import { rbObjDup } from "@blazetrails/ruby-compat";
import type { Scope } from "./scope.js";
import type { Task } from "./task.js";
import type { TaskManager } from "./task-manager.js";

export class NameSpace {
  private _taskManager: TaskManager;
  private _scope: Scope;

  constructor(taskManager: TaskManager, scopeList: Scope) {
    this._taskManager = taskManager;
    this._scope = rbObjDup(scopeList);
  }

  get(name: string): Task | null {
    return this._taskManager.lookup(name, this._scope);
  }

  get scope(): Scope {
    return rbObjDup(this._scope);
  }

  get tasks(): Task[] {
    return this._taskManager.tasksInScope(this._scope);
  }
}
