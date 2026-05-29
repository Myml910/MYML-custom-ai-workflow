/**
 * generationService.ts
 * 
 * Frontend service layer for AI content generation.
 * Proxies requests to backend API.
 * - Image: verified APIMart image models
 * - Video: currently disabled
 */

import type { ImageQuality } from '../types';

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  imageBase64?: string | string[]; // Supports single image or array of images
  imageModel?: string; // Project image model id
  nodeId?: string; // ID of the node initiating generation
  legacySource: 'camera-angle' | 'explicit-fallback';
  // Kling V1.5 reference settings
  klingReferenceMode?: 'subject' | 'face';
  klingFaceIntensity?: number; // 0-100
  klingSubjectIntensity?: number; // 0-100
}

export interface GenerateVideoParams {
  prompt: string;
  imageBase64?: string; // For Image-to-Video (start frame)
  lastFrameBase64?: string; // For frame-to-frame interpolation (end frame)
  aspectRatio?: string;
  resolution?: string; // Add resolution to params
  duration?: number; // Video duration in seconds (e.g., 5, 6, 8, 10)
  videoModel?: string; // Video model id
  motionReferenceUrl?: string; // For motion reference workflows
  generateAudio?: boolean;
  nodeId?: string; // ID of the node initiating generation
}

export type GenerationTaskStatus = 'queued' | 'running' | 'polling' | 'completed' | 'failed' | 'timeout' | 'cancelled';

export interface CreateImageTaskParams {
  nodeId: string;
  workflowId?: string | null;
  prompt: string;
  imageModel?: string;
  aspectRatio?: string;
  resolution?: string;
  quality?: ImageQuality;
  referenceImages?: string[];
  source?: string;
  legacySource?: string;
  capability?: string;
  negativePrompt?: string;
  projectCode?: string;
  hermesRunId?: string;
  designTaskId?: string;
  title?: string;
  targetSize?: string;
  referenceIds?: string[];
  referenceUsage?: string;
  originalModelRecommendation?: string;
  normalizedModelRecommendation?: string;
}

export interface CreateImageTaskResponse {
  taskId: string;
  nodeId: string;
  status: GenerationTaskStatus;
}

export interface GenerationTask {
  taskId: string;
  userId?: string;
  username?: string;
  workflowId?: string | null;
  nodeId: string;
  taskType?: string;
  provider?: string;
  model?: string;
  status: GenerationTaskStatus;
  prompt?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  resultUrl?: string | null;
  providerTaskId?: string | null;
  progress?: number | null;
  errorType?: string | null;
  errorMessage?: string | null;
  submittedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  failedAt?: string | null;
  durationMs?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface HermesGenerationTaskRecovery {
  generationTaskId: string;
  status: GenerationTaskStatus;
  model?: string | null;
  provider?: string | null;
  designTaskId?: string | null;
  projectCode?: string | null;
  hermesRunId?: string | null;
  resultUrl?: string | null;
  progress?: number | null;
  errorMessageSafe?: string | null;
  originalModelRecommendation?: string | null;
  normalizedModelRecommendation?: string | null;
  referenceIds?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WaitForImageTaskOptions {
  pollIntervalMs?: number;
  intervalMs?: number;
  maxWaitMs?: number;
  signal?: AbortSignal;
  onTaskUpdate?: (task: GenerationTask) => void;
}

const DEFAULT_TASK_POLL_INTERVAL_MS = 4000;
const DEFAULT_TASK_MAX_WAIT_MS = 5 * 60 * 1000;
const ACTIVE_TASK_STATUSES = new Set<GenerationTaskStatus>(['queued', 'running', 'polling']);

const IMAGE_TASK_POLLING_ABORTED_MESSAGE = 'Image task polling aborted';
const IMAGE_TASK_POLLING_TIMEOUT_MESSAGE = 'Image task polling timed out';

async function readJsonResponse(response: Response): Promise<any> {
  return response.json().catch(() => ({}));
}

/**
 * Creates an asynchronous image generation task.
 */
export const createImageTask = async (params: CreateImageTaskParams): Promise<CreateImageTaskResponse> => {
  const response = await fetch('/api/tasks/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(params)
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  if (!data.taskId) {
    throw new Error('Image task response did not include taskId');
  }

  return data;
};

/**
 * Fetches a generation task by task id.
 */
export const getTask = async (
  taskId: string,
  options: { signal?: AbortSignal } = {}
): Promise<GenerationTask> => {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    credentials: 'include',
    signal: options.signal
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data;
};

const throwIfPollingAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) {
    throw new Error(IMAGE_TASK_POLLING_ABORTED_MESSAGE);
  }
};

const waitWithAbort = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    throwIfPollingAborted(signal);

