import { defineConstants } from "@blazetrails/ruby-compat";
import "./index.js";
import * as m0 from "./active-job/batch-id.js";
import * as m1 from "./active-job/concurrency-controls.js";
import * as m2 from "./active-job/queue-adapters/solid-queue-adapter.js";
import * as m3 from "./app-executor.js";
import * as m4 from "./batch-execution.js";
import * as m5 from "./batch.js";
import * as m6 from "./batch/callbacks.js";
import * as m7 from "./batch/clearable.js";
import * as m8 from "./batch/status.js";
import * as m9 from "./batch/sweepable.js";
import * as m10 from "./blocked-execution.js";
import * as m11 from "./claimed-execution.js";
import * as m12 from "./configuration.js";
import * as m13 from "./dispatcher.js";
import * as m14 from "./dispatcher/concurrency-maintenance.js";
import * as m15 from "./engine.js";
import * as m16 from "./execution.js";
import * as m17 from "./execution/dispatching.js";
import * as m18 from "./execution/job-attributes.js";
import * as m19 from "./failed-execution.js";
import * as m20 from "./failed-execution/batchable.js";
import * as m21 from "./fiber-pool.js";
import * as m22 from "./job.js";
import * as m23 from "./job/batchable.js";
import * as m24 from "./job/clearable.js";
import * as m25 from "./job/concurrency-controls.js";
import * as m26 from "./job/executable.js";
import * as m27 from "./job/recurrable.js";
import * as m28 from "./job/retryable.js";
import * as m29 from "./job/schedulable.js";
import * as m30 from "./lifecycle-hooks.js";
import * as m31 from "./log-subscriber.js";
import * as m32 from "./pause.js";
import * as m33 from "./pool.js";
import * as m34 from "./process.js";
import * as m35 from "./process/executor.js";
import * as m36 from "./process/prunable.js";
import * as m37 from "./processes/base.js";
import * as m38 from "./processes/callbacks.js";
import * as m39 from "./processes/interruptible.js";
import * as m40 from "./processes/poller.js";
import * as m41 from "./processes/process-exit-error.js";
import * as m42 from "./processes/process-missing-error.js";
import * as m43 from "./processes/process-pruned-error.js";
import * as m44 from "./processes/procline.js";
import * as m45 from "./processes/registrable.js";
import * as m46 from "./processes/runnable.js";
import * as m47 from "./processes/supervised.js";
import * as m48 from "./processes/unrecoverable-error.js";
import * as m49 from "./queue-selector.js";
import * as m50 from "./queue.js";
import * as m51 from "./ready-execution.js";
import * as m52 from "./record.js";
import * as m53 from "./recurring-execution.js";
import * as m54 from "./recurring-job.js";
import * as m55 from "./recurring-task.js";
import * as m56 from "./recurring-task/arguments.js";
import * as m57 from "./scheduled-execution.js";
import * as m58 from "./scheduler.js";
import * as m59 from "./scheduler/recurring-schedule.js";
import * as m60 from "./semaphore.js";
import * as m61 from "./supervisor.js";
import * as m62 from "./supervisor/maintenance.js";
import * as m63 from "./supervisor/pidfile.js";
import * as m64 from "./supervisor/pidfiled.js";
import * as m65 from "./supervisor/signals.js";
import * as m66 from "./thread-pool.js";
import * as m67 from "./timer.js";
import * as m68 from "./worker.js";

