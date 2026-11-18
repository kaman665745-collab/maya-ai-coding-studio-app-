import { initializeApp } from 'firebase/app';
import {
  applyActionCode,
  browserLocalPersistence,
  browserSessionPersistence,
  confirmPasswordReset,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  verifyPasswordResetCode,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/tasks',
  'https://www.googleapis.com/auth/chat.spaces.readonly',
  'https://www.googleapis.com/auth/chat.messages.create',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/presentations',
];

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const configuredDbId = (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId;
export const db = configuredDbId ? getFirestore(app, configuredDbId) : getFirestore(app);

// Standard OpenID Google provider for clean login / registration across any Google account
const loginGoogleProvider = new GoogleAuthProvider();
loginGoogleProvider.setCustomParameters({ prompt: 'select_account' });

// Extended Google Workspace OAuth provider for Drive/Gmail/Sheets/Tasks/Chat/Forms/Slides Hub
const workspaceGoogleProvider = new GoogleAuthProvider();
workspaceGoogleProvider.setCustomParameters({ prompt: 'select_account' });
for (const scope of WORKSPACE_SCOPES) {
  workspaceGoogleProvider.addScope(scope);
}

// Strict in-memory token storage (never localStorage or sessionStorage)
let cachedWorkspaceAccessToken: string | null = null;
let isSigningIn = false;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: Array<{ providerId?: string | null; email?: string | null }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function subscribeAuthState(
  onUser: (user: User | null, hasWorkspaceToken: boolean) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedWorkspaceAccessToken = null;
      onUser(null, false);
      return;
    }
    if (!isSigningIn) {
      onUser(user, Boolean(cachedWorkspaceAccessToken));
    }
  });
}

async function applyRememberMePersistence(rememberMe: boolean): Promise<void> {
  await setPersistence(
    auth,
    rememberMe ? browserLocalPersistence : browserSessionPersistence
  );
}

export async function signInWithEmailCredentials(input: {
  email: string;
  password: string;
  rememberMe: boolean;
}): Promise<{ user: User; idToken: string }> {
  isSigningIn = true;
  try {
    await applyRememberMePersistence(input.rememberMe);
    const cred = await signInWithEmailAndPassword(auth, input.email.trim(), input.password);
    const idToken = await cred.user.getIdToken();
    return { user: cred.user, idToken };
  } finally {
    isSigningIn = false;
  }
}

export async function registerWithEmailCredentials(input: {
  fullName: string;
  email: string;
  password: string;
}): Promise<{ user: User; idToken: string; verificationSent: boolean }> {
  isSigningIn = true;
  try {
    await applyRememberMePersistence(true);
    const cred = await createUserWithEmailAndPassword(auth, input.email.trim(), input.password);
    await updateProfile(cred.user, { displayName: input.fullName.trim() });

    let verificationSent = false;
    try {
      await sendEmailVerification(cred.user, {
        url: `${window.location.origin}/login`,
      });
      verificationSent = true;
    } catch {
      verificationSent = false;
    }

    const idToken = await cred.user.getIdToken(true);
    return { user: cred.user, idToken, verificationSent };
  } finally {
    isSigningIn = false;
  }
}

export async function sendPasswordResetForEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim(), {
    url: `${window.location.origin}/login`,
    handleCodeInApp: false,
  });
}

export async function verifyResetPasswordCode(oobCode: string): Promise<string> {
  return verifyPasswordResetCode(auth, oobCode);
}

export async function confirmResetPassword(oobCode: string, newPassword: string): Promise<void> {
  await confirmPasswordReset(auth, oobCode, newPassword);
}

export async function verifyEmailWithCode(oobCode: string): Promise<void> {
  await applyActionCode(auth, oobCode);
}

export async function resendCurrentUserVerification(): Promise<void> {
  if (!auth.currentUser) {
    throw new Error('You must be signed in to resend the verification email.');
  }
  await sendEmailVerification(auth.currentUser, {
    url: `${window.location.origin}/login`,
  });
}

export async function reloadCurrentFirebaseUser(): Promise<User | null> {
  if (!auth.currentUser) return null;
  await auth.currentUser.reload();
  return auth.currentUser;
}

export async function updateFirebaseDisplayName(displayName: string): Promise<User> {
  if (!auth.currentUser) {
    throw new Error('Authentication required.');
  }
  await updateProfile(auth.currentUser, { displayName: displayName.trim() });
  return auth.currentUser;
}

export async function signInWithGoogleAccount(rememberMe = true): Promise<{
  user: User;
  idToken: string;
}> {
  isSigningIn = true;
  try {
    await applyRememberMePersistence(rememberMe);
    const result = await signInWithPopup(auth, loginGoogleProvider);
    const idToken = await result.user.getIdToken();
    return { user: result.user, idToken };
  } finally {
    isSigningIn = false;
  }
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  idToken: string;
  accessToken: string | null;
}> {
  isSigningIn = true;
  try {
    await applyRememberMePersistence(true);
    const result = await signInWithPopup(auth, workspaceGoogleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedWorkspaceAccessToken = credential.accessToken;
    }
    const idToken = await result.user.getIdToken();
    return {
      user: result.user,
      idToken,
      accessToken: cachedWorkspaceAccessToken,
    };
  } finally {
    isSigningIn = false;
  }
}

export async function getFirebaseIdToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  return auth.currentUser.getIdToken();
}

export function getWorkspaceAccessToken(): string | null {
  return cachedWorkspaceAccessToken;
}

export async function signOutStudio(): Promise<void> {
  cachedWorkspaceAccessToken = null;
  await signOut(auth);
}

export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      return false;
    }
    return true;
  }
}

export async function syncUserPreferencesToFirestore(
  uid: string,
  prefs: { activeProjectId?: number; editorFontSize?: number; theme?: string }
): Promise<void> {
  const path = `users/${uid}/preferences/studio`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'preferences', 'studio'),
      {
        uid,
        ...prefs,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.warn('Firestore preference sync skipped:', error instanceof Error ? error.message : error);
    void path;
  }
}
