import type { Message } from '@voice-chat/shared';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 20_000;
const SYSTEM_INSTRUCTION =
  'You are a supportive English tutor. Always reply in English. Keep replies brief, useful, and conversational. Continue the conversation naturally, and when appropriate gently correct the learner’s English without overwhelming them.';

interface GeminiPart {
  text?: unknown;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

/** Calls Gemini's REST API with the minimum chat context required for an English-tutor reply. */
export class GeminiService {
  /**
   * Generates a concise English-tutor response from recent persisted messages.
   * @param messages Chronological chat history; only the latest 20 text messages are sent.
   * @returns The assistant response text.
   * @throws {Error} With a sanitized message when configuration, transport, or response data is invalid.
   */
  async generateReply(messages: Message[]): Promise<string> {
    const apiKey = process.env['GEMINI_API_KEY']?.trim();
    const model = process.env['GEMINI_MODEL']?.trim() || DEFAULT_MODEL;
    if (!apiKey) throw new Error('Gemini is not configured');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: messages.slice(-20).map((message) => ({
              role: message.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: message.content }],
            })),
            generationConfig: { maxOutputTokens: 350, temperature: 0.7 },
          }),
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error('Gemini request failed');
      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
      if (!text) throw new Error('Gemini returned no usable response');
      return text;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw new Error('Gemini request timed out');
      if (error instanceof Error && error.message.startsWith('Gemini')) throw error;
      throw new Error('Gemini request failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export const geminiService = new GeminiService();