defineConstants([
  [() => m0.BatchId, "ActiveJob::BatchId"],
  [() => m1.ConcurrencyControls, "ActiveJob::ConcurrencyControls"],
  [() => m1.ClassMethods, "ActiveJob::ConcurrencyControls::ClassMethods"],
  [() => m2.SolidQueueAdapter, "ActiveJob::QueueAdapters::SolidQueueAdapter"],
  [() => m3.AppExecutor, "SolidQueue::AppExecutor"],
  [() => m5.Batch, "SolidQueue::Batch"],
  [() => m5.AlreadyFinished, "SolidQueue::Batch::AlreadyFinished"],
  [() => m6.Callbacks, "SolidQueue::Batch::Callbacks"],
  [() => m7.Clearable, "SolidQueue::Batch::Clearable"],
  [() => m7.ClassMethods, "SolidQueue::Batch::Clearable::ClassMethods"],
  [() => m5.PendingMigrations, "SolidQueue::Batch::PendingMigrations"],
  [() => m8.Status, "SolidQueue::Batch::Status"],
  [() => m9.Sweepable, "SolidQueue::Batch::Sweepable"],
  [() => m9.ClassMethods, "SolidQueue::Batch::Sweepable::ClassMethods"],
  [() => m4.BatchExecution, "SolidQueue::BatchExecution"],
  [() => m10.BlockedExecution, "SolidQueue::BlockedExecution"],
  [() => m11.ClaimedExecution, "SolidQueue::ClaimedExecution"],
  [() => m11.FinalizationError, "SolidQueue::ClaimedExecution::FinalizationError"],
  [() => m11.Result, "SolidQueue::ClaimedExecution::Result"],
  [() => m12.Configuration, "SolidQueue::Configuration"],
  [() => m12.Process, "SolidQueue::Configuration::Process"],
  [() => m13.Dispatcher, "SolidQueue::Dispatcher"],
  [() => m14.ConcurrencyMaintenance, "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m15.Engine, "SolidQueue::Engine"],
  [() => m16.Execution, "SolidQueue::Execution"],
  [() => m17.Dispatching, "SolidQueue::Execution::Dispatching"],
  [() => m17.ClassMethods, "SolidQueue::Execution::Dispatching::ClassMethods"],
  [() => m18.JobAttributes, "SolidQueue::Execution::JobAttributes"],
  [() => m18.ClassMethods, "SolidQueue::Execution::JobAttributes::ClassMethods"],
  [() => m16.UndiscardableError, "SolidQueue::Execution::UndiscardableError"],
  [() => m19.FailedExecution, "SolidQueue::FailedExecution"],
  [() => m20.Batchable, "SolidQueue::FailedExecution::Batchable"],
  [() => m21.FiberPool, "SolidQueue::FiberPool"],
  [() => m22.Job, "SolidQueue::Job"],
  [() => m23.Batchable, "SolidQueue::Job::Batchable"],
  [() => m23.ClassMethods, "SolidQueue::Job::Batchable::ClassMethods"],
  [() => m22.ClassMissingError, "SolidQueue::Job::ClassMissingError"],
  [() => m24.Clearable, "SolidQueue::Job::Clearable"],
  [() => m24.ClassMethods, "SolidQueue::Job::Clearable::ClassMethods"],
  [() => m25.ConcurrencyControls, "SolidQueue::Job::ConcurrencyControls"],
  [() => m25.ClassMethods, "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [() => m22.EnqueueError, "SolidQueue::Job::EnqueueError"],
  [() => m26.Executable, "SolidQueue::Job::Executable"],
  [() => m26.ClassMethods, "SolidQueue::Job::Executable::ClassMethods"],
  [() => m27.Recurrable, "SolidQueue::Job::Recurrable"],
  [() => m28.Retryable, "SolidQueue::Job::Retryable"],
  [() => m29.Schedulable, "SolidQueue::Job::Schedulable"],
  [() => m29.ClassMethods, "SolidQueue::Job::Schedulable::ClassMethods"],
  [() => m30.LifecycleHooks, "SolidQueue::LifecycleHooks"],
  [() => m30.ClassMethods, "SolidQueue::LifecycleHooks::ClassMethods"],
  [() => m31.LogSubscriber, "SolidQueue::LogSubscriber"],
  [() => m32.Pause, "SolidQueue::Pause"],
  [() => m33.Pool, "SolidQueue::Pool"],
  [() => m34.Process, "SolidQueue::Process"],
  [() => m35.Executor, "SolidQueue::Process::Executor"],
  [() => m36.Prunable, "SolidQueue::Process::Prunable"],
  [() => m36.ClassMethods, "SolidQueue::Process::Prunable::ClassMethods"],
  [() => m37.Base, "SolidQueue::Processes::Base"],
  [() => m46.BootGuards, "SolidQueue::Processes::BootGuards"],
  [() => m46.ForkGuard, "SolidQueue::Processes::BootGuards::ForkGuard"],
  [() => m46.NullGuard, "SolidQueue::Processes::BootGuards::NullGuard"],
  [() => m38.Callbacks, "SolidQueue::Processes::Callbacks"],
  [() => m39.Interruptible, "SolidQueue::Processes::Interruptible"],
  [() => m40.Poller, "SolidQueue::Processes::Poller"],
  [() => m41.ProcessExitError, "SolidQueue::Processes::ProcessExitError"],
  [() => m42.ProcessMissingError, "SolidQueue::Processes::ProcessMissingError"],
  [() => m43.ProcessPrunedError, "SolidQueue::Processes::ProcessPrunedError"],
  [() => m44.Procline, "SolidQueue::Processes::Procline"],
  [() => m45.Registrable, "SolidQueue::Processes::Registrable"],
  [() => m46.Runnable, "SolidQueue::Processes::Runnable"],
  [() => m47.Supervised, "SolidQueue::Processes::Supervised"],
  [() => m48.UnrecoverableError, "SolidQueue::Processes::UnrecoverableError"],
  [() => m50.Queue, "SolidQueue::Queue"],
  [() => m49.QueueSelector, "SolidQueue::QueueSelector"],
  [() => m51.ReadyExecution, "SolidQueue::ReadyExecution"],
  [() => m52.Record, "SolidQueue::Record"],
  [() => m53.RecurringExecution, "SolidQueue::RecurringExecution"],
  [() => m53.AlreadyRecorded, "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m54.RecurringJob, "SolidQueue::RecurringJob"],
  [() => m55.RecurringTask, "SolidQueue::RecurringTask"],
  [() => m56.Arguments, "SolidQueue::RecurringTask::Arguments"],
  [() => m57.ScheduledExecution, "SolidQueue::ScheduledExecution"],
  [() => m58.Scheduler, "SolidQueue::Scheduler"],
  [() => m59.RecurringSchedule, "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m60.Semaphore, "SolidQueue::Semaphore"],
  [() => m60.Proxy, "SolidQueue::Semaphore::Proxy"],
  [() => m61.Supervisor, "SolidQueue::Supervisor"],
  [() => m62.Maintenance, "SolidQueue::Supervisor::Maintenance"],
  [() => m63.Pidfile, "SolidQueue::Supervisor::Pidfile"],
  [() => m64.Pidfiled, "SolidQueue::Supervisor::Pidfiled"],
  [() => m65.Signals, "SolidQueue::Supervisor::Signals"],
  [() => m66.ThreadPool, "SolidQueue::ThreadPool"],
  [() => m67.Timer, "SolidQueue::Timer"],
  [() => m68.Worker, "SolidQueue::Worker"],
]);
