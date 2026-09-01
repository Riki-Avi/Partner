import { AppError } from '../middleware/error.middleware.js';

const API_BASE_URL = 'https://api.elevenlabs.io/v1';
const DEFAULT_TTS_MODEL_ID = 'eleven_flash_v2_5';
const DEFAULT_STT_MODEL_ID = 'scribe_v2';
const DEFAULT_OUTPUT_FORMAT = 'mp3_44100_128';
const DEFAULT_LANGUAGE_CODE = 'eng';
const TTS_TIMEOUT_MS = 45_000;
const STT_TIMEOUT_MS = 60_000;
const VOICES_TIMEOUT_MS = 15_000;
const MAX_GENERATED_AUDIO_BYTES = 15 * 1024 * 1024;

/**
 * Output formats whose codec a browser can play from a blob URL without extra containerization.
 * Raw `pcm_*` and telephony `ulaw_*` formats are intentionally excluded: they would need a WAV
 * header added before playback, so accepting them here would produce silently broken audio.
 */
const PLAYABLE_OUTPUT_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ['mp3_', 'audio/mpeg'],
  ['opus_', 'audio/ogg'],
  ['wav_', 'audio/wav'],
];

/** Audio containers accepted for transcription uploads, mapped to the extension Scribe expects. */
const TRANSCRIPTION_EXTENSIONS: Readonly<Record<string, string>> = {
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/ogg': 'ogg',
  'application/ogg': 'ogg',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
};

export interface GeneratedSpeech {
  audio: Buffer;
  contentType: string;
}

interface ElevenLabsVoice {
  voice_id?: unknown;
}

interface ElevenLabsVoicesResponse {
  voices?: unknown;
}

interface ScribeResponse {
  text?: unknown;
}

/** Raised when the provider credential is absent so the API can answer with a stable code. */
class SpeechNotConfiguredError extends AppError {
  constructor(message = 'The ElevenLabs voice service is not configured') {
    super(message, 503, 'SPEECH_NOT_CONFIGURED');
  }
}

/** Raised for any provider-side failure, deliberately without provider detail. */
class SpeechProviderError extends AppError {
  constructor(message: string) {
    super(message, 502, 'SPEECH_PROVIDER_ERROR');
  }
}

/** Raised when an upload contains no recognizable speech. */
class NoSpeechDetectedError extends AppError {
  constructor(message = 'No speech was detected in the recording') {
    super(message, 422, 'SPEECH_NO_SPEECH_DETECTED');
  }
}

/**
 * Wraps the ElevenLabs REST API for English speech synthesis and transcription.
 *
 * The provider credential stays server-side: the browser never receives it, and provider error
 * detail is logged locally but never forwarded to clients.
 */
export class ElevenLabsService {
  private cachedVoiceId: string | null = null;

