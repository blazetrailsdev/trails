import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./cloneable.js";
import * as m1 from "./dsl-definition.js";
import * as m2 from "./early-time.js";
import * as m3 from "./file-creation-task.js";
import * as m4 from "./file-task.js";
import * as m5 from "./file-utils-ext.js";
import * as m6 from "./invocation-chain.js";
import * as m7 from "./invocation-exception-mixin.js";
import * as m8 from "./late-time.js";
import * as m9 from "./linked-list.js";
import * as m10 from "./multi-task.js";
import * as m11 from "./name-space.js";
import * as m12 from "./pseudo-status.js";
import * as m13 from "./rule-recursion-overflow-error.js";
import * as m14 from "./scope.js";
import * as m15 from "./task-argument-error.js";
import * as m16 from "./task-arguments.js";
import * as m17 from "./task-manager.js";
import * as m18 from "./task.js";
import * as m19 from "./tasklib.js";
import * as m20 from "./version.js";

registerClassPaths([
  [() => m0.Cloneable, "Rake::Cloneable"],
  [() => m1.DSL, "Rake::DSL"],
  [() => m2.EarlyTime, "Rake::EarlyTime"],
  [() => m3.FileCreationTask, "Rake::FileCreationTask"],
  [() => m4.FileTask, "Rake::FileTask"],
  [() => m5.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m6.InvocationChain, "Rake::InvocationChain"],
  [() => m7.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m8.LateTime, "Rake::LateTime"],
  [() => m9.LinkedList, "Rake::LinkedList"],
  [() => m10.MultiTask, "Rake::MultiTask"],
  [() => m11.NameSpace, "Rake::NameSpace"],
  [() => m12.PseudoStatus, "Rake::PseudoStatus"],
  [() => m13.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m14.Scope, "Rake::Scope"],
  [() => m18.Task, "Rake::Task"],
  [() => m15.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m16.TaskArguments, "Rake::TaskArguments"],
  [() => m19.TaskLib, "Rake::TaskLib"],
  [() => m17.TaskManager, "Rake::TaskManager"],
  [() => m20.Version, "Rake::Version"],
]);
