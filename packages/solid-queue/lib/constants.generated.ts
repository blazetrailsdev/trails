import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./app-executor.js";
import * as m1 from "./batch-execution.js";
import * as m2 from "./batch.js";
import * as m3 from "./batch/callbacks.js";
import * as m4 from "./batch/clearable.js";
import * as m5 from "./batch/status.js";
import * as m6 from "./batch/sweepable.js";
import * as m7 from "./blocked-execution.js";
import * as m8 from "./claimed-execution.js";
import * as m9 from "./configuration.js";
import * as m10 from "./dispatcher.js";
import * as m11 from "./dispatcher/concurrency-maintenance.js";
import * as m12 from "./engine.js";
import * as m13 from "./execution.js";
import * as m14 from "./execution/dispatching.js";
import * as m15 from "./execution/job-attributes.js";
import * as m16 from "./failed-execution.js";
import * as m17 from "./failed-execution/batchable.js";
import * as m18 from "./fiber-pool.js";
import * as m19 from "./job.js";
import * as m20 from "./job/batchable.js";
import * as m21 from "./job/clearable.js";
import * as m22 from "./job/concurrency-controls.js";
import * as m23 from "./job/executable.js";
import * as m24 from "./job/recurrable.js";
import * as m25 from "./job/retryable.js";
import * as m26 from "./job/schedulable.js";
import * as m27 from "./lifecycle-hooks.js";
import * as m28 from "./log-subscriber.js";
import * as m29 from "./pause.js";
import * as m30 from "./pool.js";
import * as m31 from "./process.js";
import * as m32 from "./process/executor.js";
import * as m33 from "./process/prunable.js";
import * as m34 from "./processes/base.js";
import * as m35 from "./processes/callbacks.js";
import * as m36 from "./processes/interruptible.js";
import * as m37 from "./processes/poller.js";
import * as m38 from "./processes/process-exit-error.js";
import * as m39 from "./processes/process-missing-error.js";
import * as m40 from "./processes/process-pruned-error.js";
import * as m41 from "./processes/procline.js";
import * as m42 from "./processes/registrable.js";
import * as m43 from "./processes/runnable.js";
import * as m44 from "./processes/supervised.js";
import * as m45 from "./processes/unrecoverable-error.js";
import * as m46 from "./queue-selector.js";
import * as m47 from "./queue.js";
import * as m48 from "./ready-execution.js";
import * as m49 from "./record.js";
import * as m50 from "./recurring-execution.js";
import * as m51 from "./recurring-job.js";
import * as m52 from "./recurring-task.js";
import * as m53 from "./recurring-task/arguments.js";
import * as m54 from "./scheduled-execution.js";
import * as m55 from "./scheduler.js";
import * as m56 from "./scheduler/recurring-schedule.js";
import * as m57 from "./semaphore.js";
import * as m58 from "./supervisor.js";
import * as m59 from "./supervisor/maintenance.js";
import * as m60 from "./supervisor/pidfile.js";
import * as m61 from "./supervisor/pidfiled.js";
import * as m62 from "./supervisor/signals.js";
import * as m63 from "./thread-pool.js";
import * as m64 from "./timer.js";
import * as m65 from "./worker.js";

