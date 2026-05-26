interface ImagePromptReverseRequest {
  imageUrl: string;
  sourceNodeId?: string;
  sourceImageIndex?: number;
}

interface ImagePromptReverseResponse {
  success?: boolean;
  text?: string;
  error?: string;
  message?: string;
}

async function readImagePromptReverseError(response: Response): Promise<string> {
  try {
    const data = await response.json() as ImagePromptReverseResponse;
    return data.error || data.message || 'Image analysis failed';
  } catch {
    return 'Image analysis failed';
  }
}

function getFriendlyImagePromptReverseError(message: string): string {
  const normalized = message.toLowerCase();

  if (normalized.includes('timeout') || normalized.includes('timed out')) {
    return '图片分析超时，请稍后重试或切换模型';
  }

  return '图片分析失败，请重试';
}

export async function analyzeImagePromptReverse({
  imageUrl,
  sourceNodeId,
  sourceImageIndex
}: ImagePromptReverseRequest): Promise<string> {
  let response: Response;

  try {
    response = await fetch('/api/agent/image-prompt-reverse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        imageUrl,
        sourceNodeId,
        sourceImageIndex
      })
    });
  } catch (error) {
    console.error('[ImagePromptReverse] request failed:', error);
    throw new Error('图片分析失败，请重试');
  }

  if (!response.ok) {
    const rawError = await readImagePromptReverseError(response);
    console.error('[ImagePromptReverse] provider error:', rawError);
    throw new Error(getFriendlyImagePromptReverseError(rawError));
  }

  const data = await response.json() as ImagePromptReverseResponse;
  const text = typeof data.text === 'string' ? data.text.trim() : '';

  if (!text) {
    const rawError = data.error || data.message || 'Image analysis returned empty text';
    console.error('[ImagePromptReverse] empty response:', rawError);
    throw new Error(getFriendlyImagePromptReverseError(rawError));
  }

  return text;
}
