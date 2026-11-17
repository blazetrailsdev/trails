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
import * as m17 from "./job.js";
import * as m18 from "./job/batchable.js";
import * as m19 from "./job/clearable.js";
import * as m20 from "./job/concurrency-controls.js";
import * as m21 from "./job/executable.js";
import * as m22 from "./job/recurrable.js";
import * as m23 from "./job/retryable.js";
import * as m24 from "./job/schedulable.js";
import * as m25 from "./lifecycle-hooks.js";
import * as m26 from "./log-subscriber.js";
import * as m27 from "./pause.js";
import * as m28 from "./pool.js";
import * as m29 from "./process.js";
import * as m30 from "./process/executor.js";
import * as m31 from "./process/prunable.js";
import * as m32 from "./processes/base.js";
import * as m33 from "./processes/callbacks.js";
import * as m34 from "./processes/interruptible.js";
import * as m35 from "./processes/poller.js";
import * as m36 from "./processes/process-exit-error.js";
import * as m37 from "./processes/process-missing-error.js";
import * as m38 from "./processes/process-pruned-error.js";
import * as m39 from "./processes/procline.js";
import * as m40 from "./processes/registrable.js";
import * as m41 from "./processes/runnable.js";
import * as m42 from "./processes/supervised.js";
import * as m43 from "./processes/unrecoverable-error.js";
import * as m44 from "./queue-selector.js";
import * as m45 from "./queue.js";
import * as m46 from "./ready-execution.js";
import * as m47 from "./record.js";
import * as m48 from "./recurring-execution.js";
import * as m49 from "./recurring-job.js";
import * as m50 from "./recurring-task.js";
import * as m51 from "./recurring-task/arguments.js";
import * as m52 from "./scheduled-execution.js";
import * as m53 from "./scheduler.js";
import * as m54 from "./scheduler/recurring-schedule.js";
import * as m55 from "./semaphore.js";
import * as m56 from "./supervisor.js";
import * as m57 from "./supervisor/maintenance.js";
import * as m58 from "./supervisor/pidfile.js";
import * as m59 from "./supervisor/pidfiled.js";
import * as m60 from "./supervisor/signals.js";
import * as m61 from "./thread-pool.js";
import * as m62 from "./timer.js";
import * as m63 from "./worker.js";

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
  [() => m17.Job, "SolidQueue::Job"],
  [() => m18.Batchable, "SolidQueue::Job::Batchable"],
  [() => m18.ClassMethods, "SolidQueue::Job::Batchable::ClassMethods"],
  [() => m17.ClassMissingError, "SolidQueue::Job::ClassMissingError"],
  [() => m19.Clearable, "SolidQueue::Job::Clearable"],
  [() => m19.ClassMethods, "SolidQueue::Job::Clearable::ClassMethods"],
  [() => m20.ConcurrencyControls, "SolidQueue::Job::ConcurrencyControls"],
  [() => m20.ClassMethods, "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [() => m17.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m21.Executable, "SolidQueue::Job::Executable"],
  [() => m21.ClassMethods, "SolidQueue::Job::Executable::ClassMethods"],
  [() => m22.Recurrable, "SolidQueue::Job::Recurrable"],
  [() => m23.Retryable, "SolidQueue::Job::Retryable"],
  [() => m24.Schedulable, "SolidQueue::Job::Schedulable"],
  [() => m24.ClassMethods, "SolidQueue::Job::Schedulable::ClassMethods"],
  [() => m25.LifecycleHooks, "SolidQueue::LifecycleHooks"],
  [() => m25.ClassMethods, "SolidQueue::LifecycleHooks::ClassMethods"],
  [() => m26.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m27.Pause, "SolidQueue::Pause"],
  [() => m28.Pool, "SolidQueue::Pool"],
  [() => m29.Process, "SolidQueue::Process"],
  [() => m30.Executor, "SolidQueue::Process::Executor"],
  [() => m31.Prunable, "SolidQueue::Process::Prunable"],
  [() => m31.ClassMethods, "SolidQueue::Process::Prunable::ClassMethods"],
  [() => m32.Base, "SolidQueue::Processes::Base"],
  [() => m33.Callbacks, "SolidQueue::Processes::Callbacks"],
  [() => m34.Interruptible, "SolidQueue::Processes::Interruptible"],
  [() => m35.Poller, "SolidQueue::Processes::Poller"],
  [() => m36.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m37.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m38.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m39.Procline, "SolidQueue::Processes::Procline"],
  [() => m40.Registrable, "SolidQueue::Processes::Registrable"],
  [() => m41.Runnable, "SolidQueue::Processes::Runnable"],
  [() => m42.Supervised, "SolidQueue::Processes::Supervised"],
  [() => m43.UnrecoverableError, "SolidQueue::Processes::UnrecoverableError"],
  [() => m45.Queue, "SolidQueue::Queue"],
  [() => m44.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m46.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m47.Record, "SolidQueue::Record"],
  [() => m48.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m48.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m49.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m50.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m51.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m52.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m53.Scheduler, "SolidQueue::Scheduler"],
  [() => m54.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m55.Semaphore, "SolidQueue::Semaphore"],
  [() => m55.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m56.Supervisor, "SolidQueue::Supervisor"],
  [() => m57.Maintenance, "SolidQueue::Supervisor::Maintenance"],
  [() => m58.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m59.Pidfiled, "SolidQueue::Supervisor::Pidfiled"],
  [() => m60.Signals, "SolidQueue::Supervisor::Signals"],
  [() => m61.ThreadPool, "SolidQueue::ThreadPool"],
  [() => m62.Timer, "SolidQueue::Timer"],
  [() => m63.Worker, "SolidQueue::Worker"],
]);
