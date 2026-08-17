/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp, cert, ServiceAccount } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { config } from '../config.ts';

function loadAdminCredential() {
  if (config.firebase.serviceAccountKey) {
    try {
      const raw = JSON.parse(config.firebase.serviceAccountKey) as Record<string, unknown>;
      const payload: ServiceAccount = {
        projectId: String(raw.projectId ?? raw.project_id ?? ''),
        clientEmail: String(raw.clientEmail ?? raw.client_email ?? ''),
        privateKey: String(raw.privateKey ?? raw.private_key ?? '').replace(/\\n/g, '\n'),
      };
      if (!payload.projectId || !payload.clientEmail || !payload.privateKey) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is missing required service-account fields.');
      }
      return cert(payload);
    } catch (err) {
      if (config.isProduction) throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY configuration.');
      console.warn('[Firebase Admin] Invalid service-account configuration:', err);
    }
  }

  if (config.firebase.googleApplicationCredentials) {
    return cert(config.firebase.googleApplicationCredentials);
  }

  if (config.isProduction) throw new Error('Firebase Admin credentials are required in production.');
  return undefined;
}

const adminOptions: { projectId?: string; credential?: ReturnType<typeof cert> } = {};
const credential = loadAdminCredential();
if (credential) adminOptions.credential = credential;

const app = getApps().length === 0 ? initializeApp(adminOptions) : getApp();
export const adminAuth = getAuth(app);

export async function setUserCustomClaims(
  uid: string,
  claims: { workspaceId: string; role: string }
): Promise<{ success: boolean; reason?: string }> {
  try {
    if (!uid || !claims.workspaceId || !claims.role) {
      return { success: false, reason: 'Required Firebase claim assignment values are missing' };
    }

    const expectedClaims = {
      workspaceId: claims.workspaceId,
      tenantId: claims.workspaceId,
      role: claims.role,
    };
    await adminAuth.setCustomUserClaims(uid, expectedClaims);
    const updatedUser = await adminAuth.getUser(uid);
    const actualClaims = updatedUser.customClaims || {};
    if (
      actualClaims.workspaceId !== expectedClaims.workspaceId ||
      actualClaims.tenantId !== expectedClaims.tenantId ||
      actualClaims.role !== expectedClaims.role
    ) {
      console.error('[Firebase Admin Claims Verification Failed]', { uid });
      return { success: false, reason: 'Firebase custom-claim read-back did not match the requested assignment' };
    }
    console.log(`[Firebase Admin] Set custom claims for user ${uid}: workspaceId=${claims.workspaceId}, role=${claims.role}`);
    return { success: true };
  } catch (err: any) {
    console.error('[Firebase Admin Claims Assignment Failed]', {
      uid,
      code: err?.code || 'FIREBASE_CLAIMS_ERROR'
    });
    return { success: false, reason: 'Firebase custom-claim assignment failed' };
  }
}
