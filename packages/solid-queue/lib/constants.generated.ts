import { defineConstants } from "@blazetrails/ruby-compat/classpath";
import "./index.js";
import * as m0 from "./active-job/batch-id.js";
import * as m1 from "./active-job/concurrency-controls.js";
import * as m2 from "./active-job/queue-adapters/solid-queue-adapter.js";
import * as m3 from "./app-executor.js";
import * as m4 from "./async-supervisor.js";
import * as m5 from "./batch-execution.js";
import * as m6 from "./batch.js";
import * as m7 from "./batch/callbacks.js";
import * as m8 from "./batch/clearable.js";
import * as m9 from "./batch/status.js";
import * as m10 from "./batch/sweepable.js";
import * as m11 from "./blocked-execution.js";
import * as m12 from "./claimed-execution.js";
import * as m13 from "./configuration.js";
import * as m14 from "./dispatcher.js";
import * as m15 from "./dispatcher/concurrency-maintenance.js";
import * as m16 from "./dispatcher/maintenance.js";
import * as m17 from "./engine.js";
import * as m18 from "./execution.js";
import * as m19 from "./execution/dispatching.js";
import * as m20 from "./execution/job-attributes.js";
import * as m21 from "./failed-execution.js";
import * as m22 from "./failed-execution/batchable.js";
import * as m23 from "./fiber-pool.js";
import * as m24 from "./fork-supervisor.js";
import * as m25 from "./job.js";
import * as m26 from "./job/batchable.js";
import * as m27 from "./job/clearable.js";
import * as m28 from "./job/concurrency-controls.js";
import * as m29 from "./job/executable.js";
import * as m30 from "./job/recurrable.js";
import * as m31 from "./job/retryable.js";
import * as m32 from "./job/schedulable.js";
import * as m33 from "./lifecycle-hooks.js";
import * as m34 from "./log-subscriber.js";
import * as m35 from "./pause.js";
import * as m36 from "./pool.js";
import * as m37 from "./process.js";
import * as m38 from "./process/executor.js";
import * as m39 from "./process/prunable.js";
import * as m40 from "./processes/base.js";
import * as m41 from "./processes/callbacks.js";
import * as m42 from "./processes/interruptible.js";
import * as m43 from "./processes/poller.js";
import * as m44 from "./processes/process-exit-error.js";
import * as m45 from "./processes/process-missing-error.js";
import * as m46 from "./processes/process-pruned-error.js";
import * as m47 from "./processes/procline.js";
import * as m48 from "./processes/registrable.js";
import * as m49 from "./processes/runnable.js";
import * as m50 from "./processes/supervised.js";
import * as m51 from "./processes/thread-terminated-error.js";
import * as m52 from "./processes/unrecoverable-error.js";
import * as m53 from "./queue-selector.js";
import * as m54 from "./queue.js";
import * as m55 from "./ready-execution.js";
import * as m56 from "./record.js";
import * as m57 from "./record/distinct-values.js";
import * as m58 from "./recurring-execution.js";
import * as m59 from "./recurring-job.js";
import * as m60 from "./recurring-task.js";
import * as m61 from "./recurring-task/arguments.js";
import * as m62 from "./scheduled-execution.js";
import * as m63 from "./scheduler.js";
import * as m64 from "./scheduler/recurring-schedule.js";
import * as m65 from "./semaphore.js";
import * as m66 from "./supervisor.js";
import * as m67 from "./supervisor/maintenance.js";
import * as m68 from "./supervisor/pidfile.js";
import * as m69 from "./supervisor/pidfiled.js";
import * as m70 from "./supervisor/signals.js";
import * as m71 from "./thread-pool.js";
import * as m72 from "./timer.js";
import * as m73 from "./worker.js";

