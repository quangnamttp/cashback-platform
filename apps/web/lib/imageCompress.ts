'use client';

/**
 * Shared by SupportChatWidget.tsx (customer) and manager/support-chat/
 * page.tsx (admin) — both embed chat images as a base64 data URL directly
 * on the Firestore message doc (no Storage bucket in this architecture).
 * Firestore hard-caps a document at 1,048,576 bytes, and base64 inflates
 * raw bytes by ~33% — so once the rest of the message's own fields are
 * counted, there is no real room to raise this ceiling much further (the
 * theoretical safe max is ~730KB raw before the doc itself risks tipping
 * over 1MB). The actual UX problem this fixes isn't the ceiling — it's
 * that a modern phone photo (routinely 2-8MB) was previously rejected
 * outright instead of being resized down to fit under it.
 */
export const MAX_CHAT_IMAGE_BYTES = 650 * 1024;

// Progressively smaller candidates are tried in order until one fits under
// MAX_CHAT_IMAGE_BYTES — dimension first (usually enough on its own for a
// typical phone photo), then quality within each dimension step.
const MAX_DIMENSION_STEPS = [1600, 1200, 900, 600];
const QUALITY_STEPS = [0.85, 0.7, 0.55, 0.4];

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'));
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });
}

/** Only the base64 payload after the comma counts toward Firestore's stored bytes. */
function dataUrlByteLength(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * Returns a data URL guaranteed to fit under MAX_CHAT_IMAGE_BYTES, or null
 * if even the smallest/lowest-quality attempt still doesn't (kept as an
 * explicit possibility rather than silently exceeding the ceiling — an
 * unusually dense image, or a non-image file picked by mistake). Already-
 * small files (screenshots, small photos) are returned completely
 * untouched — no quality loss for the common case that didn't need this.
 */
export async function compressImageForChat(file: File): Promise<string | null> {
  const original = await readFileAsDataUrl(file);
  if (file.size <= MAX_CHAT_IMAGE_BYTES) return original;

  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    // Not a decodable image (e.g. a corrupt file) — nothing to compress.
    return dataUrlByteLength(original) <= MAX_CHAT_IMAGE_BYTES ? original : null;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrlByteLength(original) <= MAX_CHAT_IMAGE_BYTES ? original : null;

  let smallest: string | null = null;
  for (const maxDim of MAX_DIMENSION_STEPS) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITY_STEPS) {
      const candidate = canvas.toDataURL('image/jpeg', quality);
      if (dataUrlByteLength(candidate) <= MAX_CHAT_IMAGE_BYTES) return candidate;
      smallest = candidate;
    }
  }

  return smallest && dataUrlByteLength(smallest) <= MAX_CHAT_IMAGE_BYTES ? smallest : null;
}
