import {
    claimPollingImageTasks,
    claimNextImageTask,
    failPollingTasksMissingProviderTaskId,
    markTaskTimeout,
    sweepExpiredRunningLeases
} from './taskStore.js';
import { getImageTaskConcurrencyOptions } from './taskQueue.js';
import { executeImageTask, pollImageTaskStatus } from './workers/imageWorker.js';
import { getImageTaskMaxAttempts } from '../db/tasks.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TASK_TIMEOUT_MS = 600000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_TASK_WORKER_CONCURRENCY = 2;
const DEFAULT_TASK_LEASE_MS = 120000;
const DEFAULT_TASK_HEARTBEAT_MS = 30000;

let runnerTimer = null;
let runnerActive = false;
let runnerStopped = true;
let defaultWorkerId = null;

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function getImageTaskRunnerConfig(env = process.env) {
    if (!defaultWorkerId) {
        defaultWorkerId = env.TASK_WORKER_ID || `worker-${process.pid}-${Date.now()}`;
    }

    return {
        workerId: env.TASK_WORKER_ID || defaultWorkerId,
        pollIntervalMs: parsePositiveInteger(env.IMAGE_TASK_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
        taskTimeoutMs: parsePositiveInteger(env.IMAGE_TASK_TIMEOUT_MS, DEFAULT_TASK_TIMEOUT_MS),
        maxRetries: parseNonNegativeInteger(env.IMAGE_TASK_MAX_RETRIES, DEFAULT_MAX_RETRIES),
        maxAttempts: getImageTaskMaxAttempts(env),
        workerConcurrency: parsePositiveInteger(env.TASK_WORKER_CONCURRENCY, DEFAULT_TASK_WORKER_CONCURRENCY),
        leaseMs: parsePositiveInteger(env.TASK_LEASE_MS, DEFAULT_TASK_LEASE_MS),
        heartbeatMs: parsePositiveInteger(env.TASK_HEARTBEAT_MS, DEFAULT_TASK_HEARTBEAT_MS),
        concurrency: getImageTaskConcurrencyOptions(env)
    };
}

function getTaskAgeMs(task) {
    const start = task.startedAt || task.createdAt;
    const startedAt = start ? new Date(start).getTime() : Date.now();
    return Date.now() - startedAt;
}

function isTaskTimedOut(task, config) {
    return getTaskAgeMs(task) > config.taskTimeoutMs;
}

async function processPollingTasks(config) {
    const pollingTasks = await claimPollingImageTasks({
        workerId: config.workerId,
        leaseMs: config.leaseMs,
        limit: config.workerConcurrency
    });

    await Promise.allSettled(pollingTasks.map(async (task) => {
        if (isTaskTimedOut(task, config)) {
            await markTaskTimeout(task.taskId, {
                workerId: config.workerId,
                providerTaskId: task.providerTaskId,
                elapsedMs: getTaskAgeMs(task),
                timeoutMs: config.taskTimeoutMs
            });
            return;
        }

        await pollImageTaskStatus(task, {
            workerId: config.workerId,
            leaseMs: config.leaseMs,
            heartbeatMs: config.heartbeatMs
        });
    }));
}

async function processQueuedTasks(config) {
    const tasks = [];
    while (!runnerStopped && tasks.length < config.workerConcurrency) {
        const task = await claimNextImageTask({
            ...config.concurrency,
            workerId: config.workerId,
            leaseMs: config.leaseMs
        });
        if (!task) {
            break;
        }

        if (isTaskTimedOut(task, config)) {
            await markTaskTimeout(task.taskId, {
                workerId: config.workerId,
                elapsedMs: getTaskAgeMs(task),
                timeoutMs: config.taskTimeoutMs
            });
            continue;
        }

        tasks.push(task);
    }

    await Promise.allSettled(tasks.map(task => executeImageTask(task, {
        workerId: config.workerId,
        leaseMs: config.leaseMs,
        heartbeatMs: config.heartbeatMs
    })));
}

async function runTaskLoop() {
    if (runnerActive || runnerStopped) {
        return;
    }

    runnerActive = true;
    const config = getImageTaskRunnerConfig();

    try {
        const sweepResult = await sweepExpiredRunningLeases({ workerId: config.workerId });
        if (sweepResult.resumedPolling.length > 0 || sweepResult.requeued.length > 0 || sweepResult.timedOut.length > 0) {
            console.warn('[TaskRunner] Swept expired image task leases.', {
                resumedPolling: sweepResult.resumedPolling.length,
                requeued: sweepResult.requeued.length,
                timedOut: sweepResult.timedOut.length
            });
        }
        const invalidPollingTasks = await failPollingTasksMissingProviderTaskId();
        if (invalidPollingTasks.length > 0) {
            console.warn(`[TaskRunner] Failed ${invalidPollingTasks.length} polling image task(s) missing provider_task_id.`);
        }
        await processPollingTasks(config);
        await processQueuedTasks(config);
    } catch (error) {
        console.error('[TaskRunner] Image task loop failed:', error);
    } finally {
        runnerActive = false;
    }
}

export async function startTaskRunner() {
    if (runnerTimer) {
        return;
    }

    const config = getImageTaskRunnerConfig();
    runnerStopped = false;

    try {
        const sweepResult = await sweepExpiredRunningLeases({ workerId: config.workerId });
        if (sweepResult.resumedPolling.length > 0 || sweepResult.requeued.length > 0 || sweepResult.timedOut.length > 0) {
            console.warn('[TaskRunner] Swept expired image task leases during startup.', {
                resumedPolling: sweepResult.resumedPolling.length,
                requeued: sweepResult.requeued.length,
                timedOut: sweepResult.timedOut.length
            });
        }
        const invalidPollingTasks = await failPollingTasksMissingProviderTaskId();
        if (invalidPollingTasks.length > 0) {
            console.warn(`[TaskRunner] Failed ${invalidPollingTasks.length} polling image task(s) missing provider_task_id.`);
        }
    } catch (error) {
        console.error('[TaskRunner] Failed to recover stuck image tasks:', error);
    }

    console.log('[TaskRunner] Image task runner started', {
        workerId: config.workerId,
        pollIntervalMs: config.pollIntervalMs,
        taskTimeoutMs: config.taskTimeoutMs,
        maxRetries: config.maxRetries,
        maxAttempts: config.maxAttempts,
        workerConcurrency: config.workerConcurrency,
        leaseMs: config.leaseMs,
        heartbeatMs: config.heartbeatMs,
        concurrency: config.concurrency
    });

    runnerTimer = setInterval(() => {
        runTaskLoop();
    }, config.pollIntervalMs);

    await runTaskLoop();
}

export function stopTaskRunner() {
    runnerStopped = true;
    if (runnerTimer) {
        clearInterval(runnerTimer);
        runnerTimer = null;
    }
    console.log('[TaskRunner] Image task runner stopped');
}
