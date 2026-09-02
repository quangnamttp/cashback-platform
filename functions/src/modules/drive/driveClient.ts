import { google } from 'googleapis';

/**
 * Application Default Credentials — the project's own Cloud Functions
 * service account (<project-id>@appspot.gserviceaccount.com). No key file
 * to generate, store, or rotate: just share a Drive folder with that
 * service account email (Editor) and set DRIVE_FOLDER_ID. drive.file scope
 * only grants access to files this app itself creates, not the whole Drive.
 */
export async function getDriveClient() {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
  const authClient = await auth.getClient();
  return google.drive({ version: 'v3', auth: authClient as never });
}
