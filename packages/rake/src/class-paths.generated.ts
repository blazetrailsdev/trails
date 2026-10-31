import { registerClassPaths } from "@blazetrails/ruby-compat";
import * as m0 from "./application.js";
import * as m1 from "./backtrace.js";
import * as m2 from "./cloneable.js";
import * as m3 from "./cpu-counter.js";
import * as m4 from "./default-loader.js";
import * as m5 from "./dsl-definition.js";
import * as m6 from "./early-time.js";
import * as m7 from "./file-creation-task.js";
import * as m8 from "./file-list.js";
import * as m9 from "./file-task.js";
import * as m10 from "./file-utils-ext.js";
import * as m11 from "./invocation-chain.js";
import * as m12 from "./invocation-exception-mixin.js";
import * as m13 from "./late-time.js";
import * as m14 from "./linked-list.js";
import * as m15 from "./multi-task.js";
import * as m16 from "./name-space.js";
import * as m17 from "./private-reader.js";
import * as m18 from "./pseudo-status.js";
import * as m19 from "./rule-recursion-overflow-error.js";
import * as m20 from "./scope.js";
import * as m21 from "./task-argument-error.js";
import * as m22 from "./task-arguments.js";
import * as m23 from "./task-manager.js";
import * as m24 from "./task.js";
import * as m25 from "./tasklib.js";
import * as m26 from "./trace-output.js";
import * as m27 from "./version.js";
import * as m28 from "./win32.js";

registerClassPaths([
  [() => m0.Application, "Rake::Application"],
  [() => m1.Backtrace, "Rake::Backtrace"],
  [() => m2.Cloneable, "Rake::Cloneable"],
  [() => m3.CpuCounter, "Rake::CpuCounter"],
  [() => m4.DefaultLoader, "Rake::DefaultLoader"],
  [() => m5.DSL, "Rake::DSL"],
  [() => m6.EarlyTime, "Rake::EarlyTime"],
  [() => m7.FileCreationTask, "Rake::FileCreationTask"],
  [() => m8.FileList, "Rake::FileList"],
  [() => m9.FileTask, "Rake::FileTask"],
  [() => m10.FileUtilsExt, "Rake::FileUtilsExt"],
  [() => m11.InvocationChain, "Rake::InvocationChain"],
  [() => m12.InvocationExceptionMixin, "Rake::InvocationExceptionMixin"],
  [() => m13.LateTime, "Rake::LateTime"],
  [() => m14.LinkedList, "Rake::LinkedList"],
  [() => m15.MultiTask, "Rake::MultiTask"],
  [() => m16.NameSpace, "Rake::NameSpace"],
  [() => m17.PrivateReader, "Rake::PrivateReader"],
  [() => m18.PseudoStatus, "Rake::PseudoStatus"],
  [() => m19.RuleRecursionOverflowError, "Rake::RuleRecursionOverflowError"],
  [() => m20.Scope, "Rake::Scope"],
  [() => m24.Task, "Rake::Task"],
  [() => m21.TaskArgumentError, "Rake::TaskArgumentError"],
  [() => m22.TaskArguments, "Rake::TaskArguments"],
  [() => m25.TaskLib, "Rake::TaskLib"],
  [() => m23.TaskManager, "Rake::TaskManager"],
  [() => m26.TraceOutput, "Rake::TraceOutput"],
  [() => m27.Version, "Rake::Version"],
  [() => m28.Win32, "Rake::Win32"],
  [() => m28.Win32HomeError, "Rake::Win32::Win32HomeError"],
]);
