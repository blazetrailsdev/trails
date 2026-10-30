import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application.js";
import * as m1 from "./backtrace.js";
import * as m2 from "./cloneable.js";
import * as m3 from "./default-loader.js";
import * as m4 from "./dsl-definition.js";
import * as m5 from "./early-time.js";
import * as m6 from "./file-creation-task.js";
import * as m7 from "./file-task.js";
import * as m8 from "./file-utils-ext.js";
import * as m9 from "./invocation-chain.js";
import * as m10 from "./invocation-exception-mixin.js";
import * as m11 from "./late-time.js";
import * as m12 from "./linked-list.js";
import * as m13 from "./multi-task.js";
import * as m14 from "./name-space.js";
import * as m15 from "./private-reader.js";
import * as m16 from "./pseudo-status.js";
import * as m17 from "./rule-recursion-overflow-error.js";
import * as m18 from "./scope.js";
import * as m19 from "./task-argument-error.js";
import * as m20 from "./task-arguments.js";
import * as m21 from "./task-manager.js";
import * as m22 from "./task.js";
import * as m23 from "./tasklib.js";
import * as m24 from "./trace-output.js";
import * as m25 from "./version.js";
import * as m26 from "./win32.js";

registerClassPaths([
  [() => m0.Application, "Rake::Application"],
  [() => m1.Backtrace, "Rake::Backtrace"],
  [() => m2.Cloneable, "Rake::Cloneable"],
  [() => m3.DefaultLoader, "Rake::DefaultLoader"],
  [() => m4.DSL, "Rake::DSL"],
  [() => m5.EarlyTime, "Rake::EarlyTime"],
  [() => m6.FileCreationTask, "Rake::FileCreationTask"],
  [() => m7.FileTask, "Rake::FileTask"],
  [() => m8.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m9.InvocationChain, "Rake::InvocationChain"],
  [() => m10.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m11.LateTime, "Rake::LateTime"],
  [() => m12.LinkedList, "Rake::LinkedList"],
  [() => m13.MultiTask, "Rake::MultiTask"],
  [() => m14.NameSpace, "Rake::NameSpace"],
  [() => m15.PrivateReader, "Rake::PrivateReader"],
  [() => m16.PseudoStatus, "Rake::PseudoStatus"],
  [() => m17.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m18.Scope, "Rake::Scope"],
  [() => m22.Task, "Rake::Task"],
  [() => m19.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m20.TaskArguments, "Rake::TaskArguments"],
  [() => m23.TaskLib, "Rake::TaskLib"],
  [() => m21.TaskManager, "Rake::TaskManager"],
  [() => m24.TraceOutput, "Rake::TraceOutput"],
  [() => m25.Version, "Rake::Version"],
  [() => m26.Win32, "Rake::Win32"],
]);
