import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./app-executor.js";
import * as m1 from "./batch-execution.js";
import * as m2 from "./batch.js";
import * as m3 from "./batch/callbacks.js";
import * as m4 from "./batch/clearable.js";
import * as m5 from "./batch/status.js";
import * as m6 from "./blocked-execution.js";
import * as m7 from "./claimed-execution.js";
import * as m8 from "./configuration.js";
import * as m9 from "./dispatcher.js";
import * as m10 from "./dispatcher/concurrency-maintenance.js";
import * as m11 from "./engine.js";
import * as m12 from "./execution.js";
import * as m13 from "./execution/dispatching.js";
import * as m14 from "./execution/job-attributes.js";
import * as m15 from "./failed-execution.js";
import * as m16 from "./failed-execution/batchable.js";
import * as m17 from "./fiber-pool.js";
import * as m18 from "./job.js";
import * as m19 from "./job/batchable.js";
import * as m20 from "./job/clearable.js";
import * as m21 from "./job/concurrency-controls.js";
import * as m22 from "./job/executable.js";
import * as m23 from "./job/recurrable.js";
import * as m24 from "./job/retryable.js";
import * as m25 from "./job/schedulable.js";
import * as m26 from "./lifecycle-hooks.js";
import * as m27 from "./log-subscriber.js";
import * as m28 from "./pause.js";
import * as m29 from "./pool.js";
import * as m30 from "./process.js";
import * as m31 from "./process/executor.js";
import * as m32 from "./process/prunable.js";
import * as m33 from "./processes/base.js";
import * as m34 from "./processes/callbacks.js";
import * as m35 from "./processes/interruptible.js";
import * as m36 from "./processes/poller.js";
import * as m37 from "./processes/process-exit-error.js";
import * as m38 from "./processes/process-missing-error.js";
import * as m39 from "./processes/process-pruned-error.js";
import * as m40 from "./processes/procline.js";
import * as m41 from "./processes/registrable.js";
import * as m42 from "./processes/runnable.js";
import * as m43 from "./processes/supervised.js";
import * as m44 from "./processes/unrecoverable-error.js";
import * as m45 from "./queue-selector.js";
import * as m46 from "./queue.js";
import * as m47 from "./ready-execution.js";
import * as m48 from "./record.js";
import * as m49 from "./recurring-execution.js";
import * as m50 from "./recurring-job.js";
import * as m51 from "./recurring-task.js";
import * as m52 from "./recurring-task/arguments.js";
import * as m53 from "./scheduled-execution.js";
import * as m54 from "./scheduler.js";
import * as m55 from "./scheduler/recurring-schedule.js";
import * as m56 from "./semaphore.js";
import * as m57 from "./supervisor.js";
import * as m58 from "./supervisor/maintenance.js";
import * as m59 from "./supervisor/pidfile.js";
import * as m60 from "./supervisor/pidfiled.js";
import * as m61 from "./supervisor/signals.js";
import * as m62 from "./thread-pool.js";
import * as m63 from "./timer.js";
import * as m64 from "./worker.js";