defineConstants([
  [() => m0.AppExecutor, "SolidQueue::AppExecutor"],
  [() => m2.Batch, "SolidQueue::Batch"],
  [() => m2.AlreadyFinished, "SolidQueue::Batch::AlreadyFinished"],
  [() => m3.Callbacks, "SolidQueue::Batch::Callbacks"],
  [() => m4.Clearable, "SolidQueue::Batch::Clearable"],
  [() => m4.ClassMethods, "SolidQueue::Batch::Clearable::ClassMethods"],
  [() => m2.PendingMigrations, "SolidQueue::Batch::PendingMigrations"],
  [() => m5.Status, "SolidQueue::Batch::Status"],
  [() => m6.Sweepable, "SolidQueue::Batch::Sweepable"],
  [() => m6.ClassMethods, "SolidQueue::Batch::Sweepable::ClassMethods"],
  [() => m1.BatchExecution, "SolidQueue::BatchExecution"],
  [() => m7.BlockedExecution, "SolidQueue::BlockedExecution"],
  [() => m8.ClaimedExecution, "SolidQueue::ClaimedExecution"],
  [() => m8.FinalizationError, "SolidQueue::ClaimedExecution::FinalizationError"],
  [() => m8.Result, "SolidQueue::ClaimedExecution::Result"],
  [() => m9.Configuration, "SolidQueue::Configuration"],
  [() => m9.Process, "SolidQueue::Configuration::Process"],
  [() => m10.Dispatcher, "SolidQueue::Dispatcher"],
  [() => m11.ConcurrencyMaintenance, "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m12.Engine, "SolidQueue::Engine"],
  [() => m13.Execution, "SolidQueue::Execution"],
  [() => m14.Dispatching, "SolidQueue::Execution::Dispatching"],
  [() => m14.ClassMethods, "SolidQueue::Execution::Dispatching::ClassMethods"],
  [() => m15.JobAttributes, "SolidQueue::Execution::JobAttributes"],
  [() => m15.ClassMethods, "SolidQueue::Execution::JobAttributes::ClassMethods"],
  [() => m13.UndiscardableError, "SolidQueue::Execution::UndiscardableError"],
  [() => m16.FailedExecution, "SolidQueue::FailedExecution"],
  [() => m17.Batchable, "SolidQueue::FailedExecution::Batchable"],
  [() => m18.FiberPool, "SolidQueue::FiberPool"],
  [() => m19.Job, "SolidQueue::Job"],
  [() => m20.Batchable, "SolidQueue::Job::Batchable"],
  [() => m20.ClassMethods, "SolidQueue::Job::Batchable::ClassMethods"],
  [() => m19.ClassMissingError, "SolidQueue::Job::ClassMissingError"],
  [() => m21.Clearable, "SolidQueue::Job::Clearable"],
  [() => m21.ClassMethods, "SolidQueue::Job::Clearable::ClassMethods"],
  [() => m22.ConcurrencyControls, "SolidQueue::Job::ConcurrencyControls"],
  [() => m22.ClassMethods, "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [() => m19.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m23.Executable, "SolidQueue::Job::Executable"],
  [() => m23.ClassMethods, "SolidQueue::Job::Executable::ClassMethods"],
  [() => m24.Recurrable, "SolidQueue::Job::Recurrable"],
  [() => m25.Retryable, "SolidQueue::Job::Retryable"],
  [() => m26.Schedulable, "SolidQueue::Job::Schedulable"],
  [() => m26.ClassMethods, "SolidQueue::Job::Schedulable::ClassMethods"],
  [() => m27.LifecycleHooks, "SolidQueue::LifecycleHooks"],
  [() => m27.ClassMethods, "SolidQueue::LifecycleHooks::ClassMethods"],
  [() => m28.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m29.Pause, "SolidQueue::Pause"],
  [() => m30.Pool, "SolidQueue::Pool"],
  [() => m31.Process, "SolidQueue::Process"],
  [() => m32.Executor, "SolidQueue::Process::Executor"],
  [() => m33.Prunable, "SolidQueue::Process::Prunable"],
  [() => m33.ClassMethods, "SolidQueue::Process::Prunable::ClassMethods"],
  [() => m34.Base, "SolidQueue::Processes::Base"],
  [() => m35.Callbacks, "SolidQueue::Processes::Callbacks"],
  [() => m36.Interruptible, "SolidQueue::Processes::Interruptible"],
  [() => m37.Poller, "SolidQueue::Processes::Poller"],
  [() => m38.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m39.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m40.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m41.Procline, "SolidQueue::Processes::Procline"],
  [() => m42.Registrable, "SolidQueue::Processes::Registrable"],
  [() => m43.Runnable, "SolidQueue::Processes::Runnable"],
  [() => m44.Supervised, "SolidQueue::Processes::Supervised"],
  [() => m45.UnrecoverableError, "SolidQueue::Processes::UnrecoverableError"],
  [() => m47.Queue, "SolidQueue::Queue"],
  [() => m46.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m48.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m49.Record, "SolidQueue::Record"],
  [() => m50.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m50.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m51.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m52.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m53.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m54.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m55.Scheduler, "SolidQueue::Scheduler"],
  [() => m56.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m57.Semaphore, "SolidQueue::Semaphore"],
  [() => m57.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m58.Supervisor, "SolidQueue::Supervisor"],
  [() => m59.Maintenance, "SolidQueue::Supervisor::Maintenance"],
  [() => m60.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m61.Pidfiled, "SolidQueue::Supervisor::Pidfiled"],
  [() => m62.Signals, "SolidQueue::Supervisor::Signals"],
  [() => m63.ThreadPool, "SolidQueue::ThreadPool"],
  [() => m64.Timer, "SolidQueue::Timer"],
  [() => m65.Worker, "SolidQueue::Worker"],
]);