    const timeoutId = window.setTimeout(() => {
      signal?.removeEventListener('abort', handleAbort);
      resolve();
    }, ms);

    function handleAbort() {
      window.clearTimeout(timeoutId);
      reject(new Error(IMAGE_TASK_POLLING_ABORTED_MESSAGE));
    }

    signal?.addEventListener('abort', handleAbort, { once: true });
  });

const normalizePollingError = (error: unknown, signal?: AbortSignal): never => {
  if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
    throw new Error(IMAGE_TASK_POLLING_ABORTED_MESSAGE);
  }

  throw error;
};

/**
 * Fetches the latest task for a node, optionally scoped to a workflow.
 */
export const getTaskByNodeId = async (
  nodeId: string,
  workflowId?: string | null
): Promise<{ task: GenerationTask | null }> => {
  const query = workflowId ? `?workflowId=${encodeURIComponent(workflowId)}` : '';
  const response = await fetch(`/api/tasks/by-node/${encodeURIComponent(nodeId)}${query}`, {
    credentials: 'include'
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data;
};

/**
 * Fetches existing Hermes design task image-generation tasks for recovery.
 */
export const getHermesGenerationTasksForRun = async (
  hermesRunId: string,
  projectCode?: string | null
): Promise<{ tasks: HermesGenerationTaskRecovery[] }> => {
  const query = projectCode ? `?projectCode=${encodeURIComponent(projectCode)}` : '';
  const response = await fetch(`/api/tasks/hermes/${encodeURIComponent(hermesRunId)}${query}`, {
    credentials: 'include'
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return {
    tasks: Array.isArray(data.tasks) ? data.tasks : []
  };
};

/**
 * Cancels a queued generation task.
 */
export const cancelTask = async (taskId: string): Promise<{ task: GenerationTask }> => {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: 'POST',
    credentials: 'include'
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data;
};

/**
 * Polls a queued image generation task until it reaches a terminal state.
 */
export const waitForImageTaskCompletion = async (
  taskId: string,
  options: WaitForImageTaskOptions = {}
): Promise<GenerationTask> => {
  const intervalMs = options.pollIntervalMs || options.intervalMs || DEFAULT_TASK_POLL_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_TASK_MAX_WAIT_MS;
  const startedAt = Date.now();

  try {
    while (true) {
      throwIfPollingAborted(options.signal);

      if (Date.now() - startedAt > maxWaitMs) {
        throw new Error(IMAGE_TASK_POLLING_TIMEOUT_MESSAGE);
      }

      const task = await getTask(taskId, { signal: options.signal });
      options.onTaskUpdate?.(task);

      if (task.status === 'completed' || task.status === 'failed' || task.status === 'timeout' || task.status === 'cancelled') {
        return task;
      }

      if (!ACTIVE_TASK_STATUSES.has(task.status)) {
        throw new Error(`Unexpected image task status: ${task.status}`);
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = Math.max(0, maxWaitMs - elapsedMs);
      if (remainingMs <= 0) {
        throw new Error(IMAGE_TASK_POLLING_TIMEOUT_MESSAGE);
      }

      await waitWithAbort(Math.min(intervalMs, remainingMs), options.signal);
    }
  } catch (error) {
    normalizePollingError(error, options.signal);
  }
};

/**
 * Legacy compatibility endpoint only. New image generation should use /api/tasks/image.
 */
export const generateImageLegacy = async (params: GenerateImageParams): Promise<string> => {
  try {
    if (!params.legacySource) {
      throw new Error('Legacy image generation requires an explicit legacySource.');
    }

    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-MYML-Legacy-Generation-Source': params.legacySource
      },
      credentials: 'include',
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    const data = await response.json();
    if (!data.resultUrl) {
      throw new Error("No image data returned from server");
    }
    return data.resultUrl;

  } catch (error) {
    console.error("Image Generation Error:", error);
    throw error;
  }
};

/**
 * Generates a video by calling the backend API
 */
export const generateVideo = async (params: GenerateVideoParams): Promise<string> => {
  try {
    const response = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || response.statusText);
    }

    const data = await response.json();
    if (!data.resultUrl) {
      throw new Error("No video data returned from server");
    }
    return data.resultUrl;

  } catch (error) {
    console.error("Video Generation Error:", error);
    throw error;
  }
};
