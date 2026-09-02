import * as functions from 'firebase-functions';
import { Readable } from 'stream';
import { admin, db } from '../../lib/admin';
import { REGION } from '../../lib/constants';
import { getDriveClient } from './driveClient';

const MAX_BASE64_LENGTH = 8 * 1024 * 1024;

/**
 * Feature 1: Google Drive as secondary storage for heavy files (proof
 * images, documents), so Firestore stays lean/fast at ~100-user scale —
 * Firestore stores only the resulting driveFileId/webViewLink, never the
 * file bytes.
 */
export const uploadDriveFile = functions.region(REGION).https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Cần đăng nhập để tải tệp lên.');
  }

  const base64Content = data?.base64Content;
  const fileName = data?.fileName;
  const mimeType = data?.mimeType;
  const category = typeof data?.category === 'string' ? data.category : 'general';
  const relatedUserId = typeof data?.relatedUserId === 'string' ? data.relatedUserId : null;

  if (typeof base64Content !== 'string' || !fileName || !mimeType) {
    throw new functions.https.HttpsError('invalid-argument', 'Thiếu nội dung tệp, tên tệp hoặc mimeType.');
  }
  if (base64Content.length > MAX_BASE64_LENGTH) {
    throw new functions.https.HttpsError('invalid-argument', 'Tệp quá lớn (giới hạn khoảng 6MB).');
  }

  const isAdmin = context.auth.token.role === 'admin';
  const ownerUserId = isAdmin && relatedUserId ? relatedUserId : context.auth.uid;
  // Avatars/chat images need to render in a plain <img> tag, which can't
  // authenticate to a private Drive file — so these categories are shared
  // "anyone with the link" instead of kept private like other uploads
  // (KYC/fraud evidence stay private, never pass makePublic).
  const makePublic = data?.makePublic === true;

  const folderId = process.env.DRIVE_FOLDER_ID;
  if (!folderId) {
    throw new functions.https.HttpsError('failed-precondition', 'Chưa cấu hình thư mục Google Drive (DRIVE_FOLDER_ID).');
  }

  const drive = await getDriveClient();
  const buffer = Buffer.from(base64Content, 'base64');

  const file = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media: { mimeType, body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });

  let publicUrl: string | null = null;
  if (makePublic && file.data.id) {
    await drive.permissions.create({
      fileId: file.data.id,
      requestBody: { role: 'reader', type: 'anyone' },
    });
    publicUrl = `https://drive.google.com/thumbnail?id=${file.data.id}&sz=w1000`;
  }

  const docRef = await db.collection('driveFiles').add({
    ownerUserId,
    category,
    driveFileId: file.data.id,
    webViewLink: file.data.webViewLink,
    publicUrl,
    fileName,
    mimeType,
    uploadedBy: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { ok: true, driveFileId: file.data.id, webViewLink: file.data.webViewLink, publicUrl, docId: docRef.id };
});
