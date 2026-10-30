import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./dsl-definition.js";
import * as m1 from "./early-time.js";
import * as m2 from "./file-creation-task.js";
import * as m3 from "./file-task.js";
import * as m4 from "./file-utils-ext.js";
import * as m5 from "./invocation-chain.js";
import * as m6 from "./invocation-exception-mixin.js";
import * as m7 from "./late-time.js";
import * as m8 from "./linked-list.js";
import * as m9 from "./multi-task.js";
import * as m10 from "./name-space.js";
import * as m11 from "./pseudo-status.js";
import * as m12 from "./rule-recursion-overflow-error.js";
import * as m13 from "./scope.js";
import * as m14 from "./task-argument-error.js";
import * as m15 from "./task-arguments.js";
import * as m16 from "./task-manager.js";
import * as m17 from "./task.js";
import * as m18 from "./tasklib.js";
import * as m19 from "./version.js";

registerClassPaths([
  [() => m0.DSL, "Rake::DSL"],
  [() => m1.EarlyTime, "Rake::EarlyTime"],
  [() => m2.FileCreationTask, "Rake::FileCreationTask"],
  [() => m3.FileTask, "Rake::FileTask"],
  [() => m4.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m5.InvocationChain, "Rake::InvocationChain"],
  [() => m6.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m7.LateTime, "Rake::LateTime"],
  [() => m8.LinkedList, "Rake::LinkedList"],
  [() => m9.MultiTask, "Rake::MultiTask"],
  [() => m10.NameSpace, "Rake::NameSpace"],
  [() => m11.PseudoStatus, "Rake::PseudoStatus"],
  [() => m12.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m13.Scope, "Rake::Scope"],
  [() => m17.Task, "Rake::Task"],
  [() => m14.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m15.TaskArguments, "Rake::TaskArguments"],
  [() => m18.TaskLib, "Rake::TaskLib"],
  [() => m16.TaskManager, "Rake::TaskManager"],
  [() => m19.Version, "Rake::Version"],
]);