defineConstants([
  [() => m0.AppExecutor, "SolidQueue::AppExecutor"],
  [() => m2.Batch, "SolidQueue::Batch"],
  [() => m2.AlreadyFinished, "SolidQueue::Batch::AlreadyFinished"],
  [() => m3.Callbacks, "SolidQueue::Batch::Callbacks"],
  [() => m4.Clearable, "SolidQueue::Batch::Clearable"],
  [() => m4.ClassMethods, "SolidQueue::Batch::Clearable::ClassMethods"],
  [() => m2.PendingMigrations, "SolidQueue::Batch::PendingMigrations"],
  [() => m5.Status, "SolidQueue::Batch::Status"],
  [() => m1.BatchExecution, "SolidQueue::BatchExecution"],
  [() => m6.BlockedExecution, "SolidQueue::BlockedExecution"],
  [() => m7.ClaimedExecution, "SolidQueue::ClaimedExecution"],
  [() => m7.FinalizationError, "SolidQueue::ClaimedExecution::FinalizationError"],
  [() => m7.Result, "SolidQueue::ClaimedExecution::Result"],
  [() => m8.Configuration, "SolidQueue::Configuration"],
  [() => m8.Process, "SolidQueue::Configuration::Process"],
  [() => m9.Dispatcher, "SolidQueue::Dispatcher"],
  [() => m10.ConcurrencyMaintenance, "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m11.Engine, "SolidQueue::Engine"],
  [() => m12.Execution, "SolidQueue::Execution"],
  [() => m13.Dispatching, "SolidQueue::Execution::Dispatching"],
  [() => m13.ClassMethods, "SolidQueue::Execution::Dispatching::ClassMethods"],
  [() => m14.JobAttributes, "SolidQueue::Execution::JobAttributes"],
  [() => m14.ClassMethods, "SolidQueue::Execution::JobAttributes::ClassMethods"],
  [() => m12.UndiscardableError, "SolidQueue::Execution::UndiscardableError"],
  [() => m15.FailedExecution, "SolidQueue::FailedExecution"],
  [() => m16.Batchable, "SolidQueue::FailedExecution::Batchable"],
  [() => m17.FiberPool, "SolidQueue::FiberPool"],
  [() => m18.Job, "SolidQueue::Job"],
  [() => m19.Batchable, "SolidQueue::Job::Batchable"],
  [() => m19.ClassMethods, "SolidQueue::Job::Batchable::ClassMethods"],
  [() => m18.ClassMissingError, "SolidQueue::Job::ClassMissingError"],
  [() => m20.Clearable, "SolidQueue::Job::Clearable"],
  [() => m20.ClassMethods, "SolidQueue::Job::Clearable::ClassMethods"],
  [() => m21.ConcurrencyControls, "SolidQueue::Job::ConcurrencyControls"],
  [() => m21.ClassMethods, "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [() => m18.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m22.Executable, "SolidQueue::Job::Executable"],
  [() => m22.ClassMethods, "SolidQueue::Job::Executable::ClassMethods"],
  [() => m23.Recurrable, "SolidQueue::Job::Recurrable"],
  [() => m24.Retryable, "SolidQueue::Job::Retryable"],
  [() => m25.Schedulable, "SolidQueue::Job::Schedulable"],
  [() => m25.ClassMethods, "SolidQueue::Job::Schedulable::ClassMethods"],
  [() => m26.LifecycleHooks, "SolidQueue::LifecycleHooks"],
  [() => m26.ClassMethods, "SolidQueue::LifecycleHooks::ClassMethods"],
  [() => m27.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m28.Pause, "SolidQueue::Pause"],
  [() => m29.Pool, "SolidQueue::Pool"],
  [() => m30.Process, "SolidQueue::Process"],
  [() => m31.Executor, "SolidQueue::Process::Executor"],
  [() => m32.Prunable, "SolidQueue::Process::Prunable"],
  [() => m32.ClassMethods, "SolidQueue::Process::Prunable::ClassMethods"],
  [() => m33.Base, "SolidQueue::Processes::Base"],
  [() => m34.Callbacks, "SolidQueue::Processes::Callbacks"],
  [() => m35.Interruptible, "SolidQueue::Processes::Interruptible"],
  [() => m36.Poller, "SolidQueue::Processes::Poller"],
  [() => m37.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m38.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m39.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m40.Procline, "SolidQueue::Processes::Procline"],
  [() => m41.Registrable, "SolidQueue::Processes::Registrable"],
  [() => m42.Runnable, "SolidQueue::Processes::Runnable"],
  [() => m43.Supervised, "SolidQueue::Processes::Supervised"],
  [() => m44.UnrecoverableError, "SolidQueue::Processes::UnrecoverableError"],
  [() => m46.Queue, "SolidQueue::Queue"],
  [() => m45.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m47.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m48.Record, "SolidQueue::Record"],
  [() => m49.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m49.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m50.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m51.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m52.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m53.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m54.Scheduler, "SolidQueue::Scheduler"],
  [() => m55.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m56.Semaphore, "SolidQueue::Semaphore"],
  [() => m56.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m57.Supervisor, "SolidQueue::Supervisor"],
  [() => m58.Maintenance, "SolidQueue::Supervisor::Maintenance"],
  [() => m59.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m60.Pidfiled, "SolidQueue::Supervisor::Pidfiled"],
  [() => m61.Signals, "SolidQueue::Supervisor::Signals"],
  [() => m62.ThreadPool, "SolidQueue::ThreadPool"],
  [() => m63.Timer, "SolidQueue::Timer"],
  [() => m64.Worker, "SolidQueue::Worker"],
]);
