import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Defensive check for config
const isConfigValid = firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId;

if (!isConfigValid) {
  console.error("[DEBUG] Firebase configuration is missing or invalid. Please check firebase-applet-config.json");
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Defensive Firestore initialization
let firestoreDb;
try {
  firestoreDb = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId || "(default)");
} catch (err) {
  console.error("[DEBUG] Failed to initialize Firestore with databaseId:", (firebaseConfig as any).firestoreDatabaseId, err);
  firestoreDb = getFirestore(app); // Fallback to default
}
export const db = firestoreDb;

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/spreadsheets');

export const microsoftProvider = new OAuthProvider('microsoft.com');
export const appleProvider = new OAuthProvider('apple.com');

// Cache the access token in memory.
let cachedAccessToken: string | null = null;
let tokenListeners: Array<(token: string | null) => void> = [];

export const getAccessToken = () => cachedAccessToken;

const setCachedToken = (token: string | null) => {
  cachedAccessToken = token;
  tokenListeners.forEach(listener => listener(token));
};

export const onTokenChanged = (listener: (token: string | null) => void) => {
  tokenListeners.push(listener);
  listener(cachedAccessToken);
  return () => {
    tokenListeners = tokenListeners.filter(l => l !== listener);
  };
};

// Check for redirect result errors on load to ensure mobile browser flows can be debugged
getRedirectResult(auth).then((result) => {
  if (result) {
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      setCachedToken(credential.accessToken);
      console.log("[DEBUG] Recovered Google Access Token from Redirect.");
    }
  }
}).catch(err => {
  console.error("[DEBUG] Redirect Auth Error:", err);
});

export const signInWithEmail = (email: string, pass: string) => signInWithEmailAndPassword(auth, email, pass);
export const signUpWithEmail = async (email: string, pass: string, name?: string) => {
  const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
  if (name && userCredential.user) {
    await updateProfile(userCredential.user, { displayName: name });
  }
  return userCredential;
};

export const resetPassword = (email: string) => sendPasswordResetEmail(auth, email);

export const signInWithProvider = async (providerName: 'google' | 'microsoft' | 'apple') => {
  if (!isConfigValid) {
    const msg = "Firebase is not properly configured. Please check your firebase-applet-config.json file.";
    console.error("[DEBUG]", msg);
    return Promise.reject(msg);
  }

  let provider: any;
  if (providerName === 'google') provider = googleProvider;
  else if (providerName === 'microsoft') provider = microsoftProvider;
  else if (providerName === 'apple') provider = appleProvider;

  try {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
      console.log(`[DEBUG] Mobile platform detected. Using signInWithRedirect for ${providerName}...`);
      await signInWithRedirect(auth, provider);
      return; 
    }
    
    console.log(`[DEBUG] Desktop platform detected. Using signInWithPopup for ${providerName}...`);
    const result = await signInWithPopup(auth, provider);
    
    if (providerName === 'google') {
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setCachedToken(credential.accessToken);
        console.log("[DEBUG] Captured Google Access Token from Popup.");
      }
    }
    
    return result;
  } catch (err: any) {
    console.error(`[DEBUG] ${providerName} Auth error:`, err);
    throw err;
  }
};

export const signInWithGoogle = () => signInWithProvider('google');
export const signInWithMicrosoft = () => signInWithProvider('microsoft');
export const signInWithApple = () => signInWithProvider('apple');

export const logout = async () => {
  setCachedToken(null);
  return signOut(auth);
};

