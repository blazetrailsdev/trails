import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./app-executor.js";
import * as m1 from "./blocked-execution.js";
import * as m2 from "./claimed-execution.js";
import * as m3 from "./configuration.js";
import * as m4 from "./dispatcher.js";
import * as m5 from "./dispatcher/concurrency-maintenance.js";
import * as m6 from "./engine.js";
import * as m7 from "./execution.js";
import * as m8 from "./execution/dispatching.js";
import * as m9 from "./execution/job-attributes.js";
import * as m10 from "./failed-execution.js";
import * as m11 from "./job.js";
import * as m12 from "./job/clearable.js";
import * as m13 from "./job/concurrency-controls.js";
import * as m14 from "./job/executable.js";
import * as m15 from "./job/recurrable.js";
import * as m16 from "./job/retryable.js";
import * as m17 from "./job/schedulable.js";
import * as m18 from "./lifecycle-hooks.js";
import * as m19 from "./log-subscriber.js";
import * as m20 from "./pause.js";
import * as m21 from "./pool.js";
import * as m22 from "./process.js";
import * as m23 from "./process/executor.js";
import * as m24 from "./process/prunable.js";
import * as m25 from "./processes/base.js";
import * as m26 from "./processes/callbacks.js";
import * as m27 from "./processes/interruptible.js";
import * as m28 from "./processes/poller.js";
import * as m29 from "./processes/process-exit-error.js";
import * as m30 from "./processes/process-missing-error.js";
import * as m31 from "./processes/process-pruned-error.js";
import * as m32 from "./processes/procline.js";
import * as m33 from "./processes/registrable.js";
import * as m34 from "./processes/runnable.js";
import * as m35 from "./processes/supervised.js";
import * as m36 from "./processes/unrecoverable-error.js";
import * as m37 from "./queue-selector.js";
import * as m38 from "./queue.js";
import * as m39 from "./ready-execution.js";
import * as m40 from "./record.js";
import * as m41 from "./recurring-execution.js";
import * as m42 from "./recurring-job.js";
import * as m43 from "./recurring-task.js";
import * as m44 from "./recurring-task/arguments.js";
import * as m45 from "./scheduled-execution.js";
import * as m46 from "./scheduler.js";
import * as m47 from "./scheduler/recurring-schedule.js";
import * as m48 from "./semaphore.js";
import * as m49 from "./supervisor.js";
import * as m50 from "./supervisor/maintenance.js";
import * as m51 from "./supervisor/pidfile.js";
import * as m52 from "./supervisor/pidfiled.js";
import * as m53 from "./supervisor/signals.js";
import * as m54 from "./thread-pool.js";
import * as m55 from "./timer.js";
import * as m56 from "./worker.js";

defineConstants([
  [() => m0.AppExecutor, "SolidQueue::AppExecutor"],
  [() => m1.BlockedExecution, "SolidQueue::BlockedExecution"],
  [() => m2.ClaimedExecution, "SolidQueue::ClaimedExecution"],
  [() => m2.Result, "SolidQueue::ClaimedExecution::Result"],
  [() => m3.Configuration, "SolidQueue::Configuration"],
  [() => m3.Process, "SolidQueue::Configuration::Process"],
  [() => m4.Dispatcher, "SolidQueue::Dispatcher"],
  [() => m5.ConcurrencyMaintenance, "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m6.Engine, "SolidQueue::Engine"],
  [() => m7.Execution, "SolidQueue::Execution"],
  [() => m8.Dispatching, "SolidQueue::Execution::Dispatching"],
  [() => m8.ClassMethods, "SolidQueue::Execution::Dispatching::ClassMethods"],
  [() => m9.JobAttributes, "SolidQueue::Execution::JobAttributes"],
  [() => m9.ClassMethods, "SolidQueue::Execution::JobAttributes::ClassMethods"],
  [() => m7.UndiscardableError, "SolidQueue::Execution::UndiscardableError"],
  [() => m10.FailedExecution, "SolidQueue::FailedExecution"],
  [() => m11.Job, "SolidQueue::Job"],
  [() => m11.ClassMissingError, "SolidQueue::Job::ClassMissingError"],
  [() => m12.Clearable, "SolidQueue::Job::Clearable"],
  [() => m12.ClassMethods, "SolidQueue::Job::Clearable::ClassMethods"],
  [() => m13.ConcurrencyControls, "SolidQueue::Job::ConcurrencyControls"],
  [() => m13.ClassMethods, "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [() => m11.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m14.Executable, "SolidQueue::Job::Executable"],
  [() => m14.ClassMethods, "SolidQueue::Job::Executable::ClassMethods"],
  [() => m15.Recurrable, "SolidQueue::Job::Recurrable"],
  [() => m16.Retryable, "SolidQueue::Job::Retryable"],
  [() => m17.Schedulable, "SolidQueue::Job::Schedulable"],
  [() => m17.ClassMethods, "SolidQueue::Job::Schedulable::ClassMethods"],
  [() => m18.LifecycleHooks, "SolidQueue::LifecycleHooks"],
  [() => m18.ClassMethods, "SolidQueue::LifecycleHooks::ClassMethods"],
  [() => m19.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m20.Pause, "SolidQueue::Pause"],
  [() => m21.Pool, "SolidQueue::Pool"],
  [() => m22.Process, "SolidQueue::Process"],
  [() => m23.Executor, "SolidQueue::Process::Executor"],
  [() => m24.Prunable, "SolidQueue::Process::Prunable"],
  [() => m24.ClassMethods, "SolidQueue::Process::Prunable::ClassMethods"],
  [() => m25.Base, "SolidQueue::Processes::Base"],
  [() => m26.Callbacks, "SolidQueue::Processes::Callbacks"],
  [() => m27.Interruptible, "SolidQueue::Processes::Interruptible"],
  [() => m28.Poller, "SolidQueue::Processes::Poller"],
  [() => m29.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m30.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m31.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m32.Procline, "SolidQueue::Processes::Procline"],
  [() => m33.Registrable, "SolidQueue::Processes::Registrable"],
  [() => m34.Runnable, "SolidQueue::Processes::Runnable"],
  [() => m35.Supervised, "SolidQueue::Processes::Supervised"],
  [() => m36.UnrecoverableError, "SolidQueue::Processes::UnrecoverableError"],
  [() => m38.Queue, "SolidQueue::Queue"],
  [() => m37.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m39.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m40.Record, "SolidQueue::Record"],
  [() => m41.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m41.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m42.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m43.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m44.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m45.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m46.Scheduler, "SolidQueue::Scheduler"],
  [() => m47.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m48.Semaphore, "SolidQueue::Semaphore"],
  [() => m48.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m49.Supervisor, "SolidQueue::Supervisor"],
  [() => m50.Maintenance, "SolidQueue::Supervisor::Maintenance"],
  [() => m51.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m52.Pidfiled, "SolidQueue::Supervisor::Pidfiled"],
  [() => m53.Signals, "SolidQueue::Supervisor::Signals"],
  [() => m54.ThreadPool, "SolidQueue::ThreadPool"],
  [() => m55.Timer, "SolidQueue::Timer"],
  [() => m56.Worker, "SolidQueue::Worker"],
]);
