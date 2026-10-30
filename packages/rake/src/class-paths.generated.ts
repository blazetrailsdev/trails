import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application.js";
import * as m1 from "./cloneable.js";
import * as m2 from "./default-loader.js";
import * as m3 from "./dsl-definition.js";
import * as m4 from "./early-time.js";
import * as m5 from "./file-creation-task.js";
import * as m6 from "./file-task.js";
import * as m7 from "./file-utils-ext.js";
import * as m8 from "./invocation-chain.js";
import * as m9 from "./invocation-exception-mixin.js";
import * as m10 from "./late-time.js";
import * as m11 from "./linked-list.js";
import * as m12 from "./multi-task.js";
import * as m13 from "./name-space.js";
import * as m14 from "./private-reader.js";
import * as m15 from "./pseudo-status.js";
import * as m16 from "./rule-recursion-overflow-error.js";
import * as m17 from "./scope.js";
import * as m18 from "./task-argument-error.js";
import * as m19 from "./task-arguments.js";
import * as m20 from "./task-manager.js";
import * as m21 from "./task.js";
import * as m22 from "./tasklib.js";
import * as m23 from "./trace-output.js";
import * as m24 from "./version.js";

registerClassPaths([
  [() => m0.Application, "Rake::Application"],
  [() => m1.Cloneable, "Rake::Cloneable"],
  [() => m2.DefaultLoader, "Rake::DefaultLoader"],
  [() => m3.DSL, "Rake::DSL"],
  [() => m4.EarlyTime, "Rake::EarlyTime"],
  [() => m5.FileCreationTask, "Rake::FileCreationTask"],
  [() => m6.FileTask, "Rake::FileTask"],
  [() => m7.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m8.InvocationChain, "Rake::InvocationChain"],
  [() => m9.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m10.LateTime, "Rake::LateTime"],
  [() => m11.LinkedList, "Rake::LinkedList"],
  [() => m12.MultiTask, "Rake::MultiTask"],
  [() => m13.NameSpace, "Rake::NameSpace"],
  [() => m14.PrivateReader, "Rake::PrivateReader"],
  [() => m15.PseudoStatus, "Rake::PseudoStatus"],
  [() => m16.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m17.Scope, "Rake::Scope"],
  [() => m21.Task, "Rake::Task"],
  [() => m18.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m19.TaskArguments, "Rake::TaskArguments"],
  [() => m22.TaskLib, "Rake::TaskLib"],
  [() => m20.TaskManager, "Rake::TaskManager"],
  [() => m23.TraceOutput, "Rake::TraceOutput"],
  [() => m24.Version, "Rake::Version"],
]);
