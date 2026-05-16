/**
 * generationService.ts
 * 
 * Frontend service layer for AI content generation.
 * Proxies requests to backend API.
 * - Image: verified APIMart image models
 * - Video: currently disabled
 */

export interface GenerateImageParams {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  imageBase64?: string | string[]; // Supports single image or array of images
  imageModel?: string; // Project image model id
  nodeId?: string; // ID of the node initiating generation
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
  referenceImages?: string[];
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
export const getTask = async (taskId: string): Promise<GenerationTask> => {
  const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}`, {
    credentials: 'include'
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data;
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
 * Generates an image by calling the backend API
 */
export const generateImage = async (params: GenerateImageParams): Promise<string> => {
  try {
    const response = await fetch('/api/generate-image', {
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
