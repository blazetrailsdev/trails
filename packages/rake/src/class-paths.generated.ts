import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application.js";
import * as m1 from "./backtrace.js";
import * as m2 from "./cloneable.js";
import * as m3 from "./default-loader.js";
import * as m4 from "./dsl-definition.js";
import * as m5 from "./early-time.js";
import * as m6 from "./file-creation-task.js";
import * as m7 from "./file-list.js";
import * as m8 from "./file-task.js";
import * as m9 from "./file-utils-ext.js";
import * as m10 from "./invocation-chain.js";
import * as m11 from "./invocation-exception-mixin.js";
import * as m12 from "./late-time.js";
import * as m13 from "./linked-list.js";
import * as m14 from "./multi-task.js";
import * as m15 from "./name-space.js";
import * as m16 from "./private-reader.js";
import * as m17 from "./pseudo-status.js";
import * as m18 from "./rule-recursion-overflow-error.js";
import * as m19 from "./scope.js";
import * as m20 from "./task-argument-error.js";
import * as m21 from "./task-arguments.js";
import * as m22 from "./task-manager.js";
import * as m23 from "./task.js";
import * as m24 from "./tasklib.js";
import * as m25 from "./trace-output.js";
import * as m26 from "./version.js";
import * as m27 from "./win32.js";

registerClassPaths([
  [() => m0.Application, "Rake::Application"],
  [() => m1.Backtrace, "Rake::Backtrace"],
  [() => m2.Cloneable, "Rake::Cloneable"],
  [() => m3.DefaultLoader, "Rake::DefaultLoader"],
  [() => m4.DSL, "Rake::DSL"],
  [() => m5.EarlyTime, "Rake::EarlyTime"],
  [() => m6.FileCreationTask, "Rake::FileCreationTask"],
  [() => m7.FileList, "Rake::FileList"],
  [() => m8.FileTask, "Rake::FileTask"],
  [() => m9.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m10.InvocationChain, "Rake::InvocationChain"],
  [() => m11.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m12.LateTime, "Rake::LateTime"],
  [() => m13.LinkedList, "Rake::LinkedList"],
  [() => m14.MultiTask, "Rake::MultiTask"],
  [() => m15.NameSpace, "Rake::NameSpace"],
  [() => m16.PrivateReader, "Rake::PrivateReader"],
  [() => m17.PseudoStatus, "Rake::PseudoStatus"],
  [() => m18.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m19.Scope, "Rake::Scope"],
  [() => m23.Task, "Rake::Task"],
  [() => m20.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m21.TaskArguments, "Rake::TaskArguments"],
  [() => m24.TaskLib, "Rake::TaskLib"],
  [() => m22.TaskManager, "Rake::TaskManager"],
  [() => m25.TraceOutput, "Rake::TraceOutput"],
  [() => m26.Version, "Rake::Version"],
  [() => m27.Win32, "Rake::Win32"],
  [() => m27.Win32HomeError, "Rake::Win32::Win32HomeError"],
]);
