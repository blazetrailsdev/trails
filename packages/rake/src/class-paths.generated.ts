import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./file-task.js";
import * as m1 from "./file-utils-ext.js";
import * as m2 from "./invocation-chain.js";
import * as m3 from "./invocation-exception-mixin.js";
import * as m4 from "./linked-list.js";
import * as m5 from "./name-space.js";
import * as m6 from "./pseudo-status.js";
import * as m7 from "./rule-recursion-overflow-error.js";
import * as m8 from "./scope.js";
import * as m9 from "./task-argument-error.js";
import * as m10 from "./task-arguments.js";
import * as m11 from "./task-manager.js";
import * as m12 from "./task.js";
import * as m13 from "./version.js";

registerClassPaths([
  [() => m0.FileTask, "Rake::FileTask"],
  [() => m1.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m2.InvocationChain, "Rake::InvocationChain"],
  [() => m3.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m4.LinkedList, "Rake::LinkedList"],
  [() => m5.NameSpace, "Rake::NameSpace"],
  [() => m6.PseudoStatus, "Rake::PseudoStatus"],
  [() => m7.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m8.Scope, "Rake::Scope"],
  [() => m12.Task, "Rake::Task"],
  [() => m9.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m10.TaskArguments, "Rake::TaskArguments"],
  [() => m11.TaskManager, "Rake::TaskManager"],
  [() => m13.Version, "Rake::Version"],
]);
