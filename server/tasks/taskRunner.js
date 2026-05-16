import {
    claimNextImageTask,
    getPollingTasks,
    markTaskTimeout,
    resetStuckRunningTasks
} from './taskStore.js';
import { getImageTaskConcurrencyOptions } from './taskQueue.js';
import { executeImageTask, pollImageTaskStatus } from './workers/imageWorker.js';

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_TASK_TIMEOUT_MS = 600000;
const DEFAULT_MAX_RETRIES = 1;

let runnerTimer = null;
let runnerActive = false;
let runnerStopped = true;

function parsePositiveInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getImageTaskRunnerConfig(env = process.env) {
    return {
        pollIntervalMs: parsePositiveInteger(env.IMAGE_TASK_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
        taskTimeoutMs: parsePositiveInteger(env.IMAGE_TASK_TIMEOUT_MS, DEFAULT_TASK_TIMEOUT_MS),
        maxRetries: parsePositiveInteger(env.IMAGE_TASK_MAX_RETRIES, DEFAULT_MAX_RETRIES),
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
    const pollingTasks = await getPollingTasks();

    for (const task of pollingTasks) {
        if (isTaskTimedOut(task, config)) {
            await markTaskTimeout(task.taskId, {
                providerTaskId: task.providerTaskId,
                elapsedMs: getTaskAgeMs(task),
                timeoutMs: config.taskTimeoutMs
            });
            continue;
        }

        await pollImageTaskStatus(task);
    }
}

async function processQueuedTasks(config) {
    while (!runnerStopped) {
        const task = await claimNextImageTask(config.concurrency);
        if (!task) {
            return;
        }

        if (isTaskTimedOut(task, config)) {
            await markTaskTimeout(task.taskId, {
                elapsedMs: getTaskAgeMs(task),
                timeoutMs: config.taskTimeoutMs
            });
            continue;
        }

        await executeImageTask(task);
    }
}

async function runTaskLoop() {
    if (runnerActive || runnerStopped) {
        return;
    }

    runnerActive = true;
    const config = getImageTaskRunnerConfig();

    try {
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
        const resetTasks = await resetStuckRunningTasks();
        if (resetTasks.length > 0) {
            console.log(`[TaskRunner] Reset ${resetTasks.length} stuck running image task(s) to queued.`);
        }
    } catch (error) {
        console.error('[TaskRunner] Failed to reset stuck running tasks:', error);
    }

    console.log('[TaskRunner] Image task runner started', {
        pollIntervalMs: config.pollIntervalMs,
        taskTimeoutMs: config.taskTimeoutMs,
        maxRetries: config.maxRetries,
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
