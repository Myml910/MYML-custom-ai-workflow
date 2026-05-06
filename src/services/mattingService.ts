const DEFAULT_MATTING_BASE_URL = 'http://127.0.0.1:8000';

function getMattingBaseUrl() {
  return ((import.meta as any).env?.VITE_MYML_MATTING_BASE_URL || DEFAULT_MATTING_BASE_URL).replace(/\/$/, '');
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function getExtensionFromMimeType(mimeType: string) {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/png') return 'png';
  return 'png';
}

async function dataUrlToFile(dataUrl: string) {
  const [header, base64Data] = dataUrl.split(',');
  const mimeType = header.match(/^data:(.*?);base64$/)?.[1] || 'image/png';

  if (!base64Data) {
    throw new Error('Invalid data URL source image.');
  }

  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = getExtensionFromMimeType(mimeType);
  return new File([bytes], `source-image.${extension}`, { type: mimeType });
}

async function imageUrlToFile(imageUrl: string) {
  if (imageUrl.startsWith('data:')) {
    return dataUrlToFile(imageUrl);
  }

  const response = await fetch(imageUrl, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to load source image: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';
  const extension = getExtensionFromMimeType(mimeType);

  return new File([blob], `source-image.${extension}`, { type: mimeType });
}

async function readErrorBody(response: Response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json().catch(() => null);
  }

  return response.text().catch(() => '');
}

export async function removeImageBackground(imageUrl: string): Promise<string> {
  const imageFile = await imageUrlToFile(imageUrl);
  const formData = new FormData();
  const endpoint = `${getMattingBaseUrl()}/api/matting/remove-bg`;

  formData.append('file', imageFile);
  formData.append('model', 'inspyrenet');
  formData.append('output', 'rgba');

  console.log('[Matting] remove-bg request:', {
    endpoint,
    fields: ['file', 'model', 'output'],
    file: {
      name: imageFile.name,
      type: imageFile.type,
      size: imageFile.size
    },
    model: 'inspyrenet',
    output: 'rgba'
  });

  const response = await fetch(endpoint, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorBody = await readErrorBody(response);
    console.error('[Matting] remove-bg failed:', {
      status: response.status,
      statusText: response.statusText,
      body: errorBody
    });

    const message = typeof errorBody === 'string'
      ? errorBody
      : errorBody
        ? JSON.stringify(errorBody)
        : '';

    throw new Error(message || `Remove background failed: ${response.status}`);
  }

  const resultBlob = await response.blob();
  return blobToDataUrl(resultBlob);
}
