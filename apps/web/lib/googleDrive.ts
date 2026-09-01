'use client';

/**
 * Client-side Google Drive access via Google Identity Services (GIS) — the
 * user grants this app access to files it creates in THEIR OWN Drive
 * (drive.file scope, never their whole Drive) through Google's own consent
 * popup. No service account, no server, no secret ever touches the browser
 * — only a public OAuth Client ID, which is safe to ship in client code.
 */

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}

interface TokenClient {
  callback: (response: TokenResponse) => void;
  requestAccessToken: (opts?: { prompt?: string }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
          }) => TokenClient;
          revoke: (token: string, done: () => void) => void;
        };
      };
    };
  }
}

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

let tokenClient: TokenClient | null = null;
let cachedToken: { accessToken: string; expiresAt: number } | null = null;
let gisLoadingPromise: Promise<void> | null = null;

function loadGisScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('browser-only'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoadingPromise) return gisLoadingPromise;

  gisLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('gis-load-failed'));
    document.head.appendChild(script);
  });
  return gisLoadingPromise;
}

export function isGoogleDriveConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID);
}

/** Shows Google's consent popup on first use per browser; silent afterwards until the token expires (~1h). */
export async function connectGoogleDrive(): Promise<string> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  if (!clientId) {
    throw new Error('drive-not-configured');
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }

  await loadGisScript();

  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: () => undefined,
      });
    }
    tokenClient.callback = (response) => {
      if (response.error || !response.access_token) {
        reject(new Error(response.error || 'auth-failed'));
        return;
      }
      cachedToken = {
        accessToken: response.access_token,
        expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000,
      };
      resolve(response.access_token);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function disconnectGoogleDrive() {
  if (cachedToken && typeof window !== 'undefined' && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(cachedToken.accessToken, () => undefined);
  }
  cachedToken = null;
}

export type DriveUploadResult = { fileId: string; publicUrl: string; webViewLink: string };

export async function uploadFileToDrive(params: {
  file: Blob;
  fileName: string;
  mimeType: string;
  makePublic?: boolean;
}): Promise<DriveUploadResult> {
  const accessToken = await connectGoogleDrive();

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify({ name: params.fileName, mimeType: params.mimeType })], { type: 'application/json' }));
  form.append('file', params.file);

  const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  if (!createRes.ok) {
    throw new Error(`drive-upload-failed:${createRes.status}`);
  }
  const created: { id: string; webViewLink?: string } = await createRes.json();
  let publicUrl = '';

  if (params.makePublic) {
    await fetch(`https://www.googleapis.com/drive/v3/files/${created.id}/permissions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'reader', type: 'anyone' }),
    });
    publicUrl = `https://drive.google.com/thumbnail?id=${created.id}&sz=w1000`;
  }

  return { fileId: created.id, publicUrl, webViewLink: created.webViewLink ?? '' };
}

export function uploadTextFileToDrive(params: { text: string; fileName: string }): Promise<DriveUploadResult> {
  return uploadFileToDrive({
    file: new Blob([params.text], { type: 'text/csv;charset=utf-8' }),
    fileName: params.fileName,
    mimeType: 'text/csv',
  });
}
