'use client';

/** Downscales large phone photos before upload; the server re-encodes them anyway. */
export async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 4 * 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

/** Uploads an image as the request body, the way the photo endpoints expect it. */
export async function uploadImage(url: string, file: File, token: string | null): Promise<Response> {
  const body = await shrinkImage(file);
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': body.type || file.type, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body,
  });
}