  /**
   * Converts English text into browser-playable audio.
   * @param text Validated text to speak.
   * @returns The generated audio bytes and the matching `Content-Type`.
   * @throws {SpeechNotConfiguredError} If `ELEVENLABS_API_KEY` is absent.
   * @throws {SpeechProviderError} If generation fails or returns unusable audio.
   */
  async synthesize(text: string): Promise<GeneratedSpeech> {
    const apiKey = this.requireApiKey();
    const modelId = process.env['ELEVENLABS_MODEL_ID']?.trim() || DEFAULT_TTS_MODEL_ID;
    const { outputFormat, contentType } = this.resolveOutputFormat();
    const voiceId = await this.resolveVoiceId(apiKey);

    // One retry absorbs a transient provider hiccup. A timeout is not retried because the caller
    // is a user waiting on playback and a second 45s wait is worse than a prompt failure.
    let timedOut = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const audio = await this.requestSpeech(text, apiKey, voiceId, modelId, outputFormat);
        return { audio, contentType };
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          timedOut = true;
          break;
        }
        console.error('ElevenLabs synthesis attempt failed:', error);
      }
    }

    throw new SpeechProviderError(
      timedOut ? 'The voice service timed out' : 'The voice service could not generate audio',
    );
  }

  /**
   * Transcribes recorded English audio with Scribe.
   * @param audio Uploaded audio bytes.
   * @param mimeType Content type reported by the browser recorder.
   * @returns The recognized transcript, trimmed.
   * @throws {SpeechNotConfiguredError} If `ELEVENLABS_API_KEY` is absent.
   * @throws {NoSpeechDetectedError} If the provider returns an empty transcript.
   * @throws {SpeechProviderError} If transcription fails.
   */
  async transcribe(audio: Buffer, mimeType: string): Promise<string> {
    const apiKey = this.requireApiKey();
    const modelId = process.env['ELEVENLABS_STT_MODEL_ID']?.trim() || DEFAULT_STT_MODEL_ID;
    const languageCode = process.env['ELEVENLABS_STT_LANGUAGE']?.trim() || DEFAULT_LANGUAGE_CODE;

    const form = new FormData();
    form.append(
      'file',
      new Blob([audio], { type: mimeType }),
      this.transcriptionFileName(mimeType),
    );
    form.append('model_id', modelId);
    form.append('language_code', languageCode);
    form.append('tag_audio_events', 'false');
    form.append('diarize', 'false');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}/speech-to-text`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error(
          `ElevenLabs transcription failed with status ${response.status}:`,
          await this.safeErrorBody(response),
        );
        throw new SpeechProviderError('The transcription service could not process the recording');
      }

      const payload = (await response.json()) as ScribeResponse;
      const transcript = typeof payload.text === 'string' ? payload.text.trim() : '';
      if (!transcript) throw new NoSpeechDetectedError();
      return transcript;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new SpeechProviderError('The transcription service timed out');
      console.error('ElevenLabs transcription failed:', error);
      throw new SpeechProviderError('The transcription service could not process the recording');
    } finally {
      clearTimeout(timeout);
    }
  }

  private requireApiKey(): string {
    const apiKey = process.env['ELEVENLABS_API_KEY']?.trim();
    if (!apiKey) throw new SpeechNotConfiguredError();
    return apiKey;
  }

  /**
   * Picks the configured output format, falling back to the default when the configured codec
   * would not be directly playable in a browser.
   */
  private resolveOutputFormat(): { outputFormat: string; contentType: string } {
    const configured = process.env['ELEVENLABS_OUTPUT_FORMAT']?.trim().toLowerCase();
    if (configured) {
      const match = PLAYABLE_OUTPUT_PREFIXES.find(([prefix]) => configured.startsWith(prefix));
      if (match) return { outputFormat: configured, contentType: match[1] };
      console.warn(
        `Ignoring ELEVENLABS_OUTPUT_FORMAT "${configured}": it is not directly playable in a browser.`,
      );
    }
    return { outputFormat: DEFAULT_OUTPUT_FORMAT, contentType: 'audio/mpeg' };
  }

  /**
   * Resolves the voice to speak with, preferring the configured identifier.
   *
   * Without configuration the first voice available to the account is discovered once and cached.
   * Hardcoding a shared default voice identifier is not viable: ElevenLabs restricts its legacy
   * default voices to older accounts and retires them entirely at the end of 2026.
   */
  private async resolveVoiceId(apiKey: string): Promise<string> {
    const configured = process.env['ELEVENLABS_VOICE_ID']?.trim();
    if (configured) return configured;
    if (this.cachedVoiceId) return this.cachedVoiceId;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), VOICES_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_BASE_URL}/voices`, {
        headers: { 'xi-api-key': apiKey },
        signal: controller.signal,
      });
      if (!response.ok) {
        console.error(
          `ElevenLabs voice lookup failed with status ${response.status}:`,
          await this.safeErrorBody(response),
        );
        // An API key scoped to synthesis only cannot list voices. That is a configuration gap the
        // operator can close directly, so it is reported as such instead of as a provider outage.
        if (response.status === 401 || response.status === 403)
          throw new SpeechNotConfiguredError(
            'The ElevenLabs API key cannot list voices (missing voices_read). Set ELEVENLABS_VOICE_ID to a voice from your account, or grant the key voices_read permission.',
          );
        throw new SpeechProviderError('The voice service could not resolve a voice');
      }

      const payload = (await response.json()) as ElevenLabsVoicesResponse;
      const voices = Array.isArray(payload.voices) ? (payload.voices as ElevenLabsVoice[]) : [];
      const voiceId = voices
        .map((voice) => (typeof voice?.voice_id === 'string' ? voice.voice_id.trim() : ''))
        .find((candidate) => candidate.length > 0);
      if (!voiceId)
        throw new SpeechProviderError(
          'No ElevenLabs voice is available for this account. Set ELEVENLABS_VOICE_ID.',
        );

      this.cachedVoiceId = voiceId;
      console.info(`Using ElevenLabs voice ${voiceId} (set ELEVENLABS_VOICE_ID to pin one).`);
      return voiceId;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new SpeechProviderError('The voice service timed out');
      console.error('ElevenLabs voice lookup failed:', error);
      throw new SpeechProviderError('The voice service could not resolve a voice');
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestSpeech(
    text: string,
    apiKey: string,
    voiceId: string,
    modelId: string,
    outputFormat: string,
  ): Promise<Buffer> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
    try {
      const endpoint = `${API_BASE_URL}/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
          Accept: 'audio/*',
        },
        body: JSON.stringify({ text, model_id: modelId }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const detail = await this.safeErrorBody(response);
        console.error(`ElevenLabs synthesis failed with status ${response.status}:`, detail);
        throw new Error(`Synthesis rejected with status ${response.status}`);
      }

      const audio = Buffer.from(await response.arrayBuffer());
      if (!audio.length) throw new Error('Synthesis returned no audio');
      if (audio.length > MAX_GENERATED_AUDIO_BYTES)
        throw new Error('Synthesis returned oversized audio');
      return audio;
    } finally {
      clearTimeout(timeout);
    }
  }

  private transcriptionFileName(mimeType: string): string {
    const base = mimeType.split(';')[0]?.trim().toLowerCase() ?? '';
    return `recording.${TRANSCRIPTION_EXTENSIONS[base] ?? 'webm'}`;
  }

  /** Reads a provider error body for local logs without letting a parse failure mask the error. */
  private async safeErrorBody(response: Response): Promise<string> {
    try {
      return (await response.text()).slice(0, 500);
    } catch {
      return '<unreadable response body>';
    }
  }
}

export const elevenLabsService = new ElevenLabsService();
