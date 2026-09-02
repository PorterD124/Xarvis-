/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Service for handling standard text-based Gemini API requests.
 * This is separate from the Live Audio service and can be used for
 * one-off queries, summarization, or standard chat.
 */
export class GeminiService {
  private ai: any = null;

  private async getAI() {
    if (!this.ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      console.log("[DEBUG] GeminiService initializing. Key present:", !!apiKey);
      
      if (!apiKey || apiKey === "undefined" || apiKey === "null") {
        console.error("GEMINI_API_KEY is missing or invalid.");
        throw new Error("API_KEY_MISSING");
      }

      try {
        const { GoogleGenAI } = await import("@google/genai");
        console.log("[DEBUG] Creating GoogleGenAI instance...");
        this.ai = new GoogleGenAI({ apiKey });
        console.log("[DEBUG] GoogleGenAI instance created.");
      } catch (err) {
        console.error("Failed to initialize GoogleGenAI:", err);
        throw err;
      }
    }
    return this.ai;
  }

  /**
   * Generates a text response for a given prompt.
   */
  async generateText(prompt: string, systemInstruction?: string): Promise<string> {
    try {
      const ai = await this.getAI();
      
      const responsePromise = ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
        config: {
          systemInstruction: systemInstruction || undefined,
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_NONE' }
          ]
        },
      });

      try {
        const response = await responsePromise as any;
        return response.text || "No response generated.";
      } finally {
        // No timeout to clear
      }
    } catch (error) {
      console.error("GeminiService Error:", error);
      throw error;
    }
  }

  /**
   * Example: Specifically generates a story about a magic backpack.
   */
  async generateBackpackStory(): Promise<string> {
    return this.generateText("Write a short story about a magic backpack.");
  }
}

export const geminiService = new GeminiService();
