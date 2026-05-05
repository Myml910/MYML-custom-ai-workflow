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

async function imageUrlToFile(imageUrl: string) {
  const response = await fetch(imageUrl, { cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Failed to load source image: ${response.status}`);
  }

  const blob = await response.blob();
  const mimeType = blob.type || 'image/png';
  const extension = getExtensionFromMimeType(mimeType);

  return new File([blob], `source-image.${extension}`, { type: mimeType });
}

export async function removeImageBackground(imageUrl: string): Promise<string> {
  const imageFile = await imageUrlToFile(imageUrl);
  const formData = new FormData();

  formData.append('file', imageFile);
  formData.append('model', 'inspyrenet');
  formData.append('output', 'rgba');

  const response = await fetch(`${getMattingBaseUrl()}/api/matting/remove-bg`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(message || `Remove background failed: ${response.status}`);
  }

  const resultBlob = await response.blob();
  return blobToDataUrl(resultBlob);
}