defineConstants([
  [() => m0, "BatchId", "ActiveJob::BatchId"],
  [() => m1, "ConcurrencyControls", "ActiveJob::ConcurrencyControls"],
  [() => m1, "ClassMethods", "ActiveJob::ConcurrencyControls::ClassMethods"],
  [() => m2, "SolidQueueAdapter", "ActiveJob::QueueAdapters::SolidQueueAdapter"],
  [() => m3, "AppExecutor", "SolidQueue::AppExecutor"],
  [() => m4, "AsyncSupervisor", "SolidQueue::AsyncSupervisor"],
  [() => m6, "Batch", "SolidQueue::Batch"],
  [() => m6, "AlreadyFinished", "SolidQueue::Batch::AlreadyFinished"],
  [() => m7, "Callbacks", "SolidQueue::Batch::Callbacks"],
  [() => m8, "Clearable", "SolidQueue::Batch::Clearable"],
  [() => m8, "ClassMethods", "SolidQueue::Batch::Clearable::ClassMethods"],
  [() => m6, "PendingMigrations", "SolidQueue::Batch::PendingMigrations"],
  [() => m9, "Status", "SolidQueue::Batch::Status"],
  [() => m10, "Sweepable", "SolidQueue::Batch::Sweepable"],
  [() => m10, "ClassMethods", "SolidQueue::Batch::Sweepable::ClassMethods"],
  [() => m5, "BatchExecution", "SolidQueue::BatchExecution"],
  [() => m11, "BlockedExecution", "SolidQueue::BlockedExecution"],
  [() => m12, "ClaimedExecution", "SolidQueue::ClaimedExecution"],
  [() => m12, "FinalizationError", "SolidQueue::ClaimedExecution::FinalizationError"],
  [() => m12, "Result", "SolidQueue::ClaimedExecution::Result"],
  [() => m13, "Configuration", "SolidQueue::Configuration"],
  [() => m13, "Process", "SolidQueue::Configuration::Process"],
  [() => m14, "Dispatcher", "SolidQueue::Dispatcher"],
  [() => m15, "ConcurrencyMaintenance", "SolidQueue::Dispatcher::ConcurrencyMaintenance"],
  [() => m16, "Maintenance", "SolidQueue::Dispatcher::Maintenance"],
  [() => m17, "Engine", "SolidQueue::Engine"],
  [() => m18, "Execution", "SolidQueue::Execution"],
  [() => m19, "Dispatching", "SolidQueue::Execution::Dispatching"],
  [() => m19, "ClassMethods", "SolidQueue::Execution::Dispatching::ClassMethods"],
  [() => m20, "JobAttributes", "SolidQueue::Execution::JobAttributes"],
  [() => m20, "ClassMethods", "SolidQueue::Execution::JobAttributes::ClassMethods"],
  [() => m18, "UndiscardableError", "SolidQueue::Execution::UndiscardableError"],
  [() => m21, "FailedExecution", "SolidQueue::FailedExecution"],
  [() => m22, "Batchable", "SolidQueue::FailedExecution::Batchable"],
  [() => m23, "FiberPool", "SolidQueue::FiberPool"],
  [() => m24, "ForkSupervisor", "SolidQueue::ForkSupervisor"],
  [() => m25, "Job", "SolidQueue::Job"],
  [() => m26, "Batchable", "SolidQueue::Job::Batchable"],
  [() => m26, "ClassMethods", "SolidQueue::Job::Batchable::ClassMethods"],
  [() => m25, "ClassMissingError", "SolidQueue::Job::ClassMissingError"],
  [() => m27, "Clearable", "SolidQueue::Job::Clearable"],
  [() => m27, "ClassMethods", "SolidQueue::Job::Clearable::ClassMethods"],
  [() => m28, "ConcurrencyControls", "SolidQueue::Job::ConcurrencyControls"],
  [() => m28, "ClassMethods", "SolidQueue::Job::ConcurrencyControls::ClassMethods"],
  [() => m25, "EnqueueError", "SolidQueue::Job::EnqueueError"],
  [() => m29, "Executable", "SolidQueue::Job::Executable"],
  [() => m29, "ClassMethods", "SolidQueue::Job::Executable::ClassMethods"],
  [() => m30, "Recurrable", "SolidQueue::Job::Recurrable"],
  [() => m31, "Retryable", "SolidQueue::Job::Retryable"],
  [() => m32, "Schedulable", "SolidQueue::Job::Schedulable"],
  [() => m32, "ClassMethods", "SolidQueue::Job::Schedulable::ClassMethods"],
  [() => m33, "LifecycleHooks", "SolidQueue::LifecycleHooks"],
  [() => m33, "ClassMethods", "SolidQueue::LifecycleHooks::ClassMethods"],
  [() => m34, "LogSubscriber", "SolidQueue::LogSubscriber"],
  [() => m35, "Pause", "SolidQueue::Pause"],
  [() => m36, "Pool", "SolidQueue::Pool"],
  [() => m37, "Process", "SolidQueue::Process"],
  [() => m38, "Executor", "SolidQueue::Process::Executor"],
  [() => m39, "Prunable", "SolidQueue::Process::Prunable"],
  [() => m39, "ClassMethods", "SolidQueue::Process::Prunable::ClassMethods"],
  [() => m40, "Base", "SolidQueue::Processes::Base"],
  [() => m49, "BootGuards", "SolidQueue::Processes::BootGuards"],
  [() => m49, "ForkGuard", "SolidQueue::Processes::BootGuards::ForkGuard"],
  [() => m49, "NullGuard", "SolidQueue::Processes::BootGuards::NullGuard"],
  [() => m41, "Callbacks", "SolidQueue::Processes::Callbacks"],
  [() => m42, "Interruptible", "SolidQueue::Processes::Interruptible"],
  [() => m43, "Poller", "SolidQueue::Processes::Poller"],
  [() => m44, "ProcessExitError", "SolidQueue::Processes::ProcessExitError"],
  [() => m45, "ProcessMissingError", "SolidQueue::Processes::ProcessMissingError"],
  [() => m46, "ProcessPrunedError", "SolidQueue::Processes::ProcessPrunedError"],
  [() => m47, "Procline", "SolidQueue::Processes::Procline"],
  [() => m48, "Registrable", "SolidQueue::Processes::Registrable"],
  [() => m49, "Runnable", "SolidQueue::Processes::Runnable"],
  [() => m50, "Supervised", "SolidQueue::Processes::Supervised"],
  [() => m51, "ThreadTerminatedError", "SolidQueue::Processes::ThreadTerminatedError"],
  [() => m52, "UnrecoverableError", "SolidQueue::Processes::UnrecoverableError"],
  [() => m54, "Queue", "SolidQueue::Queue"],
  [() => m53, "QueueSelector", "SolidQueue::QueueSelector"],
  [() => m55, "ReadyExecution", "SolidQueue::ReadyExecution"],
  [() => m56, "Record", "SolidQueue::Record"],
  [() => m57, "DistinctValues", "SolidQueue::Record::DistinctValues"],
  [() => m57, "ClassMethods", "SolidQueue::Record::DistinctValues::ClassMethods"],
  [() => m58, "RecurringExecution", "SolidQueue::RecurringExecution"],
  [() => m58, "AlreadyRecorded", "SolidQueue::RecurringExecution::AlreadyRecorded"],
  [() => m59, "RecurringJob", "SolidQueue::RecurringJob"],
  [() => m60, "RecurringTask", "SolidQueue::RecurringTask"],
  [() => m61, "Arguments", "SolidQueue::RecurringTask::Arguments"],
  [() => m62, "ScheduledExecution", "SolidQueue::ScheduledExecution"],
  [() => m63, "Scheduler", "SolidQueue::Scheduler"],
  [() => m64, "RecurringSchedule", "SolidQueue::Scheduler::RecurringSchedule"],
  [() => m65, "Semaphore", "SolidQueue::Semaphore"],
  [() => m65, "Proxy", "SolidQueue::Semaphore::Proxy"],
  [() => m66, "Supervisor", "SolidQueue::Supervisor"],
  [() => m67, "Maintenance", "SolidQueue::Supervisor::Maintenance"],
  [() => m68, "Pidfile", "SolidQueue::Supervisor::Pidfile"],
  [() => m69, "Pidfiled", "SolidQueue::Supervisor::Pidfiled"],
  [() => m70, "Signals", "SolidQueue::Supervisor::Signals"],
  [() => m71, "ThreadPool", "SolidQueue::ThreadPool"],
  [() => m72, "Timer", "SolidQueue::Timer"],
  [() => m73, "Worker", "SolidQueue::Worker"],
]);
