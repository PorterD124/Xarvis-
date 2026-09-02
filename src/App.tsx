/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import { Mic, MicOff, Terminal, Cpu, Activity, Settings as SettingsIcon, X, Plus, MessageSquare, Send, Trash2, Edit2, FileSpreadsheet, LogIn, LogOut, Bluetooth, BluetoothConnected, Menu } from 'lucide-react';
import { motion, AnimatePresence } from "motion/react";
import { AppSettings, Personality, VoiceName, VOICE_DESCRIPTIONS, DEFAULT_PERSONALITIES } from "./types";
import { auth, signInWithProvider, logout, db, signInWithEmail, signUpWithEmail, resetPassword, onTokenChanged, getAccessToken } from "./firebase";
import firebaseConfig from '../firebase-applet-config.json';
import { lovenseService, LovenseCommand } from "./services/lovenseService";
import { onAuthStateChanged, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, updateDoc, getDoc, setDoc, getDocFromServer, getDocs } from 'firebase/firestore';

import { GoogleAd } from './components/GoogleAd';

enum OperationType {
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
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
}

export const APP_VERSION = "1.0";

export default function App() {
  console.log("[DEBUG] App component rendering...");
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const [volume, setVolume] = useState(0);
  const [showPersonalities, setShowPersonalities] = useState(false);
  const [showBluetooth, setShowBluetooth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [personalities, setPersonalities] = useState<Personality[]>(DEFAULT_PERSONALITIES);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  
  const [lastActivityTime, setLastActivityTime] = useState(Date.now());
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  
  const ADMIN_EMAILS = ['hnnschools@gmail.com', 'porter.groupdonovan@gmail.com'];
  const [isBluetoothConnecting, setIsBluetoothConnecting] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const bluetoothDeviceRef = useRef<any>(null);
  const bluetoothCharacteristicRef = useRef<any>(null);
  
  // PIN States
  const [needsRestart, setNeedsRestart] = useState(false);
  
  // New Personality State
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingPersona, setIsSavingPersona] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [newPersona, setNewPersona] = useState<Partial<Personality>>({
    name: '',
    description: '',
    voice: 'Zephyr',
    systemInstruction: '',
    speechStyle: ''
  });

  // Settings State
  const [hasGoogleAccess, setHasGoogleAccess] = useState(false);

  useEffect(() => {
    return onTokenChanged((token) => {
      setHasGoogleAccess(!!token);
    });
  }, []);

  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem('xarvis_settings');
      const parsed = saved ? JSON.parse(saved) : {
        activePersonalityId: 'xarvis-fem',
        inputMode: 'voice',
        theme: 'dark'
      };
      return {
        ...parsed,
        logToSheets: parsed.logToSheets || false,
        spreadsheetId: parsed.spreadsheetId || '',
        theme: parsed.theme || 'dark'
      };
    } catch (e) {
      return {
        activePersonalityId: 'xarvis-fem',
        inputMode: 'voice',
        logToSheets: false,
        spreadsheetId: '',
        theme: 'dark'
      };
    }
  });

  const audioServiceRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const lastSpeakerRef = useRef<string | null>(null);

  const activePersonality = personalities.find(p => p.id === settings.activePersonalityId) || personalities[0] || {
    id: 'xarvis-fem',
    name: 'Xarvis (Feminine)',
    description: 'Sophisticated, efficient, and highly intelligent.',
    voice: 'Kore',
    systemInstruction: "You are Xarvis, a highly advanced AI assistant with a sophisticated, feminine, and slightly British-accented persona.",
    isDefault: true
  };

  useEffect(() => {
    document.documentElement.classList.toggle('light', settings.theme === 'light');
    localStorage.setItem('xarvis_settings', JSON.stringify(settings));
  }, [settings]);

  // Idle Timeout Logic removed per user request

  const handleDisconnect = () => {
    if (audioServiceRef.current) {
      audioServiceRef.current.stop();
    }
    setStatus('disconnected');
    
    // Log session end
    if (sessionStartTime) {
      const duration = Math.round((Date.now() - sessionStartTime) / 1000);
      logSessionToSheets(duration);
      setSessionStartTime(null);
    }
  };

  const logSessionToSheets = async (durationSeconds: number) => {
    if (!settings.logToSheets || !settings.spreadsheetId || !user) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log("[DEBUG] No Google Access Token available. Skipping session logging.");
      return;
    }

    try {
      const range = 'Sheet1!A:D';
      const values = [
        user.displayName || 'Anonymous',
        user.email || 'N/A',
        activePersonality.name,
        `${durationSeconds}s`
      ];

      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [values]
        })
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
           console.error("[DEBUG] Token expired or invalid.");
        }
        console.error("[DEBUG] Failed to log session to Sheets:", await response.text());
        return;
      }
    } catch (err) {
      console.error("[DEBUG] Error logging session:", err);
    }
  };

  useEffect(() => {
    console.log(`[DEBUG] App component mounted. Origin: ${window.location.origin}`);
    console.log(`[DEBUG] App component mounted. Protocol: ${window.location.protocol}`);
    console.log(`[DEBUG] Gemini API Key present in environment: ${!!process.env.GEMINI_API_KEY}`);
    
    // Check for valid Firebase config
    const firebaseConfig = (auth.app as any).options;
    if (!firebaseConfig || !firebaseConfig.apiKey || firebaseConfig.apiKey.includes('TODO')) {
      console.error("Firebase Configuration Error: It looks like your firebase-applet-config.json is missing or contains placeholder values.");
      setIsAuthChecking(false);
      return;
    }

    // Safety timeout for auth check removed per user request

    let unsubscribeFirestore: (() => void) | null = null;
    let unsubscribeUsers: (() => void) | null = null;

    console.log("[DEBUG] Setting up onAuthStateChanged...");
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      console.log("[DEBUG] onAuthStateChanged fired. User:", currentUser?.email || "None");
      setUser(currentUser);
      setIsAuthChecking(false);
      
      if (currentUser) {
        try {
          // Save/Update user profile - non-blocking to prevent initialization hangs
          const userRef = doc(db, 'users', currentUser.uid);
          setDoc(userRef, {
            uid: currentUser.uid,
            email: currentUser.email,
            displayName: currentUser.displayName,
            photoURL: currentUser.photoURL,
            lastLogin: new Date().toISOString()
          }, { merge: true }).catch(err => console.error("Failed to save user profile", err));

          // Fetch custom personalities from Firestore
          const q = query(collection(db, 'personalities'), where('uid', '==', currentUser.uid));
          console.log("[DEBUG] Subscribing to personalities for UID:", currentUser.uid);
          unsubscribeFirestore = onSnapshot(q, (snapshot) => {
            console.log(`[DEBUG] Personalities snapshot received. Count: ${snapshot.docs.length}`);
            const customList = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Personality));
            setPersonalities([...DEFAULT_PERSONALITIES, ...customList]);
            setIsLoading(false);
          }, (err) => {
            console.error("Personalities subscription failed", err);
            setIsLoading(false);
          });

          // Listen to user's own document to get role
          onSnapshot(userRef, (docSnap) => {
            const userData = docSnap.data();
            const isDbAdmin = userData?.role === 'admin';
            const isEmailAdmin = ADMIN_EMAILS.includes(currentUser.email || '');
            const userIsAdmin = isDbAdmin || (isEmailAdmin && currentUser.emailVerified);
            
            setIsAdmin(userIsAdmin);

            if (userIsAdmin) {
              if (!unsubscribeUsers) {
                console.log("[DEBUG] Admin verified, subscribing to users collection...");
                unsubscribeUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
                  setAllUsers(snapshot.docs.map(d => d.data()));
                }, (err) => {
                  console.error("[DEBUG] Admin users subscription failed:", err.message);
                });
              }
            } else {
              if (unsubscribeUsers) {
                unsubscribeUsers();
                unsubscribeUsers = null;
                setAllUsers([]);
              }
            }
          });
        } catch (err) {
          console.error("[DEBUG] Error during auth initialization:", err);
          setIsLoading(false);
        }
      } else {
        setPersonalities(DEFAULT_PERSONALITIES);
        setAllUsers([]);
        setIsLoading(false);
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        if (unsubscribeUsers) {
          unsubscribeUsers();
          unsubscribeUsers = null;
        }
      }
    }, (error) => {
      console.error("[DEBUG] onAuthStateChanged error:", error);
      setIsAuthChecking(false);
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeFirestore) unsubscribeFirestore();
      if (unsubscribeUsers) unsubscribeUsers();
    };
  }, []);

  const handleToggleAdmin = async (uid: string, currentRole: string) => {
    if (!isAdmin) return;
    try {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (err) {
      console.error("Failed to toggle admin role:", err);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!isAdmin) return;

    try {
      // Delete user's personalities
      const q = query(collection(db, 'personalities'), where('uid', '==', uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'personalities', d.id)));
      await Promise.all(deletePromises);

      // Delete user profile
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.error("Failed to delete user", err);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      await signInWithProvider('google');
      setSettings(s => ({ ...s, logToSheets: true }));
    } catch (err) {
      console.error("Failed to initiate Google Auth", err);
      alert("Failed to initiate Google Auth. Please check the console for details.");
    }
  };

  const handleBluetoothConnect = async () => {
    if (!user) return;

    setLastActivityTime(Date.now());
    setIsBluetoothConnecting(true);
    setBluetoothError(null);

    try {
      const success = await lovenseService.connect();
      if (success) {
        setSettings(s => ({ ...s, bluetoothEnabled: true }));
        console.log("[DEBUG] Bluetooth Link established");
      }
    } catch (err: any) {
      console.error("[DEBUG] Bluetooth connection failed:", err);
    } finally {
      setIsBluetoothConnecting(false);
    }
  };

  useEffect(() => {
    if (settings.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [settings.theme]);

  const handleProviderAuth = async (providerName: 'google' | 'microsoft' | 'apple') => {
    if (user) {
      await logout();
    } else {
      if (isLoggingIn) return;
      setIsLoggingIn(true);
      setAuthError(null);
      try {
        console.log(`[DEBUG] Initiating ${providerName} Login...`);
        await signInWithProvider(providerName);
        console.log(`[DEBUG] ${providerName} Login call completed.`);
      } catch (err: any) {
        console.error("[DEBUG] Login failed:", err);
        setAuthError(err.message || `${providerName} Login failed.`);
      } finally {
        setIsLoggingIn(false);
      }
    }
  };

  const handleResetPassword = async () => {
    if (!email) {
      setAuthError("Please enter your email address to reset password.");
      return;
    }
    try {
      await resetPassword(email);
      setAuthError("Password reset email sent. Please check your inbox.");
    } catch (err: any) {
      console.error("Password reset failed:", err);
      setAuthError(err.message || "Failed to send password reset email.");
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setAuthError(null);
    setIsLoggingIn(true);
    try {
      await signInWithEmail(email, password);
    } catch (err: any) {
      console.error("Email login failed:", err);
      setAuthError(err.message || "Login failed.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;
    setAuthError(null);
    if (password.length < 8) {
      setAuthError("Password must be at least 8 characters long.");
      return;
    }
    setIsLoggingIn(true);
    try {
      await signUpWithEmail(email, password, name);
    } catch (err: any) {
      console.error("Email sign up failed:", err);
      setAuthError(err.message || "Sign up failed.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  useEffect(() => {
    // Other effects...
  }, []);

  const logToGoogleSheets = async (role: string, message: string) => {
    if (!settings.logToSheets || !settings.spreadsheetId) return;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      console.log("[DEBUG] No Google Access Token available. Skipping Sheets logging.");
      return;
    }

    // Split message by comma to support multiple columns as requested
    const messageParts = message.split(',').map(part => part.trim()).filter(part => part !== "");
    const values = [new Date().toISOString(), role, ...messageParts];

    try {
      const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${settings.spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          values: [values]
        })
      });
      
      if (!response.ok) {
        throw new Error(await response.text());
      }
    } catch (err) {
      console.error("[DEBUG] Failed to log to Google Sheets:", err);
    }
  };

  useEffect(() => {
    localStorage.setItem('xarvis_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    return () => {
      audioServiceRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (transcriptContainerRef.current) {
      transcriptContainerRef.current.scrollTop = transcriptContainerRef.current.scrollHeight;
    }
  }, [transcript]);

  const toggleConnection = async () => {
    console.log(`[DEBUG] toggleConnection called. Current status: ${status}`);
    setConnectionError(null);

    if (status === 'connected' || status === 'connecting') {
      console.log("[DEBUG] Disconnecting...");
      audioServiceRef.current?.disconnect();
      setStatus('disconnected');
      setVolume(0);
    } else {
      console.log("[DEBUG] Attempting to connect...");
      const apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined" || apiKey === "null" || apiKey.trim() === "") {
        console.error("System Link Error: GEMINI_API_KEY is missing or invalid.");
        return;
      }

      if (!activePersonality) {
        console.error("[DEBUG] No active personality found!");
        return;
      }

      try {
        const instruction = activePersonality.speechStyle 
          ? `${activePersonality.systemInstruction}\n\nSPEECH STYLE: ${activePersonality.speechStyle}`
          : activePersonality.systemInstruction;

        if (!audioServiceRef.current) {
          console.log("[DEBUG] Loading LiveAudioService dynamically...");
          const { LiveAudioService } = await import('./services/liveAudioService');
          audioServiceRef.current = new LiveAudioService();
        }

        console.log("[DEBUG] Calling audioService.connect...");
        await audioServiceRef.current.connect(
          {
            voice: activePersonality.voice,
            systemInstruction: instruction,
            inputMode: settings.inputMode, // Pass inputMode to connect
            apiKey: apiKey
          },
          {
            onMessage: (text, role) => {
              setLastActivityTime(Date.now());
              if (!text) return;
              
              let processedText = text;
              // Parse for Bluetooth Commands: [BT:COMMAND:LEVEL]
              const btRegex = /\[BT:(\w+):(\d+)\]/g;
              let match;
              while ((match = btRegex.exec(text)) !== null) {
                const command = match[1] as LovenseCommand;
                const level = parseInt(match[2], 10);
                console.log(`[Lovense] Triggering ${command} at level ${level}`);
                lovenseService.sendCommand(command, level);
                // Remove the tag from the displayed text
                processedText = processedText.replace(match[0], '');
              }

              if (!processedText.trim() && text.includes('[BT:')) return;

              const roleName = role === 'user' ? 'User' : activePersonality.name;
              
              setTranscript(prev => {
                const prefix = `${roleName}: `;
                
                // If the last speaker was the same, we append to the last line (before the final newline)
                if (lastSpeakerRef.current === roleName) {
                  // Remove the trailing newline if it exists to append
                  const base = prev.endsWith('\n') ? prev.slice(0, -1) : prev;
                  return base + processedText + '\n';
                } else {
                  // New speaker
                  lastSpeakerRef.current = roleName;
                  const separator = (prev === '' || prev.endsWith('\n')) ? '' : '\n';
                  return prev + separator + prefix + processedText + '\n';
                }
              });

              logToGoogleSheets(roleName as 'User' | 'Xarvis', processedText);
            },
            onStatusChange: (newStatus) => {
              console.log(`[DEBUG] Status changed to: ${newStatus}`);
              setStatus(newStatus);
              if (newStatus === 'connected') {
                setConnectionError(null);
                setSessionStartTime(Date.now());
                setLastActivityTime(Date.now());
              }
            },
            onVolumeChange: (v) => setVolume(v),
            onError: (err) => {
              console.error("[DEBUG] AudioService reported error:", err);
              setStatus('disconnected');
            }
          }
        );
      } catch (err: any) {
        console.error("[DEBUG] Connection error:", err);
        setStatus('disconnected');
      }
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!textInput.trim()) return;
    
    setLastActivityTime(Date.now());
    const message = textInput;
    setTextInput('');
    
    // Append user message to transcript immediately
    setTranscript(prev => {
      const prefix = 'User: ';
      if (lastSpeakerRef.current === 'User') {
        const base = prev.endsWith('\n') ? prev.slice(0, -1) : prev;
        return base + message + '\n';
      } else {
        lastSpeakerRef.current = 'User';
        const separator = (prev === '' || prev.endsWith('\n')) ? '' : '\n';
        return prev + separator + prefix + message + '\n';
      }
    });
    logToGoogleSheets('User', message);

    if (status === 'connected') {
      console.log(`[DEBUG] Sending text to live session: ${message}`);
      audioServiceRef.current?.sendText(message);
    } else {
      console.log(`[DEBUG] Sending text to GeminiService: ${message}`);
      try {
        const { geminiService } = await import('./services/geminiService');
        const instruction = activePersonality.speechStyle 
          ? `${activePersonality.systemInstruction}\n\nSPEECH STYLE: ${activePersonality.speechStyle}`
          : activePersonality.systemInstruction;
          
        const response = await geminiService.generateText(message, instruction);
        console.log(`[DEBUG] GeminiService response: ${response}`);
        
        let processedResponse = response;
        // Parse for Bluetooth Commands: [BT:COMMAND:LEVEL]
        const btRegex = /\[BT:(\w+):(\d+)\]/g;
        let match;
        while ((match = btRegex.exec(response)) !== null) {
          const command = match[1] as LovenseCommand;
          const level = parseInt(match[2], 10);
          console.log(`[Lovense] Triggering ${command} at level ${level}`);
          lovenseService.sendCommand(command, level);
          // Remove the tag from the displayed text
          processedResponse = processedResponse.replace(match[0], '');
        }

        setTranscript(prev => {
          const roleName = activePersonality.name;
          const prefix = `${roleName}: `;
          if (lastSpeakerRef.current === roleName) {
            const base = prev.endsWith('\n') ? prev.slice(0, -1) : prev;
            return base + processedResponse + '\n';
          } else {
            lastSpeakerRef.current = roleName;
            const separator = (prev === '' || prev.endsWith('\n')) ? '' : '\n';
            return prev + separator + prefix + processedResponse + '\n';
          }
        });
        logToGoogleSheets(activePersonality.name, processedResponse);
      } catch (err: any) {
        console.error("Text Chat Error:", err);
        const errorMsg = err.message === 'API_KEY_MISSING' 
          ? "Bluetooth Link Error: GEMINI_API_KEY is missing."
          : `System Error: ${err.message || "Failed to get response from Xarvis."}`;
        
        setTranscript(prev => prev + `System: ${errorMsg}\n`);
      }
    }
  };

  const handleSelectPersonality = async (p: Personality) => {
    if (settings.activePersonalityId === p.id) return;
    setSettings(s => ({ ...s, activePersonalityId: p.id }));
    if (status === 'connected') setNeedsRestart(true);
  };

  const handleEditPersonality = (p: Personality) => {
    startEditing(p);
  };

  const startEditing = (p: Personality) => {
    setEditingPersonaId(p.id);
    setNewPersona({
      name: p.name,
      description: p.description,
      voice: p.voice,
      systemInstruction: p.systemInstruction,
      speechStyle: p.speechStyle || ''
    });
    setIsCreating(true);
  };

  const handleDeletePersonality = (p: Personality) => {
    deletePersona(p.id);
  };

  const deletePersona = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'personalities', id));
      if (settings.activePersonalityId === id) {
        setSettings(s => ({ ...s, activePersonalityId: DEFAULT_PERSONALITIES[0].id }));
      }
    } catch (err) {
      console.error("Failed to delete personality", err);
    }
  };

  const handleCreatePersonality = async () => {
    if (!user) {
      console.warn("Please sign in with Google to create custom personalities.");
      return;
    }

    if (!newPersona.name || !newPersona.systemInstruction) {
      console.warn("Name and System Instruction are required.");
      return;
    }

    if (isSavingPersona) return;
    setIsSavingPersona(true);

    try {
      const personalityData = {
        ...newPersona,
        uid: user.uid,
        isDefault: false,
        voice: newPersona.voice || 'Zephyr'
      };
      
      console.log("[DEBUG] Saving personality for UID:", user.uid, personalityData);

      if (editingPersonaId) {
        await updateDoc(doc(db, 'personalities', editingPersonaId), personalityData).catch(err => console.error("Failed to update personality", err));
        console.log("[DEBUG] Personality updated successfully:", editingPersonaId);
      } else {
        const docRef = await addDoc(collection(db, 'personalities'), personalityData).catch(err => {
          console.error("Failed to create personality", err);
          throw err;
        });
        console.log("[DEBUG] Personality created successfully with ID:", docRef.id);
      }

      setIsCreating(false);
      setEditingPersonaId(null);
      setNewPersona({
        name: '',
        description: '',
        voice: 'Zephyr',
        systemInstruction: '',
        speechStyle: ''
      });
    } catch (err: any) {
      console.error("Operation failed", err);
    } finally {
      setIsSavingPersona(false);
    }
  };

  const handleClearAllCustom = async () => {
    if (!user) return;
    
    try {
      const q = query(collection(db, 'personalities'), where('uid', '==', user.uid));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, 'personalities', d.id)));
      await Promise.all(deletePromises);
      
      const current = personalities.find(p => p.id === settings.activePersonalityId);
      if (current && !current.isDefault) {
        setSettings(s => ({ ...s, activePersonalityId: 'xarvis-fem' }));
      }
    } catch (err) {
      console.error("Clear all failed", err);
    }
  };

  // Initial Auth Check
  if (initError) {
    return null;
  }

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-8 relative overflow-hidden">
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-6">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin" />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="text-cyan-500 font-mono text-sm tracking-[0.2em] uppercase">Xarvis Core</span>
            <span className="text-cyan-500/40 font-mono text-[10px] tracking-[0.4em] uppercase">Initializing Neural Link...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`min-h-screen ${settings.theme === 'light' ? 'bg-[#f8fafc]' : 'bg-[#050505]'} flex flex-col items-center justify-center p-8 relative overflow-y-auto transition-colors`}>
        {/* Background Effects */}
        <div className="absolute inset-0 z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full" />
          <div className="absolute inset-0 opacity-10" 
               style={{ backgroundImage: 'radial-gradient(#00f2ff 0.5px, transparent 0.5px)', backgroundSize: '48px 48px' }} />
        </div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 max-w-md w-full text-center space-y-12"
        >
          <div className="space-y-6">
            <div className="relative w-24 h-24 mx-auto">
              <div className="absolute inset-0 rounded-2xl border border-cyan-500/20 rotate-45 animate-pulse" />
              <div className="absolute inset-2 rounded-2xl border border-cyan-500/40 -rotate-12" />
              <div className="absolute inset-0 flex items-center justify-center">
                <Cpu size={40} className="text-cyan-500" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className={`text-4xl font-mono ${settings.theme === 'light' ? 'text-slate-900' : 'text-white'} uppercase tracking-[0.2em]`}>Xarvis</h1>
              <p className="text-cyan-500/50 font-mono text-xs uppercase tracking-widest">System Protocol {APP_VERSION}</p>
            </div>
          </div>

          <div className={`${settings.theme === 'light' ? 'bg-white border-black' : 'bg-black border-cyan-500/30'} border-2 p-6 md:p-10 space-y-8 shadow-[8px_8px_0px_rgba(0,0,0,0.2)] hack-border`}>
            <div className="space-y-3 text-left border-l-2 border-cyan-500 pl-4">
              <h2 className={`text-base md:text-lg font-mono ${settings.theme === 'light' ? 'text-slate-900' : 'text-white'} uppercase tracking-widest`}>[ AUTH_REQUIRED ]</h2>
              <p className={`${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'} text-[10px] md:text-xs leading-relaxed font-mono uppercase tracking-tight`}>
                Initialize core system via Auth provider.
              </p>
            </div>

            {authError && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-[10px] font-mono p-3 text-left">
                {authError}
              </div>
            )}

            <div className="space-y-4">
              {authMode === 'signup' && (
                <div className="space-y-1 text-left">
                  <label className={`text-[10px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter your name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className={`w-full border p-2 text-xs font-mono focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-black/40 border-white/20 text-white focus:border-cyan-500'}`}
                  />
                </div>
              )}
              <div className="space-y-1 text-left">
                <label className={`text-[10px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Email</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={`w-full border p-2 text-xs font-mono focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-black/40 border-white/20 text-white focus:border-cyan-500'}`}
                />
              </div>
              <div className="space-y-1 text-left">
                <label className={`text-[10px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Password</label>
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  minLength={8}
                  className={`w-full border p-2 text-xs font-mono focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500' : 'bg-black/40 border-white/20 text-white focus:border-cyan-500'}`}
                />
              </div>

              {authMode === 'login' && (
                <div className="text-right">
                  <button 
                    onClick={handleResetPassword}
                    className={`text-[9px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-500 hover:text-slate-900' : 'text-white/40 hover:text-white'} transition-colors`}
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <div className="pt-2">
                <button 
                  onClick={authMode === 'login' ? handleEmailLogin : handleEmailSignUp}
                  disabled={isLoggingIn || !email || !password || (authMode === 'signup' && !name)}
                  className={`w-full py-3 flex items-center justify-center gap-2 ${isLoggingIn ? 'bg-cyan-500/50 cursor-not-allowed' : 'bg-cyan-500 hover:bg-cyan-400'} text-black font-mono text-[10px] font-bold uppercase tracking-widest transition-all active:translate-y-0.5 border border-black shadow-[2px_2px_0px_rgba(0,0,0,1)]`}
                >
                  {isLoggingIn ? (
                    <div className="w-4 h-4 border-2 border-black/20 border-t-black animate-spin rounded-full" />
                  ) : (
                    <LogIn size={16} />
                  )}
                  {authMode === 'login' ? 'Login with Email' : 'Sign Up with Email'}
                </button>
              </div>

              <div className="flex items-center gap-3 py-2">
                <div className={`flex-1 h-px ${settings.theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`} />
                <span className={`text-[10px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-400' : 'text-white/40'}`}>Or continue with</span>
                <div className={`flex-1 h-px ${settings.theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`} />
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => handleProviderAuth('google')}
                  disabled={isLoggingIn}
                  className={`w-full py-2.5 flex items-center justify-center gap-2 ${settings.theme === 'light' ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-black/40 border-white/20 hover:bg-white/10 text-white'} font-mono text-[10px] uppercase tracking-widest transition-all border shadow-sm`}
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-3.5 h-3.5" />
                  Google
                </button>
                <button 
                  onClick={() => handleProviderAuth('microsoft')}
                  disabled={isLoggingIn}
                  className={`w-full py-2.5 flex items-center justify-center gap-2 ${settings.theme === 'light' ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-black/40 border-white/20 hover:bg-white/10 text-white'} font-mono text-[10px] uppercase tracking-widest transition-all border shadow-sm`}
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/microsoft.svg" alt="Microsoft" className="w-3.5 h-3.5" />
                  Microsoft
                </button>
                <button 
                  onClick={() => handleProviderAuth('apple')}
                  disabled={isLoggingIn}
                  className={`w-full py-2.5 flex items-center justify-center gap-2 ${settings.theme === 'light' ? 'bg-white border-slate-300 hover:bg-slate-50 text-slate-700' : 'bg-black/40 border-white/20 hover:bg-white/10 text-white'} font-mono text-[10px] uppercase tracking-widest transition-all border shadow-sm`}
                >
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 384 512"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg>
                  Apple
                </button>
              </div>

              <div className="pt-4 text-center">
                <button
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className={`text-[10px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-cyan-600 hover:text-cyan-700' : 'text-cyan-400 hover:text-cyan-300'} transition-colors`}
                >
                  {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                </button>
              </div>
            </div>

            <div className="pt-4 flex flex-col items-center gap-4">
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <a 
                  href="https://privacy-xarvis.groupdonovan.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`text-[9px] font-mono ${settings.theme === 'light' ? 'text-slate-400 hover:text-teal-600' : 'text-white/20 hover:text-cyan-500'} transition-colors uppercase tracking-widest`}
                >
                  Privacy Policy
                </a>
                <a 
                  href="https://terms-xarvis.groupdonovan.com" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className={`text-[9px] font-mono ${settings.theme === 'light' ? 'text-slate-400 hover:text-teal-600' : 'text-white/20 hover:text-cyan-500'} transition-colors uppercase tracking-widest`}
                >
                  Terms of Service
                </a>
              </div>
              
              <div className="space-y-2 text-center">
                <p className={`text-[9px] font-mono ${settings.theme === 'light' ? 'text-slate-400' : 'text-white/20'} uppercase tracking-[0.3em]`}>
                  Secure Connection // AES-256
                </p>
                {!process.env.GEMINI_API_KEY && (
                  <p className="text-[8px] font-mono text-red-500/60 uppercase tracking-widest animate-pulse">
                    Warning: GEMINI_API_KEY not detected in environment
                  </p>
                )}
              </div>
            </div>

            {/* Firebase Debug Info */}
            <div className="mt-8 pt-6 border-t border-white/5 text-center space-y-4">
              <div className="flex flex-col items-center gap-2">
                <p className={`text-[8px] font-mono ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'} uppercase tracking-widest`}>Infrastructure</p>
                <div className={`flex items-center gap-2 px-3 py-1 ${settings.theme === 'light' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'} rounded-full border`}>
                  <div className="w-2 h-2 rounded-full bg-[#4285F4]" />
                  <span className={`text-[9px] font-mono ${settings.theme === 'light' ? 'text-slate-600' : 'text-white/60'} uppercase tracking-tight`}>Powered by Google Cloud</span>
                </div>
                <p className={`text-[8px] font-mono ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'} uppercase tracking-widest mt-1`}>{APP_VERSION}</p>
              </div>

              {window.location.protocol === 'capacitor:' && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl space-y-2">
                  <p className="text-[10px] font-mono text-red-500 uppercase font-bold">⚠️ Configuration Error</p>
                  <p className="text-[8px] font-mono text-red-400/80 uppercase leading-relaxed">
                    App is still using 'capacitor://' scheme. Google Login will fail. 
                    Please run 'npx cap sync ios' and clean your Xcode build.
                  </p>
                </div>
              )}

              <div className="space-y-1">
                <p className={`text-[8px] font-mono ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'} uppercase tracking-widest`}>Firebase Configuration Debug</p>
                <div className="flex flex-col gap-1">
                  <p className={`text-[8px] font-mono ${settings.theme === 'light' ? 'text-slate-600' : 'text-white/40'}`}>Project: {firebaseConfig.projectId}</p>
                  <p className={`text-[8px] font-mono ${settings.theme === 'light' ? 'text-slate-600' : 'text-white/40'}`}>App ID: {firebaseConfig.appId.split(':').slice(0, 2).join(':')}:...</p>
                  <p className={`text-[8px] font-mono ${settings.theme === 'light' ? 'text-slate-600' : 'text-white/40'}`}>Auth Domain: {firebaseConfig.authDomain}</p>
                </div>
              </div>
              
              <p className="mt-4 text-[9px] font-mono text-cyan-500/40 leading-relaxed max-w-[200px] mx-auto uppercase">
                If "Web App isn't visible" in Firebase, ensure these values match your Firebase Console settings.
              </p>

              {/* Layout Test Ad Placement */}
              <div className="mt-8">
                <GoogleAd slot="1234567890" className="max-w-[250px] mx-auto" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center p-4 pt-20 md:pt-20 pb-4 md:pb-4 font-mono selection:bg-cyan-500/30 grid-bg overflow-y-auto">
      {/* Header Navigation */}
      <header className={`fixed top-0 left-0 w-full z-40 flex items-center justify-between px-4 py-2 md:px-8 md:py-3 border-b transition-all ${settings.theme === 'light' ? 'border-black bg-white' : 'border-cyan-500/20 bg-black/80'}`}>
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2 md:gap-3">
            <div className={`w-7 h-7 md:w-8 md:h-8 flex items-center justify-center transition-colors border ${settings.theme === 'light' ? 'bg-black border-black' : 'bg-cyan-500/10 border-cyan-500/20'}`}>
              <Cpu size={14} className={settings.theme === 'light' ? 'text-white' : 'text-cyan-400'} />
            </div>
            <div className="flex flex-col">
              <span className={`text-[8px] md:text-[10px] font-mono uppercase tracking-[0.2em] leading-none mb-1 ${settings.theme === 'light' ? 'text-slate-900' : 'text-white/80'}`}>SYS_CORE</span>
              <span className={`text-[7px] md:text-[9px] font-mono uppercase tracking-widest leading-none ${settings.theme === 'light' ? 'text-teal-600/60' : 'text-cyan-500/50'}`}>SYSTEM 1.0</span>
            </div>
          </div>
          
          <div className={`hidden sm:flex items-center gap-4 md:gap-6 border-l pl-4 md:pl-8 ${settings.theme === 'light' ? 'border-black' : 'border-white/10'}`}>
            <div className="flex flex-col">
              <span className={`text-[8px] md:text-[10px] font-mono uppercase tracking-widest mb-1 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>STATUS</span>
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 md:w-2 h-2 ${status === 'connected' ? (settings.theme === 'light' ? 'bg-teal-500' : 'bg-cyan-500') : (settings.theme === 'light' ? 'bg-slate-200' : 'bg-white/20')}`} />
                <span className={`text-[8px] md:text-[10px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-600' : 'text-white/80'}`}>{status}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="relative">
          <button 
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 border transition-all ${settings.theme === 'light' ? 'bg-white border-black text-black hover:bg-slate-100' : 'bg-black border-white/20 text-white/80 hover:border-cyan-500 hover:text-cyan-400'}`}
          >
            <Menu size={16} />
            <span className="text-[8px] md:text-[10px] font-mono uppercase tracking-widest hidden sm:inline-block">MENU</span>
          </button>

          <AnimatePresence>
            {showMobileMenu && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: -10 }}
                className={`absolute right-0 top-full mt-2 w-48 md:w-56 border shadow-2xl flex flex-col p-2 gap-1 z-50 ${settings.theme === 'light' ? 'bg-white border-black' : 'bg-black border-white/20'}`}
              >
                {isAdmin && (
                  <button 
                    onClick={() => { setShowAdmin(true); setShowMobileMenu(false); }}
                    className={`w-full flex items-center justify-start gap-3 px-4 py-3 border transition-all ${settings.theme === 'light' ? 'hover:bg-slate-50 border-transparent hover:border-black/10 text-slate-900' : 'hover:bg-white/5 border-transparent hover:border-white/10 text-white/80 hover:text-cyan-400'}`}
                  >
                    <span className="text-[10px] md:text-xs font-mono uppercase tracking-widest">ADMIN</span>
                  </button>
                )}
                {user?.emailVerified && (
                  <button 
                    onClick={() => { setShowBluetooth(true); setShowMobileMenu(false); }}
                    className={`w-full flex items-center justify-start gap-3 px-4 py-3 border transition-all ${settings.theme === 'light' ? 'hover:bg-slate-50 border-transparent hover:border-black/10 text-slate-900' : 'hover:bg-white/5 border-transparent hover:border-white/10 text-white/80 hover:text-cyan-400'}`}
                  >
                    <span className="text-[10px] md:text-xs font-mono uppercase tracking-widest">SETTINGS</span>
                  </button>
                )}
                <button 
                  onClick={() => { setShowPersonalities(true); setShowMobileMenu(false); }}
                  className={`w-full flex items-center justify-start gap-3 px-4 py-3 border transition-all ${settings.theme === 'light' ? 'hover:bg-slate-50 border-transparent hover:border-black/10 text-slate-900' : 'hover:bg-white/5 border-transparent hover:border-white/10 text-white/80 hover:text-cyan-400'}`}
                >
                  <span className="text-[10px] md:text-xs font-mono uppercase tracking-widest">PERSONALITIES</span>
                </button>
                <div className={`w-full h-px my-1 ${settings.theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`} />
                <button 
                  onClick={async () => { await logout(); setShowMobileMenu(false); }}
                  className={`w-full flex items-center justify-start gap-3 px-4 py-3 border transition-all ${settings.theme === 'light' ? 'hover:bg-slate-50 border-transparent hover:border-black/10 text-slate-900' : 'hover:bg-white/5 border-transparent hover:border-white/10 text-white/80 hover:text-cyan-400'}`}
                >
                  <span className="text-[10px] md:text-xs font-mono uppercase tracking-widest">LOGOUT</span>
                  <LogOut size={14} className="ml-auto opacity-50" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-6xl mx-auto flex flex-col lg:flex-row items-center lg:items-start justify-center gap-4 lg:gap-8 z-10">
        {/* Main Visualizer Area */}
        <div className={`relative flex flex-col items-center justify-center transition-all duration-500 ${status === 'connected' ? 'scale-105' : 'scale-100'} w-full lg:w-1/2`}>
          {/* Main Interface Ad Placement (Moved above mic) */}
          <div className="w-full max-w-xs mb-6">
            <GoogleAd slot="2345678901" format="rectangle" className="opacity-80 hover:opacity-100 transition-opacity" />
          </div>

          <div 
            className="relative w-56 h-56 md:w-72 md:h-72 flex items-center justify-center cursor-pointer"
            onClick={toggleConnection}
          >
            <div className={`absolute inset-0 border transition-all ${settings.theme === 'light' ? 'border-black/10' : 'border-white/10'} ${status === 'connected' ? 'animate-pulse' : ''}`} />
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className={`absolute inset-4 border border-dashed transition-colors ${settings.theme === 'light' ? 'border-teal-500/20' : 'border-cyan-500/20'}`}
            />
            <div className={`w-40 h-40 md:w-56 md:h-56 border flex items-center justify-center relative transition-all ${settings.theme === 'light' ? 'bg-white border-black shadow-[4px_4px_0px_rgba(0,0,0,1)]' : 'bg-black border-cyan-500/30 shadow-[inset_0_0_40px_rgba(0,242,255,0.05)]'} ${status === 'connected' ? 'hack-border' : ''}`}>
              <div className={`absolute inset-8 transition-all duration-1000 ${status === 'connected' ? (settings.theme === 'light' ? 'bg-teal-500/5 blur-2xl' : 'bg-cyan-500/5 blur-2xl') : 'bg-transparent'}`} />
              <div className={`w-32 h-32 md:w-44 md:h-44 border flex items-center justify-center relative overflow-hidden transition-all ${settings.theme === 'light' ? 'bg-slate-50 border-black/10' : 'bg-white/[0.02] border-white/10'}`}>
                <AnimatePresence mode="wait">
                  {status === 'connecting' ? (
                    <motion.div key="connecting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-2">
                      <div className={`w-5 h-5 md:w-6 md:h-6 border-2 animate-spin ${settings.theme === 'light' ? 'border-teal-500/20 border-t-teal-500' : 'border-cyan-500/20 border-t-cyan-500'}`} />
                      <span className={`${settings.theme === 'light' ? 'text-teal-600' : 'text-cyan-500'} font-mono text-[7px] md:text-[9px] tracking-[0.3em] uppercase`}>INIT_CORE</span>
                    </motion.div>
                  ) : (
                    <motion.div key="icon" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative z-10">
                      {status === 'connected' ? (
                        <div className="flex items-end gap-0.5 md:gap-1 h-10 md:h-14">
                          {[...Array(16)].map((_, i) => (
                            <motion.div
                              key={i}
                              animate={{ 
                                height: Math.max(4, volume * (window.innerWidth < 768 ? 80 : 120) * (0.4 + Math.random() * 0.6)),
                                opacity: 0.6 + (volume * 0.4)
                              }}
                              className={`w-1 md:w-1.5 ${settings.theme === 'light' ? 'bg-slate-900' : 'bg-cyan-500'}`}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <Mic size={28} className={`md:w-8 md:h-8 ${settings.theme === 'light' ? 'text-slate-300' : 'text-white/10'}`} />
                          <span className={`text-[7px] md:text-[8px] font-mono uppercase tracking-[0.4em] ${settings.theme === 'light' ? 'text-slate-400' : 'text-white/20'}`}>STANDBY</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Control Button */}
          <div className="flex flex-col items-center gap-3 mt-4 md:mt-6 w-full px-4">
            <button
              onClick={toggleConnection}
              disabled={status === 'connecting'}
              className={`group relative w-full max-w-xs px-4 py-2 md:px-6 md:py-2.5 border font-mono text-[9px] md:text-xs tracking-widest transition-all duration-300
                ${status === 'connected' 
                  ? (settings.theme === 'light' ? 'bg-white text-red-600 border-red-600 hover:bg-red-600 hover:text-white' : 'bg-black text-red-500 border-red-500 hover:bg-red-500/20')
                  : (settings.theme === 'light' ? 'bg-white text-teal-600 border-teal-600 hover:bg-teal-600 hover:text-white' : 'bg-black text-cyan-400 border-cyan-500/50 hover:bg-cyan-500/20')
                } ${status === 'connecting' ? 'opacity-50 cursor-not-allowed' : ''} shadow-[3px_3px_0px_rgba(0,0,0,0.2)] active:translate-x-0.5 active:translate-y-0.5`}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {status === 'connected' ? <MicOff size={14} className="md:w-4 md:h-4" /> : <Mic size={14} className="md:w-4 md:h-4" />}
                <span className="truncate">
                  {status === 'connected' ? 'TERMINATE_SESSION' : status === 'connecting' ? 'ESTABLISHING...' : `INITIATE_${activePersonality?.name.toUpperCase() || 'XARVIS'}`}
                </span>
              </span>
            </button>

            <AnimatePresence>
              {needsRestart && status === 'connected' && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  className={`text-[9px] font-mono uppercase tracking-widest flex items-center gap-2 ${settings.theme === 'light' ? 'text-amber-600' : 'text-amber-400'}`}
                >
                  <Activity size={10} className="animate-pulse" />
                  <span>Restart required</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Text Input Mode */}
          <AnimatePresence>
            {settings.inputMode === 'text' && (
              <motion.form 
                initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                onSubmit={handleSendText}
                className="mt-4 w-full max-w-md flex gap-2 px-4"
              >
                <input 
                  type="text" value={textInput} onChange={(e) => setTextInput(e.target.value)}
                  placeholder="ENTER COMMAND..."
                  className={`flex-1 px-4 py-2.5 border font-mono text-[10px] uppercase tracking-widest outline-none transition-all ${settings.theme === 'light' ? 'bg-white border-black focus:bg-slate-50' : 'bg-black border-white/10 focus:border-cyan-500/50 text-white'}`}
                />
                <button 
                  type="submit" 
                  onClick={handleSendText}
                  className={`px-4 border transition-all ${settings.theme === 'light' ? 'bg-black border-black text-white hover:bg-slate-800' : 'bg-cyan-500 border-cyan-500 text-black hover:bg-cyan-400'}`}
                >
                  <Send size={18} />
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* Transcript / Terminal */}
        <div className={`w-full lg:w-1/2 border overflow-hidden shadow-[6px_6px_0px_rgba(0,0,0,0.2)] transition-all ${settings.theme === 'light' ? 'bg-white border-black' : 'bg-black border-white/10'}`}>
          <div className={`px-3 py-1.5 md:px-4 md:py-1.5 border-b flex items-center justify-between ${settings.theme === 'light' ? 'bg-slate-50 border-black' : 'bg-white/5 border-white/10'}`}>
            <div className="flex items-center gap-2 min-w-0">
              <Terminal size={12} className={`shrink-0 ${settings.theme === 'light' ? 'text-teal-600/60' : 'text-cyan-500/60'}`} />
              <span className={`text-[7px] md:text-[9px] font-mono uppercase tracking-widest truncate ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>
                STREAM // {activePersonality?.name.toUpperCase()}
              </span>
            </div>
            <button 
              onClick={() => {
                setTranscript('');
                lastSpeakerRef.current = null;
              }}
              className={`shrink-0 text-[7px] md:text-[8px] font-mono uppercase tracking-widest transition-colors ml-2 ${settings.theme === 'light' ? 'text-slate-400 hover:text-teal-600' : 'text-white/20 hover:text-cyan-500'}`}
            >
              CLEAR
            </button>
          </div>
          <div 
            ref={transcriptContainerRef}
            className={`h-56 md:h-72 lg:h-[380px] overflow-y-auto p-3 md:p-5 font-mono text-[10px] md:text-xs leading-relaxed scrollbar-hide ${settings.theme === 'light' ? 'text-slate-700' : 'text-cyan-100/80'}`}
          >
            {transcript ? (
              <div className="whitespace-pre-wrap">
                {transcript}
                <div ref={transcriptEndRef} />
              </div>
            ) : (
              <div className={`italic ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'}`}>WAITING_FOR_INPUT...</div>
            )}
          </div>
        </div>
      </main>

      {/* Personalities Modal */}
      <AnimatePresence>
        {showPersonalities && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-lg"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-2xl border overflow-hidden shadow-[16px_16px_0px_rgba(0,0,0,0.4)] flex flex-col max-h-[85vh] transition-colors hack-border ${settings.theme === 'light' ? 'bg-white border-black' : 'bg-black border-white/10'}`}
            >
              <div className={`px-4 py-3 md:px-8 md:py-6 border-b flex items-center justify-between ${settings.theme === 'light' ? 'border-black' : 'border-white/10'}`}>
                <h2 className={`text-sm md:text-xl font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-black' : 'text-cyan-400'}`}>[ PERSONALITIES ]</h2>
                <button onClick={() => setShowPersonalities(false)} className={`${settings.theme === 'light' ? 'text-slate-400 hover:text-slate-900' : 'text-white/40 hover:text-white'} transition-colors`}>
                  <X size={20} className="md:w-6 md:h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8">
                <section>
                  <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-4">
                    <h3 className={`text-xs font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Active Persona</h3>
                    <div className="flex gap-4 justify-between md:justify-end">
                      <button onClick={handleClearAllCustom} className={`text-[9px] md:text-[10px] font-mono flex items-center gap-1 uppercase tracking-widest transition-colors ${settings.theme === 'light' ? 'text-red-600/60 hover:text-red-600' : 'text-red-500/60 hover:text-red-500'}`}>
                        <Trash2 size={12} /> Clear All
                      </button>
                      <button 
                        onClick={() => {
                          setEditingPersonaId(null);
                          setNewPersona({ name: '', description: '', voice: 'Zephyr', systemInstruction: '', speechStyle: '' });
                          setIsCreating(true);
                        }} 
                        className={`text-[9px] md:text-[10px] font-mono flex items-center gap-1 uppercase tracking-widest ${settings.theme === 'light' ? 'text-teal-600 hover:text-teal-500' : 'text-cyan-500 hover:text-cyan-400'}`}
                      >
                        <Plus size={12} /> Add Custom
                      </button>
                    </div>
                  </div>

                  <AnimatePresence>
                    {isCreating && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className={`mb-6 p-3 md:p-6 border rounded-3xl space-y-4 overflow-hidden shadow-xl ${settings.theme === 'light' ? 'bg-white border-teal-500/30' : 'bg-white/[0.03] border-cyan-500/30'}`}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                          <div>
                            <label className={`text-[9px] md:text-[10px] font-mono uppercase mb-1.5 block tracking-widest ${settings.theme === 'light' ? 'text-teal-600/50' : 'text-cyan-500/50'}`}>Name</label>
                            <input type="text" value={newPersona.name} onChange={e => setNewPersona(p => ({ ...p, name: e.target.value }))} className={`w-full border rounded-xl px-4 py-2 text-xs focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500/50' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500/50'}`} placeholder="e.g. Xarvis" />
                          </div>
                          <div>
                            <label className={`text-[9px] md:text-[10px] font-mono uppercase mb-1.5 block tracking-widest ${settings.theme === 'light' ? 'text-teal-600/50' : 'text-cyan-500/50'}`}>Voice</label>
                            <select value={newPersona.voice} onChange={e => setNewPersona(p => ({ ...p, voice: e.target.value as VoiceName }))} className={`w-full border rounded-xl px-4 py-2 text-xs focus:outline-none transition-all appearance-none ${settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500/50' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500/50'}`}>
                              {(Object.keys(VOICE_DESCRIPTIONS) as VoiceName[]).map(v => (
                                <option key={v} value={v} className={settings.theme === 'light' ? 'bg-white' : 'bg-zinc-900'}>{VOICE_DESCRIPTIONS[v].label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className={`text-[9px] md:text-[10px] font-mono uppercase mb-1.5 block tracking-widest ${settings.theme === 'light' ? 'text-teal-600/50' : 'text-cyan-500/50'}`}>Description</label>
                          <input type="text" value={newPersona.description} onChange={e => setNewPersona(p => ({ ...p, description: e.target.value }))} className={`w-full border rounded-xl px-4 py-2 text-xs focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500/50' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500/50'}`} placeholder="Briefly describe this persona's role" />
                        </div>
                        <div>
                          <label className={`text-[9px] md:text-[10px] font-mono uppercase mb-1.5 block tracking-widest ${settings.theme === 'light' ? 'text-teal-600/50' : 'text-cyan-500/50'}`}>System Instruction</label>
                          <textarea value={newPersona.systemInstruction} onChange={e => setNewPersona(p => ({ ...p, systemInstruction: e.target.value }))} className={`w-full border rounded-xl px-4 py-2 text-xs h-24 md:h-28 focus:outline-none transition-all resize-none leading-relaxed ${settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500/50' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500/50'}`} placeholder="Define how the AI should behave..." />
                        </div>
                        <div className="flex flex-col md:flex-row gap-3 pt-2">
                          <button onClick={() => { setIsCreating(false); setEditingPersonaId(null); }} disabled={isSavingPersona} className={`w-full py-3 rounded-xl border text-[10px] font-mono uppercase tracking-widest transition-all ${settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100' : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/5'} ${isSavingPersona ? 'opacity-50 cursor-not-allowed' : ''}`}>CANCEL</button>
                          <button onClick={handleCreatePersonality} disabled={isSavingPersona} className={`w-full py-3 rounded-xl text-[10px] font-mono font-bold uppercase tracking-widest transition-all shadow-lg ${settings.theme === 'light' ? 'bg-teal-600 text-white hover:bg-teal-500' : 'bg-cyan-500 text-black hover:bg-cyan-400'} ${isSavingPersona ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {isSavingPersona ? 'SAVING...' : (editingPersonaId ? 'UPDATE PROTOCOL' : 'CREATE PROTOCOL')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="grid grid-cols-1 gap-4">
                    {personalities.map(p => (
                      <div 
                        key={p.id}
                        className={`group relative p-5 rounded-3xl border transition-all cursor-pointer ${
                          settings.activePersonalityId === p.id 
                            ? (settings.theme === 'light' ? 'bg-teal-500/[0.03] border-teal-500/50 shadow-md' : 'bg-cyan-500/[0.03] border-cyan-500/50 shadow-md') 
                            : (settings.theme === 'light' ? 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50' : 'bg-white/[0.01] border-white/5 hover:border-white/20 hover:bg-white/[0.03]')
                        }`}
                        onClick={() => handleSelectPersonality(p)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <span className={`font-mono text-sm font-medium tracking-tight ${settings.activePersonalityId === p.id ? (settings.theme === 'light' ? 'text-teal-600' : 'text-cyan-400') : (settings.theme === 'light' ? 'text-slate-900' : 'text-white/90')}`}>{p.name}</span>
                            </div>
                            <span className={`text-[9px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'}`}>{VOICE_DESCRIPTIONS[p.voice as VoiceName]?.label}</span>
                          </div>
                          
                          <div className="flex items-center gap-1">
                            {!p.isDefault && (
                              <div className="flex items-center gap-1">
                                <button onClick={(e) => { e.stopPropagation(); handleEditPersonality(p); }} className={`p-2.5 rounded-xl transition-all ${settings.theme === 'light' ? 'text-slate-300 hover:text-teal-600 hover:bg-teal-50' : 'text-white/20 hover:text-cyan-400 hover:bg-cyan-400/10'}`} title="Edit Persona"><Edit2 size={14} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDeletePersonality(p); }} className={`p-2.5 rounded-xl transition-all ${settings.theme === 'light' ? 'text-slate-300 hover:text-red-600 hover:bg-red-50' : 'text-white/20 hover:text-red-500 hover:bg-red-500/10'}`} title="Delete Persona"><Trash2 size={14} /></button>
                              </div>
                            )}
                          </div>
                        </div>
                        <p className={`text-xs leading-relaxed font-light ${settings.theme === 'light' ? 'text-slate-600' : 'text-white/40'}`}>{p.description}</p>
                        {settings.activePersonalityId === p.id && <div className={`absolute -left-[1px] top-1/4 bottom-1/4 w-[2px] rounded-full ${settings.theme === 'light' ? 'bg-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.6)]' : 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.6)]'}`} />}
                      </div>
                    ))}
                  </div>
                </section>

                {/* Settings Modal Ad Placement */}
                <section className="pt-4 border-t border-white/5">
                  <GoogleAd slot="3456789012" className="opacity-90" />
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Modal */}
      <AnimatePresence>
        {showAdmin && isAdmin && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-lg"
            onClick={(e) => { if (e.target === e.currentTarget) setShowAdmin(false); }}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-2xl border overflow-hidden shadow-[16px_16px_0px_rgba(0,0,0,0.4)] flex flex-col max-h-[85vh] transition-colors hack-border ${settings.theme === 'light' ? 'bg-white border-black' : 'bg-black border-white/10'}`}
            >
              <div className={`px-4 py-3 md:px-8 md:py-6 border-b flex items-center justify-between ${settings.theme === 'light' ? 'border-black' : 'border-white/10'}`}>
                <h2 className={`text-sm md:text-xl font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-black' : 'text-cyan-400'}`}>[ ADMIN_CONSOLE ]</h2>
                <button onClick={() => setShowAdmin(false)} className={`${settings.theme === 'light' ? 'text-slate-400 hover:text-slate-900' : 'text-white/40 hover:text-white'} transition-colors`}>
                  <X size={20} className="md:w-6 md:h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-12">
                <section>
                  <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Add Admin by Email</h3>
                  <form 
                    className="flex flex-col sm:flex-row gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const input = form.elements[0] as HTMLInputElement;
                      const emailToAdd = input.value.trim().toLowerCase();
                      if (!emailToAdd) return;
                      
                      try {
                        const q = query(collection(db, 'users'), where('email', '==', emailToAdd));
                        const snap = await getDocs(q);
                        if (snap.empty) {
                          alert(`User ${emailToAdd} not found. They must sign in at least once before they can be made an admin.`);
                          return;
                        }
                        
                        const targetUser = snap.docs[0];
                        await updateDoc(doc(db, 'users', targetUser.id), { role: 'admin' });
                        input.value = '';
                        alert(`${emailToAdd} has been granted admin access.`);
                      } catch (err) {
                        console.error("Failed to add admin", err);
                        alert("Failed to add admin. Please check permissions.");
                      }
                    }}
                  >
                    <input 
                      type="email" 
                      placeholder="Enter user's email address..." 
                      className={`flex-1 px-4 py-3 rounded-xl border text-xs font-mono focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-900 focus:border-teal-500/50' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500/50'}`}
                    />
                    <button type="submit" className={`px-6 py-3 rounded-xl font-mono text-[10px] uppercase tracking-widest transition-all ${settings.theme === 'light' ? 'bg-teal-600 text-white hover:bg-teal-500' : 'bg-cyan-500 text-black hover:bg-cyan-400'}`}>
                      Add Admin
                    </button>
                  </form>
                </section>

                <section>
                  <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Registered User Accounts ({allUsers.length})</h3>
                  <div className={`border rounded-3xl overflow-hidden ${settings.theme === 'light' ? 'bg-white border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className="max-h-96 overflow-y-auto">
                      {allUsers.map(u => (
                        <div key={u.uid} className={`relative p-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-b transition-colors ${settings.theme === 'light' ? 'border-slate-100 hover:bg-slate-50' : 'border-white/5 hover:bg-white/[0.02]'}`}>
                          <div className="flex items-center gap-3 overflow-hidden max-w-full">
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-8 h-8 rounded-full border border-white/10 shrink-0" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex justify-center items-center text-cyan-400 text-[10px] shrink-0">
                                {u.email?.[0].toUpperCase()}
                              </div>
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className={`text-xs font-mono truncate ${settings.theme === 'light' ? 'text-slate-900' : 'text-white/80'}`}>
                                {u.displayName || 'Anonymous'}
                                {u.role === 'admin' && <span className={`ml-2 text-[8px] px-1.5 py-0.5 rounded border ${settings.theme === 'light' ? 'bg-teal-500/10 border-teal-500 text-teal-600' : 'bg-cyan-500/10 border-cyan-500 text-cyan-400'}`}>ADMIN</span>}
                              </span>
                              <span className={`text-[9px] font-mono truncate ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'}`} title={u.email}>{u.email}</span>
                            </div>
                          </div>
                          {u.uid !== user?.uid && (
                            <div className="flex items-center gap-2 shrink-0 ml-auto">
                              <button 
                                onClick={() => handleToggleAdmin(u.uid, u.role)}
                                className={`p-2 rounded-xl text-[9px] font-mono uppercase tracking-widest transition-all ${settings.theme === 'light' ? 'text-slate-500 hover:text-teal-600 hover:bg-teal-50' : 'text-white/40 hover:text-cyan-400 hover:bg-cyan-500/10'}`}
                              >
                                {u.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                              </button>
                              <button 
                                onClick={() => handleDeleteUser(u.uid)}
                                className={`p-2 rounded-xl transition-all ${settings.theme === 'light' ? 'text-slate-300 hover:text-red-600 hover:bg-red-50' : 'text-white/20 hover:text-red-500 hover:bg-red-500/10'}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>// DATA_SYNC (GOOGLE_SHEETS)</h3>
                  <div className="space-y-4">
                    <div className={`flex items-center justify-between p-4 border ${settings.theme === 'light' ? 'bg-slate-50 border-black' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <FileSpreadsheet size={18} className={settings.theme === 'light' ? 'text-black' : 'text-cyan-500'} />
                        <span className={`font-mono text-sm ${settings.theme === 'light' ? 'text-slate-700' : 'text-white/80'}`}>LOG_TO_SHEETS</span>
                      </div>
                      <button 
                        onClick={() => setSettings(s => ({ ...s, logToSheets: !s.logToSheets }))}
                        className={`w-12 h-6 transition-all relative border ${settings.logToSheets ? (settings.theme === 'light' ? 'bg-black border-black' : 'bg-cyan-500 border-cyan-500') : (settings.theme === 'light' ? 'bg-slate-200 border-slate-300' : 'bg-white/10 border-white/20')}`}
                      >
                        <div className={`absolute top-0.5 w-4 h-4 bg-white border border-black transition-all ${settings.logToSheets ? 'left-7' : 'left-0.5'}`} />
                      </button>
                    </div>

                    {settings.logToSheets && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                        className="space-y-4 pt-2"
                      >
                        {!hasGoogleAccess ? (
                          <button 
                            onClick={handleGoogleAuth}
                            className={`w-full py-3 border rounded-xl text-[10px] font-mono uppercase tracking-widest transition-all ${settings.theme === 'light' ? 'bg-teal-500/10 border-teal-500/30 text-teal-600 hover:bg-teal-500/20' : 'bg-white/5 border-white/10 text-cyan-400 hover:bg-white/10'}`}
                          >
                            Authorize Google Access
                          </button>
                        ) : (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between px-2">
                              <span className={`text-[9px] font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-teal-600/50' : 'text-cyan-500/50'}`}>Spreadsheet ID</span>
                            </div>
                            <input 
                              type="text" 
                              value={settings.spreadsheetId} 
                              onChange={e => setSettings(s => ({ ...s, spreadsheetId: e.target.value }))}
                              placeholder="Enter Spreadsheet ID"
                              className={`w-full border rounded-xl px-4 py-2.5 text-xs focus:outline-none transition-all ${settings.theme === 'light' ? 'bg-white border-slate-200 text-slate-900 focus:border-teal-500/50' : 'bg-black/40 border-white/10 text-white focus:border-cyan-500/50'}`}
                            />
                            <p className={`text-[9px] font-mono leading-relaxed ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/20'}`}>
                              Find the ID in your sheet URL: docs.google.com/spreadsheets/d/<span className={settings.theme === 'light' ? 'text-teal-600/60' : 'text-cyan-500/40'}>ID_HERE</span>/edit
                            </p>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showBluetooth && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-2 md:p-4 bg-black/80 backdrop-blur-lg"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className={`w-full max-w-2xl border overflow-hidden shadow-[16px_16px_0px_rgba(0,0,0,0.4)] flex flex-col max-h-[85vh] transition-colors hack-border ${settings.theme === 'light' ? 'bg-white border-black' : 'bg-black border-white/10'}`}
            >
              <div className={`px-4 py-3 md:px-8 md:py-6 border-b flex items-center justify-between ${settings.theme === 'light' ? 'border-black' : 'border-white/10'}`}>
                <h2 className={`text-sm md:text-xl font-mono uppercase tracking-widest ${settings.theme === 'light' ? 'text-black' : 'text-cyan-400'}`}>[ SETTINGS ]</h2>
                <button onClick={() => setShowBluetooth(false)} className={`${settings.theme === 'light' ? 'text-slate-400 hover:text-slate-900' : 'text-white/40 hover:text-white'} transition-colors`}>
                  <X size={20} className="md:w-6 md:h-6" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8">
                <section>
                  <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>DEVICE CONNECTION</h3>
                  <div className="flex flex-col gap-4">
                    {user?.emailVerified ? (
                      <button 
                        onClick={handleBluetoothConnect}
                        disabled={isBluetoothConnecting}
                        className={`flex items-center justify-center gap-3 p-4 border transition-all ${
                          settings.bluetoothEnabled 
                            ? (settings.theme === 'light' ? 'bg-black border-black text-white' : 'bg-cyan-500/10 border-cyan-500 text-cyan-400') 
                            : (settings.theme === 'light' ? 'bg-white border-black text-black hover:bg-slate-50' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20')
                        }`}
                      >
                        {settings.bluetoothEnabled ? <BluetoothConnected size={18} /> : <Bluetooth size={18} />}
                        <span className="font-mono text-sm">
                          {isBluetoothConnecting ? 'CONNECTING...' : settings.bluetoothEnabled ? 'CONNECTED' : 'CONNECT_BLUETOOTH'}
                        </span>
                      </button>
                    ) : (
                      <div className={`p-4 border text-[10px] font-mono text-center mb-4 ${settings.theme === 'light' ? 'bg-slate-50 border-black' : 'bg-white/5 border-white/10'}`}>
                        <span className="text-red-500">ACCESS_DENIED:</span> Verified email address required.
                      </div>
                    )}
                  </div>
                </section>
                
                <section>
                  <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>// INTERFACE_THEME</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setSettings(s => ({ ...s, theme: 'dark' }))}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-2 p-3 sm:p-4 border transition-all ${
                        settings.theme === 'dark' 
                          ? (settings.theme === 'light' ? 'bg-black border-black text-white' : 'bg-cyan-500/10 border-cyan-500 text-cyan-400') 
                          : (settings.theme === 'light' ? 'bg-white border-black text-black hover:bg-slate-50' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20')
                      }`}
                    >
                      <Terminal size={16} className="sm:w-[18px] sm:h-[18px]" /> 
                      <span className="font-mono text-[9px] sm:text-xs uppercase text-center">DARK_PROTOCOL</span>
                    </button>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, theme: 'light' }))}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-2 p-3 sm:p-4 border transition-all ${
                        settings.theme === 'light' 
                          ? (settings.theme === 'light' ? 'bg-black border-black text-white' : 'bg-cyan-500/10 border-cyan-500 text-cyan-400') 
                          : (settings.theme === 'light' ? 'bg-white border-black text-black hover:bg-slate-50' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20')
                      }`}
                    >
                      <Cpu size={16} className="sm:w-[18px] sm:h-[18px]" /> 
                      <span className="font-mono text-[9px] sm:text-xs uppercase text-center">LIGHT_PROTOCOL</span>
                    </button>
                  </div>
                 </section>



                <section>
                  <h3 className={`text-xs font-mono uppercase tracking-widest mb-4 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'}`}>Input Protocol</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setSettings(s => ({ ...s, inputMode: 'voice' }))}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-2 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all ${
                        settings.inputMode === 'voice' 
                          ? (settings.theme === 'light' ? 'bg-teal-500/10 border-teal-500 text-teal-600' : 'bg-cyan-500/10 border-cyan-500 text-cyan-400') 
                          : (settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20')
                      }`}
                    >
                      <Mic size={16} className="sm:w-[18px] sm:h-[18px]" /> 
                      <span className="font-mono text-[9px] sm:text-xs">VOICE</span>
                    </button>
                    <button 
                      onClick={() => setSettings(s => ({ ...s, inputMode: 'text' }))}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-2 p-3 sm:p-4 rounded-xl sm:rounded-2xl border transition-all ${
                        settings.inputMode === 'text' 
                          ? (settings.theme === 'light' ? 'bg-teal-500/10 border-teal-500 text-teal-600' : 'bg-cyan-500/10 border-cyan-500 text-cyan-400') 
                          : (settings.theme === 'light' ? 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300' : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20')
                      }`}
                    >
                      <MessageSquare size={16} className="sm:w-[18px] sm:h-[18px]" /> 
                      <span className="font-mono text-[9px] sm:text-xs">TEXT</span>
                    </button>
                  </div>
                </section>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-auto pt-4 pb-2 flex flex-col items-center gap-2">
        <div className={`text-center px-4 max-w-lg mb-2 ${settings.theme === 'light' ? 'text-slate-500' : 'text-white/40'} font-mono text-[9px] leading-relaxed`}>
          Xarvis is an AI-powered voice assistant interface. By authenticating with Google, you can allow Xarvis to securely log your interactions and data directly to your personal Google Sheets.
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 ${settings.theme === 'light' ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'} rounded-full border opacity-40 hover:opacity-100 transition-opacity`}>
          <div className="w-2 h-2 rounded-full bg-[#4285F4]" />
          <span className={`text-[7px] font-mono ${settings.theme === 'light' ? 'text-slate-900' : 'text-white'} uppercase tracking-tight`}>Powered by Google Cloud</span>
        </div>
        <div className={`${settings.theme === 'light' ? 'text-slate-900/40' : 'text-white/20'} font-mono text-[8px] tracking-[0.3em] uppercase`}>
          System Protocol v2.7.0 // {activePersonality?.name} Interface
        </div>

        {/* Footer Ad Placement */}
        <div className="mt-2 w-full max-w-2xl px-4">
          <GoogleAd slot="4567890123" format="auto" className="opacity-60 hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
}
