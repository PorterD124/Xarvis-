/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoiceName } from "../types";

// Define Modality locally to avoid top-level import from @google/genai
export enum Modality {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  AUDIO = "AUDIO",
  VIDEO = "VIDEO"
}

export class LiveAudioService {
  private ai: any = null;
  private session: any = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private nextStartTime: number = 0;
  private isInterrupted: boolean = false;

  constructor() {
    // Initialization moved to connect() to prevent crash on startup
  }

  async connect(
    settings: { 
      voice: VoiceName; 
      systemInstruction: string;
      inputMode?: 'voice' | 'text';
      apiKey?: string;
    },
    callbacks: {
      onMessage?: (text: string, role: 'user' | 'model') => void;
      onStatusChange?: (status: 'connected' | 'disconnected' | 'connecting') => void;
      onVolumeChange?: (volume: number) => void;
      onError?: (error: string) => void;
    }
  ) {
    try {
      console.log("[DEBUG] LiveAudioService.connect called");
      
      const apiKey = settings.apiKey || process.env.GEMINI_API_KEY;
      console.log("[DEBUG] LiveAudioService initializing. Key present:", !!apiKey);
      
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        const errorMsg = "Bluetooth Link Error: GEMINI_API_KEY is missing or invalid. Please check your environment variables.";
        console.error(errorMsg);
        throw new Error("API_KEY_MISSING");
      }

      if (!this.ai) {
        console.log("[DEBUG] Loading GoogleGenAI SDK...");
        const { GoogleGenAI } = await import("@google/genai");
        console.log("[DEBUG] Creating GoogleGenAI instance for Live API...");
        try {
          this.ai = new GoogleGenAI({ apiKey });
          console.log("[DEBUG] GoogleGenAI instance created for Live API.");
        } catch (initErr) {
          console.error("Failed to initialize GoogleGenAI:", initErr);
          throw initErr;
        }
      }

      callbacks.onStatusChange?.('connecting');
      
      if (!this.audioContext) {
        console.log("[DEBUG] Creating AudioContext...");
        this.audioContext = new AudioContext({ sampleRate: 16000 });
      } else if (this.audioContext.state === 'suspended') {
        console.log("[DEBUG] Resuming AudioContext...");
        await this.audioContext.resume();
      }
      
      if (settings.inputMode !== 'text') {
        console.log("[DEBUG] Requesting microphone access...");
        try {
          this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          console.log("[DEBUG] Microphone access granted");
          this.source = this.audioContext.createMediaStreamSource(this.stream);
          this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        } catch (micErr: any) {
          console.error("[DEBUG] Microphone access denied:", micErr);
          throw new Error("Microphone access denied. Please allow microphone permissions.");
        }
      } else {
        console.log("[DEBUG] Skipping microphone access (Text Mode)");
      }
      
      console.log("[DEBUG] Connecting to Gemini Live API...");
      const sessionPromise = this.ai!.live.connect({
        model: "gemini-3.1-flash-live-preview",
        config: {
          responseModalities: [Modality.AUDIO],
          // Removing tools temporarily to see if it improves connection stability
          // tools: [{ googleSearch: {} }],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voice } },
          },
          systemInstruction: settings.systemInstruction,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
          // Unfiltered safety settings
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
          ]
        },
        callbacks: {
          onopen: () => {
            console.log("[DEBUG] Gemini Live API connection opened");
            callbacks.onStatusChange?.('connected');
            
            if (this.source && this.processor) {
              this.source.connect(this.processor);
              this.processor.connect(this.audioContext!.destination);
              
              this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                
                // Calculate volume for visualizer
                let sum = 0;
                for(let i=0; i<inputData.length; i++) sum += inputData[i]*inputData[i];
                const rms = Math.sqrt(sum/inputData.length);
                callbacks.onVolumeChange?.(rms);

                // Send 100% of packets to let the server VAD handle turns
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                  pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
                }
                
                // Safer base64 conversion for large arrays
                const uint8Array = new Uint8Array(pcmData.buffer);
                let binary = '';
                const len = uint8Array.byteLength;
                for (let i = 0; i < len; i++) {
                  binary += String.fromCharCode(uint8Array[i]);
                }
                const base64Data = btoa(binary);

                if (this.session) {
                  try {
                    const result = this.session.sendRealtimeInput({
                      audio: { data: base64Data, mimeType: 'audio/pcm;rate=16000' }
                    });
                    // If it returns a promise, catch any rejections
                    if (result instanceof Promise) {
                      result.catch((sendErr: any) => {
                        console.error("[DEBUG] Async failure in sendRealtimeInput (audio):", sendErr);
                      });
                    }
                  } catch (sendErr) {
                    console.error("[DEBUG] Failed to send audio input:", sendErr);
                  }
                }
              };
            }
          },
          onmessage: async (rawMessage: any) => {
            try {
              const message = rawMessage;
              // Handle model's response (audio and text)
              if (message.serverContent?.modelTurn?.parts) {
                for (const part of message.serverContent.modelTurn.parts) {
                  if (part.inlineData) {
                    this.playAudioChunk(part.inlineData.data);
                  }
                  if (part.text) {
                    // This is the model's response text (or transcription)
                    console.log("[DEBUG] Model text chunk:", part.text);
                    callbacks.onMessage?.(part.text, 'model');
                  }
                }
              }
              
              // Handle user's input transcription
              if (message.serverContent?.userTurn?.parts) {
                for (const part of message.serverContent.userTurn.parts) {
                  if (part.text) {
                    console.log("[DEBUG] User transcription chunk:", part.text);
                    callbacks.onMessage?.(part.text, 'user');
                  }
                }
              }
              
              if (message.serverContent?.interrupted) {
                console.log("[DEBUG] Session interrupted");
                this.isInterrupted = true;
                this.nextStartTime = 0;
              }
            } catch (err) {
              console.error("[DEBUG] Error processing Live API message:", err);
            }
          },
          onclose: () => {
            console.log("[DEBUG] Gemini Live API connection closed");
            callbacks.onStatusChange?.('disconnected');
            this.disconnect();
          },
          onerror: (err: any) => {
            console.error("[DEBUG] Gemini Live API error:", err);
            // callbacks.onError?.(err.message || "Gemini API connection error."); // Silenced
            this.disconnect();
          }
        }
      });

      console.log("[DEBUG] Waiting for session establishment...");
      try {
        this.session = await sessionPromise;
        console.log("[DEBUG] Session established successfully");
      } finally {
        // No timeout to clear
      }
    } catch (err: any) {
      console.error("[DEBUG] LiveAudioService.connect failed:", err);
      callbacks.onStatusChange?.('disconnected');
      throw err;
    }
  }

  private playAudioChunk(base64Data: string) {
    if (!this.audioContext) return;

    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const pcmData = new Int16Array(bytes.buffer);
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 0x7FFF;
    }

    const audioBuffer = this.audioContext.createBuffer(1, floatData.length, 16000);
    audioBuffer.getChannelData(0).set(floatData);

    const currentTime = this.audioContext.currentTime;
    if (this.nextStartTime < currentTime) {
      this.nextStartTime = currentTime + 0.1; // Small buffer
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    source.start(this.nextStartTime);
    this.nextStartTime += audioBuffer.duration;
  }

  sendText(text: string) {
    if (!this.session) {
      console.error("[DEBUG] Cannot send text: No active session");
      return;
    }
    
    console.log(`[DEBUG] Sending text to Gemini: ${text}`);
    try {
      this.session.send({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text }] }],
          turnComplete: true
        }
      });
    } catch (err) {
      console.error("[DEBUG] Failed to send text via session.send", err);
    }
  }

  disconnect() {
    try {
      if (this.session) {
        this.session.close();
      }
    } catch (err) {
      console.warn("[DEBUG] Error closing session:", err);
    }
    this.session = null;
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.audioContext?.close();
    } catch (err) {
      console.warn("[DEBUG] Error cleaning up audio:", err);
    }
    this.audioContext = null;
    this.nextStartTime = 0;
  }
}
