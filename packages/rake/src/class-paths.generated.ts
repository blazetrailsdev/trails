import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application.js";
import * as m1 from "./default-loader.js";
import * as m2 from "./dsl-definition.js";
import * as m3 from "./early-time.js";
import * as m4 from "./file-creation-task.js";
import * as m5 from "./file-task.js";
import * as m6 from "./file-utils-ext.js";
import * as m7 from "./invocation-chain.js";
import * as m8 from "./invocation-exception-mixin.js";
import * as m9 from "./late-time.js";
import * as m10 from "./linked-list.js";
import * as m11 from "./multi-task.js";
import * as m12 from "./name-space.js";
import * as m13 from "./private-reader.js";
import * as m14 from "./pseudo-status.js";
import * as m15 from "./rule-recursion-overflow-error.js";
import * as m16 from "./scope.js";
import * as m17 from "./task-argument-error.js";
import * as m18 from "./task-arguments.js";
import * as m19 from "./task-manager.js";
import * as m20 from "./task.js";
import * as m21 from "./tasklib.js";
import * as m22 from "./trace-output.js";
import * as m23 from "./version.js";

registerClassPaths([
  [() => m0.Application, "Rake::Application"],
  [() => m1.DefaultLoader, "Rake::DefaultLoader"],
  [() => m2.DSL, "Rake::DSL"],
  [() => m3.EarlyTime, "Rake::EarlyTime"],
  [() => m4.FileCreationTask, "Rake::FileCreationTask"],
  [() => m5.FileTask, "Rake::FileTask"],
  [() => m6.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m7.InvocationChain, "Rake::InvocationChain"],
  [() => m8.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m9.LateTime, "Rake::LateTime"],
  [() => m10.LinkedList, "Rake::LinkedList"],
  [() => m11.MultiTask, "Rake::MultiTask"],
  [() => m12.NameSpace, "Rake::NameSpace"],
  [() => m13.PrivateReader, "Rake::PrivateReader"],
  [() => m14.PseudoStatus, "Rake::PseudoStatus"],
  [() => m15.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m16.Scope, "Rake::Scope"],
  [() => m20.Task, "Rake::Task"],
  [() => m17.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m18.TaskArguments, "Rake::TaskArguments"],
  [() => m21.TaskLib, "Rake::TaskLib"],
  [() => m19.TaskManager, "Rake::TaskManager"],
  [() => m22.TraceOutput, "Rake::TraceOutput"],
  [() => m23.Version, "Rake::Version"],
]);
