import type {
  AdventureRole,
  ChatMemorySnippet,
  Message,
  StoryAdventure,
} from '@voice-chat/shared';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const MAX_HISTORY_MESSAGES = 20;

/** Keeps one turn from burying the learner in corrections, and bounds what gets persisted. */
const MAX_CORRECTIONS_PER_TURN = 5;

/** Matches `corrections.error_type VARCHAR(100)`. */
const MAX_ERROR_TYPE_LENGTH = 100;

/**
 * Taxonomy the tutor must choose from. Owned here rather than shared with the browser so the
 * frontend can render whatever it receives and derive its filters from the stats endpoint, which
 * keeps the list in exactly one place.
 */
const ERROR_TYPES = [
  'grammar',
  'verb-tense',
  'word-order',
  'vocabulary',
  'preposition',
  'article',
  'spelling',
  'punctuation',
  'other',
] as const;

const SYSTEM_INSTRUCTION = `You are a supportive English tutor.

Reply only with JSON matching the provided schema.

"reply": your conversational answer, always in English. Keep it brief, useful, and natural, and
continue the conversation. If you corrected something, acknowledge it warmly and briefly.

"corrections": mistakes in the learner's MOST RECENT message only.
- Copy "original" verbatim from that message. Never paraphrase it and never invent text.
- "corrected" is the same fragment written correctly, and must differ from "original".
- "explanation" is one short, encouraging sentence explaining the rule.
- Report only real errors in grammar, word choice, word order, or spelling. Ignore capitalisation
  of the pronoun "I" only when the meaning is already clear, and ignore missing final punctuation.
- Never invent an error. Return an empty array when the message is already correct.
- Report at most ${MAX_CORRECTIONS_PER_TURN} corrections, prioritising the ones that matter most.`;

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reply: { type: 'STRING' },
    corrections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          errorType: { type: 'STRING', enum: [...ERROR_TYPES] },
          original: { type: 'STRING' },
          corrected: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['errorType', 'original', 'corrected', 'explanation'],
        propertyOrdering: ['errorType', 'original', 'corrected', 'explanation'],
      },
    },
  },
  required: ['reply', 'corrections'],
  propertyOrdering: ['reply', 'corrections'],
};

const MAX_PHRASE_LENGTH = 1_000;
const MAX_LANGUAGE_NAME_LENGTH = 60;

const TRANSLATION_INSTRUCTION = `You are a supportive English tutor helping a Spanish-speaking learner.

Reply only with JSON matching the provided schema.

"sourceLanguage": the detected language name in English (e.g. "Spanish" or "English"), up to ${MAX_LANGUAGE_NAME_LENGTH} characters.
"translation": natural English when source is Spanish, natural Spanish when source is English.
"explanation": one or two short sentences in Spanish explaining what makes the translation work.`;

const TRANSLATION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sourceLanguage: { type: 'STRING' },
    translation: { type: 'STRING' },
    explanation: { type: 'STRING' },
  },
  required: ['sourceLanguage', 'translation', 'explanation'],
  propertyOrdering: ['sourceLanguage', 'translation', 'explanation'],
};

const RECOMMENDATIONS_INSTRUCTION = `You are a warm, supportive, and deeply attentive English learning Partner and conversation companion.
Your mission is to propose deeply personalized, exciting conversation topics and scenarios tailored to the learner.

MANDATORY RULES:
1. IF RECENT CHAT HISTORY IS PROVIDED:
   - YOU MUST PRIORITIZE THEIR REAL CONVERSATIONS ABOVE GENERIC INTEREST TAGS.
   - At least 3 of the 4 recommendations MUST directly reference and build upon the specific topics, games, characters, philosophies, stories, or opinions the learner mentioned (for example, if they talked about League of Legends, Yasuo, stoicism, or swordsmanship, propose topics specifically about gaming psychology, favorite champions, stoic philosophy in everyday life, or legendary swordsmen!).
   - In the "starterPrompt", reference what they said like a real companion (e.g., "Earlier you mentioned you feel connected to Yasuo's stoic aura...", "Since you love League of Legends...", "Thinking about your stoic mindset...").
   - In "contextReason", state the exact conversation connection with an emoji (e.g., "Inspired by your League of Legends chat 🎮", "Follow-up to your talk on Stoicism & Yasuo ⚔️", "Practicing English while discussing competitive gaming 🏆").
2. Only use general interest tags as a fallback or complementary 4th card when previous chats don't cover everything.

Output ONLY JSON matching the provided schema.
Generate 4 distinct, creative conversation proposals:
- "category": one of "topic", "roleplay", "challenge", "casual", "debate".
- "title": A catchy, enticing title.
- "description": 1 or 2 encouraging sentences in English explaining what you'll talk about and why it connects to their chats.
- "starterPrompt": The exact first message you as the Partner will say to greet them warmly, reference their past chat naturally, and kick off the conversation.
- "contextReason": A short, friendly phrase in English with an emoji explaining the inspiration.
- "difficulty": "beginner", "intermediate", or "advanced".`;

const RECOMMENDATIONS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    recommendations: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          category: {
            type: 'STRING',
            enum: ['topic', 'roleplay', 'challenge', 'casual', 'debate'],
          },
          title: { type: 'STRING' },
          description: { type: 'STRING' },
          starterPrompt: { type: 'STRING' },
          contextReason: { type: 'STRING' },
          difficulty: {
            type: 'STRING',
            enum: ['beginner', 'intermediate', 'advanced'],
          },
        },
        required: [
          'category',
          'title',
          'description',
          'starterPrompt',
          'contextReason',
          'difficulty',
        ],
        propertyOrdering: [
          'category',
          'title',
          'description',
          'starterPrompt',
          'contextReason',
          'difficulty',
        ],
      },
    },
  },
  required: ['recommendations'],
  propertyOrdering: ['recommendations'],
};

const ADVENTURE_WORLD_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    theme: { type: 'STRING' },
    setting: { type: 'STRING' },
    summary: { type: 'STRING' },
    characters: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          role: { type: 'STRING', enum: ['guide', 'playful', 'serious', 'narrator'] },
          personality: { type: 'STRING' },
          avatarEmoji: { type: 'STRING' },
          voicePitch: { type: 'NUMBER' },
        },
        required: ['name', 'role', 'personality', 'avatarEmoji', 'voicePitch'],
      },
    },
    openingNarrative: { type: 'STRING' },
    openingDialogues: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          speakerRole: { type: 'STRING', enum: ['guide', 'playful', 'serious', 'narrator'] },
          speakerName: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['speakerRole', 'speakerName', 'content'],
      },
    },
    actionChips: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: [
    'title',
    'theme',
    'setting',
    'summary',
    'characters',
    'openingNarrative',
    'openingDialogues',
    'actionChips',
  ],
};

const ADVENTURE_TURN_SCHEMA = {
  type: 'OBJECT',
  properties: {
    corrections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          errorType: { type: 'STRING' },
          original: { type: 'STRING' },
          corrected: { type: 'STRING' },
          explanation: { type: 'STRING' },
        },
        required: ['errorType', 'original', 'corrected', 'explanation'],
      },
    },
    replies: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          speakerRole: { type: 'STRING', enum: ['guide', 'playful', 'serious', 'narrator'] },
          speakerName: { type: 'STRING' },
          content: { type: 'STRING' },
        },
        required: ['speakerRole', 'speakerName', 'content'],
      },
    },
    newSummary: { type: 'STRING' },
    actionChips: {
      type: 'ARRAY',
      items: { type: 'STRING' },
    },
  },
  required: ['corrections', 'replies', 'newSummary', 'actionChips'],
};

export interface GeneratedAdventureWorld {
  title: string;
  theme: string;
  setting: string;
  summary: string;
  characters: Array<{
    name: string;
    role: 'guide' | 'playful' | 'serious' | 'narrator';
    personality: string;
    avatar_emoji: string;
    voice_pitch: number;
  }>;
  initialTurns: Array<{
    speaker_role: AdventureRole;
    speaker_name: string;
    content: string;
    action_chips?: string[];
  }>;
}

export interface GeneratedAdventureTurn {
  corrections: DetectedCorrection[];
  replies: Array<{
    speaker_role: AdventureRole;
    speaker_name: string;
    content: string;
    action_chips?: string[];
  }>;
  newSummary: string;
  actionChips: string[];
}

interface GeminiPart {
  text?: unknown;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

/** One mistake the tutor found, before it is persisted. */
export interface DetectedCorrection {
  errorType: string;
  original: string;
  corrected: string;
  explanation: string;
}

/** The tutor's reply plus any corrections it made to the learner's latest message. */
export interface TutorTurn {
  reply: string;
  corrections: DetectedCorrection[];
}

/** A saved phrase rendered in the other language, with a short usage note. */
export interface PhraseTranslation {
  sourceLanguage: string;
  translation: string;
  explanation: string;
}

export interface PartnerRecommendationParams {
  userName?: string;
  level?: string;
  interests?: string[];
  goals?: string[];
  tone?: string;
  customTopics?: string;
  commonErrors?: string[];
  recentTopics?: string[];
  chatMemories?: ChatMemorySnippet[];
}

export interface GeneratedPartnerRecommendation {
  category: 'topic' | 'roleplay' | 'challenge' | 'casual' | 'debate';
  title: string;
  description: string;
  starterPrompt: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  contextReason?: string;
}

/**
 * Carries a sanitized public message plus whether another attempt could plausibly succeed, so the
 * retry loop does not spend a second timeout window on a rejection that is already final.
 */
class GeminiRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

/** Calls Gemini's REST API for an English-tutor reply and the corrections behind it. */
export class GeminiService {
  /**
   * Generates a tutor reply and the corrections for the learner's most recent message.
   *
   * A transient stall or timeout is retried once. Without the retry a single slow response loses
   * the whole turn, which is costly here because the user's message is already persisted and the
   * only recovery is a manual retry from the UI.
   * @param messages Chronological chat history; only the latest 20 text messages are sent.
   * @returns The reply text and validated corrections, which may be empty.
   * @throws {Error} With a sanitized message when configuration, transport, or response data is invalid.
   */
  async generateTurn(messages: Message[]): Promise<TutorTurn> {
    const latestUserMessage = this.latestUserContent(messages);
    return this.withRetry(async () => {
      const text = await this.requestText({
        systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: messages.slice(-MAX_HISTORY_MESSAGES).map((message) => ({
          role: message.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: message.content }],
        })),
        generationConfig: {
          maxOutputTokens: 900,
          temperature: 0.7,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      });
      return this.parseTurn(text, latestUserMessage);
    });
  }

  /**
   * Translates a saved phrase and explains what makes the result work.
   *
   * The direction is detected rather than configured: a learner saves Spanish they want to say in
   * English, but also English they did not understand, and both are useful study material.
   * @param phrase Phrase text to translate.
   * @returns The detected source language, the translation, and a short usage note.
   * @throws {Error} With a sanitized message when configuration, transport, or response data is invalid.
   */
  async translatePhrase(phrase: string): Promise<PhraseTranslation> {
    const content = phrase.trim().slice(0, MAX_PHRASE_LENGTH);
    if (!content) throw new Error('Gemini received an empty phrase');

    return this.withRetry(async () => {
      const text = await this.requestText({
        systemInstruction: { parts: [{ text: TRANSLATION_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: content }] }],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.3,
          responseMimeType: 'application/json',
          responseSchema: TRANSLATION_SCHEMA,
        },
      });
      return this.parseTranslation(text);
    });
  }

  /**
   * Generates tailored conversation recommendations for the learner based on their partner preferences
   * and deeply informed by their previous chat history.
   */
  async generatePartnerRecommendations(
    params: PartnerRecommendationParams,
  ): Promise<GeneratedPartnerRecommendation[]> {
    let chatMemoryPromptSection = '';
    if (params.chatMemories && params.chatMemories.length > 0) {
      chatMemoryPromptSection = `\n--- LEARNER RECENT CHAT HISTORY (PRIMARY SOURCE FOR RECOMMENDATIONS) ---
Below are the learner's actual recent conversations, what they talked about, phrases they used, and errors they made:
${params.chatMemories
  .map((m, idx) => {
    const quotes = m.userSnippets.length
      ? `  - Learner said: "${m.userSnippets.slice(0, 4).join('" | "')}"`
      : '  - No user messages yet';
    const errs = m.errorTypes.length
      ? `  - Grammatical/vocabulary focus areas observed: ${m.errorTypes.join(', ')}`
      : '';
    const rating = m.satisfactionScore
      ? `  - User satisfaction rating: ${m.satisfactionScore}/5 stars`
      : '';
    const notes = m.feedbackNotes ? `  - User feedback notes: "${m.feedbackNotes}"` : '';
    return `Conversation #${idx + 1}: "${m.title}" (${new Date(m.startedAt).toLocaleDateString()})
${quotes}
${errs ? errs + '\n' : ''}${rating ? rating + '\n' : ''}${notes ? notes + '\n' : ''}`;
  })
  .join('\n')}
----------------------------------------------------------------------
IMPORTANT INSTRUCTIONS FOR USING CHAT HISTORY:
1. Prioritize these previous chats above all else! Build natural continuations, follow-ups, roleplays, or debates on the specific topics, hobbies, opinions, or anecdotes the learner shared.
2. If they struggled with certain grammar points (e.g. past tense, prepositions), create an engaging conversation or scenario that naturally gives them practice.
3. For each recommendation, provide "contextReason" (e.g., "Inspired by your chat about [Topic] 💬", "Follow-up to your story on [Story] 🚀", "Great for practicing [Grammar] in a fun context 🎯").\n`;
    }

    const prompt = `Learner Profile:
Name: ${params.userName || 'Learner'}
Level: ${params.level || 'intermediate'}
Interests: ${params.interests?.length ? params.interests.join(', ') : 'Everyday life, culture, technology, travel'}
Learning Goals: ${params.goals?.length ? params.goals.join(', ') : 'Fluency, natural conversation'}
Partner Conversational Tone: ${params.tone || 'friendly'}
Custom Topics/Notes: ${params.customTopics || 'None'}
${params.commonErrors?.length ? `Focus areas to practice gently: ${params.commonErrors.join(', ')}` : ''}
${params.recentTopics?.length ? `Recent topic titles: ${params.recentTopics.join(', ')}` : ''}
${chatMemoryPromptSection}
Generate 4 high-quality, deeply personalized conversation recommendations based primarily on the chat history above.`;

    return this.withRetry(async () => {
      const text = await this.requestText({
        systemInstruction: { parts: [{ text: RECOMMENDATIONS_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1400,
          temperature: 0.8,
          responseMimeType: 'application/json',
          responseSchema: RECOMMENDATIONS_SCHEMA,
        },
      });
      return this.parseRecommendations(text, params.level);
    });
  }

  /**
   * Generates a rich interactive Story Adventure world and initial party cast based on
   * user tastes, chat memories (e.g. League of Legends, Yasuo, Stoicism), and learning goals.
   */
  async generateAdventureWorld(params: {
    userName?: string;
    level: string;
    interests: string[];
    chatMemories: ChatMemorySnippet[];
    commonErrors?: string[];
  }): Promise<GeneratedAdventureWorld> {
    const memoryDetails = params.chatMemories.length
      ? params.chatMemories
          .map(
            (m) =>
              `- Chat "${m.title}": Learner said: "${m.userSnippets.slice(0, 5).join('", "')}"`,
          )
          .join('\n')
      : 'No previous chat messages';

    const systemInstruction = `You are a master RPG Storyteller, Dungeon Master, and English Language Guide.
Your mission is to create a deeply immersive, episodic text RPG adventure tailored specifically to the learner's personal tastes, favorite games, characters, philosophies, or topics discussed in their chats.

IF LEARNER DISCUSSED A SPECIFIC UNIVERSE OR THEME (e.g. League of Legends, Yasuo, swordsmen, stoicism, cyberpunk, sci-fi, detective mystery):
- Set the adventure firmly in that universe or inspired by that world (e.g., The wandering sacred wind lands of Ionia, ancient sword shrines, martial arts philosophy).
- Create a cast of 3 distinct companion characters who journey with the player:
  1. 'guide': A wise mentor or elder guide (e.g. Master, Sage, Spirit Guide) who knows the lore and encourages the player.
  2. 'playful': A cheerful, mischievous, quick-witted companion (e.g. Scout, Fox Spirit, Rookie Rogue) who loves banter.
  3. 'serious': A disciplined, stoic warrior or scholar (e.g. Veteran Swordsman, Guardian) who values honor and precision.
- Include an enticing opening narrative describing the start of their quest.
- Include opening dialogue where the companions speak to the player in character.
- Provide 3 engaging actionChips (starter choices / dialogue ideas in English).`;

    const prompt = `Learner Profile:
Name: ${params.userName || 'Adventurer'}
English Level: ${params.level || 'intermediate'}
Interests: ${params.interests.join(', ') || 'Fantasy, Gaming, Adventure'}
Recent Learner Chats:
${memoryDetails}
Focus Error Types: ${params.commonErrors?.join(', ') || 'General fluency'}

Create the personalized RPG adventure world and party now.`;

    return this.withRetry(async () => {
      const text = await this.requestText({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1800,
          temperature: 0.8,
          responseMimeType: 'application/json',
          responseSchema: ADVENTURE_WORLD_SCHEMA,
        },
      });
      return this.parseAdventureWorld(text);
    });
  }

  /**
   * Generates the next turn in the story adventure: companions respond in-character,
   * the narrative progresses, and pedagogical corrections are captured.
   */
  async generateAdventureTurn(params: {
    adventure: StoryAdventure;
    userMessage: string;
    userName?: string;
    level?: string;
  }): Promise<GeneratedAdventureTurn> {
    const charsDesc = params.adventure.characters
      .map((c) => `- ${c.name} (${c.role}): ${c.personality}`)
      .join('\n');

    const historyDesc = params.adventure.turns
      .slice(-10)
      .map((t) => `${t.speaker_name} (${t.speaker_role}): "${t.content}"`)
      .join('\n');

    const systemInstruction = `You are running an interactive multi-agent English learning RPG adventure.
Setting: ${params.adventure.setting}
Current Quest Summary: ${params.adventure.summary}

Companions in the Party:
${charsDesc}

MANDATORY RULES:
1. Examine the user's latest message in English:
   - Identify any real grammatical, tense, or vocabulary mistakes. Provide friendly, accurate corrections. If none, return empty array [].
2. Generate 2 to 3 natural, in-character replies from the companions and/or narrator advancing the story:
   - Companions should react directly to what the user said or did.
   - Companions can playfully banter with each other.
   - The Narrator or Guide should present the next immediate situation or choice.
3. Update "newSummary" to reflect the latest state of the quest.
4. Generate 3 exciting "actionChips" (suggested dialogue / actions in English for the player).`;

    const prompt = `Recent Adventure Log:
${historyDesc}

Player "${params.userName || 'Player'}" says:
"${params.userMessage}"

Generate the character replies, narrative progression, corrections, and next action chips now.`;

    return this.withRetry(async () => {
      const text = await this.requestText({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1800,
          temperature: 0.8,
          responseMimeType: 'application/json',
          responseSchema: ADVENTURE_TURN_SCHEMA,
        },
      });
      return this.parseAdventureTurn(text, params.userMessage);
    });
  }

  private parseAdventureWorld(text: string): GeneratedAdventureWorld {
    const candidate = this.stripCodeFence(text);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      console.error('Failed to parse adventure world JSON from Gemini:', text);
      throw new GeminiRequestError('Gemini returned malformed adventure world', true);
    }

    const title = typeof parsed.title === 'string' ? parsed.title.trim() : 'The Wandering Quest';
    const theme = typeof parsed.theme === 'string' ? parsed.theme.trim() : 'Fantasy Adventure';
    const setting =
      typeof parsed.setting === 'string'
        ? parsed.setting.trim()
        : 'A mystical path through ancient lands.';
    const summary =
      typeof parsed.summary === 'string' ? parsed.summary.trim() : 'Your journey has just begun.';

    const characters: GeneratedAdventureWorld['characters'] = [];
    if (Array.isArray(parsed.characters)) {
      for (const c of parsed.characters) {
        if (!c || typeof c !== 'object') continue;
        const name = typeof c.name === 'string' ? c.name.trim() : 'Companion';
        const role = ['guide', 'playful', 'serious', 'narrator'].includes(c.role)
          ? c.role
          : 'guide';
        const personality = typeof c.personality === 'string' ? c.personality.trim() : 'Helpful';
        const avatar_emoji = typeof c.avatarEmoji === 'string' ? c.avatarEmoji.trim() : '🧙‍♂️';
        const voice_pitch = typeof c.voicePitch === 'number' ? c.voicePitch : 1.0;
        characters.push({ name, role, personality, avatar_emoji, voice_pitch });
      }
    }

    if (characters.length === 0) {
      characters.push(
        {
          name: 'Master Shen',
          role: 'guide',
          personality: 'Wise and patient mentor',
          avatar_emoji: '🧙‍♂️',
          voice_pitch: 0.9,
        },
        {
          name: 'Kiko',
          role: 'playful',
          personality: 'Mischievous and energetic fox scout',
          avatar_emoji: '🦊',
          voice_pitch: 1.2,
        },
        {
          name: 'Kaelen',
          role: 'serious',
          personality: 'Stoic, disciplined swordsman',
          avatar_emoji: '⚔️',
          voice_pitch: 0.8,
        },
      );
    }

    const initialTurns: GeneratedAdventureWorld['initialTurns'] = [];
    if (typeof parsed.openingNarrative === 'string' && parsed.openingNarrative.trim()) {
      initialTurns.push({
        speaker_role: 'narrator',
        speaker_name: 'Narrator',
        content: parsed.openingNarrative.trim(),
      });
    }

    if (Array.isArray(parsed.openingDialogues)) {
      for (const d of parsed.openingDialogues) {
        if (!d || typeof d !== 'object') continue;
        const speaker_name = typeof d.speakerName === 'string' ? d.speakerName.trim() : 'Companion';
        const speaker_role = ['guide', 'playful', 'serious', 'narrator'].includes(d.speakerRole)
          ? d.speakerRole
          : 'guide';
        const content = typeof d.content === 'string' ? d.content.trim() : '';
        if (content) {
          initialTurns.push({ speaker_role, speaker_name, content });
        }
      }
    }

    const action_chips = Array.isArray(parsed.actionChips)
      ? parsed.actionChips.filter(
          (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0,
        )
      : [
          '"I am ready to walk this path."',
          '"Tell me more about what lies ahead."',
          '"Let us check our weapons and proceed."',
        ];

    const lastTurn = initialTurns[initialTurns.length - 1];
    if (lastTurn) {
      lastTurn.action_chips = action_chips;
    }

    return { title, theme, setting, summary, characters, initialTurns };
  }

  private parseAdventureTurn(text: string, latestUserMessage: string): GeneratedAdventureTurn {
    const candidate = this.stripCodeFence(text);
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      console.error('Failed to parse adventure turn JSON from Gemini:', text);
      throw new GeminiRequestError('Gemini returned malformed adventure turn', true);
    }

    const corrections = this.validCorrections(parsed.corrections, latestUserMessage);
    const newSummary = typeof parsed.newSummary === 'string' ? parsed.newSummary.trim() : '';
    const actionChips = Array.isArray(parsed.actionChips)
      ? parsed.actionChips.filter(
          (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0,
        )
      : [
          '"What should our next step be?"',
          '"I will keep my focus calm and steady."',
          '"Lead the way."',
        ];

    const replies: GeneratedAdventureTurn['replies'] = [];
    if (Array.isArray(parsed.replies)) {
      for (const r of parsed.replies) {
        if (!r || typeof r !== 'object') continue;
        const speaker_name = typeof r.speakerName === 'string' ? r.speakerName.trim() : 'Companion';
        const speaker_role = ['guide', 'playful', 'serious', 'narrator'].includes(r.speakerRole)
          ? r.speakerRole
          : 'guide';
        const content = typeof r.content === 'string' ? r.content.trim() : '';
        if (content) {
          replies.push({ speaker_role, speaker_name, content });
        }
      }
    }

    if (replies.length === 0) {
      replies.push({
        speaker_role: 'guide',
        speaker_name: 'Guide',
        content: 'Your determination is admirable. Let us continue our journey forward.',
      });
    }

    const lastReply = replies[replies.length - 1];
    if (lastReply) {
      lastReply.action_chips = actionChips;
    }

    return { corrections, replies, newSummary, actionChips };
  }

  /**
   * Runs one Gemini operation, retrying once when the failure could plausibly succeed again.
   *
   * Without the retry a single slow response loses the whole operation, which is costly for a chat
   * turn because the user's message is already persisted and the only recovery is a manual retry.
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastMessage = 'Gemini request failed';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : 'Gemini request failed';
        const retryable = error instanceof GeminiRequestError ? error.retryable : true;
        if (!retryable || attempt === MAX_ATTEMPTS) break;
        console.warn(`Gemini attempt ${attempt} failed (${lastMessage}); retrying once.`);
      }
    }

    throw new Error(lastMessage);
  }

  /** Posts one request and returns the concatenated text of the first candidate. */
  private async requestText(body: Record<string, unknown>): Promise<string> {
    const apiKey = process.env['GEMINI_API_KEY']?.trim();
    const model = process.env['GEMINI_MODEL']?.trim() || DEFAULT_MODEL;
    if (!apiKey) throw new GeminiRequestError('Gemini is not configured', false);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      if (!response.ok) {
        // Logged locally because the public message stays sanitized; the status is what makes a
        // bad key, an unknown model, or a rate limit distinguishable during troubleshooting.
        console.error(`Gemini responded with status ${response.status}.`);
        const retryable = response.status === 429 || response.status >= 500;
        throw new GeminiRequestError('Gemini request failed', retryable);
      }

      const payload = (await response.json()) as GeminiResponse;
      const text = payload.candidates?.[0]?.content?.parts
        ?.map((part) => (typeof part.text === 'string' ? part.text : ''))
        .join('')
        .trim();
      if (!text) throw new GeminiRequestError('Gemini returned no usable response', true);
      return text;
    } catch (error) {
      if (error instanceof GeminiRequestError) throw error;
      if (error instanceof Error && error.name === 'AbortError')
        throw new GeminiRequestError('Gemini request timed out', true);
      throw new GeminiRequestError('Gemini request failed', true);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Validates a translation response, which unlike a chat turn has no usable prose fallback. */
  private parseTranslation(text: string): PhraseTranslation {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stripCodeFence(text));
    } catch {
      console.error('Gemini returned malformed JSON for a phrase translation.');
      throw new GeminiRequestError('Gemini returned no usable response', true);
    }
    if (typeof parsed !== 'object' || parsed === null)
      throw new GeminiRequestError('Gemini returned no usable response', true);

    const record = parsed as Record<string, unknown>;
    const translation =
      typeof record['translation'] === 'string' ? record['translation'].trim() : '';
    const explanation =
      typeof record['explanation'] === 'string' ? record['explanation'].trim() : '';
    if (!translation) throw new GeminiRequestError('Gemini returned no usable response', true);

    const sourceLanguage =
      typeof record['sourceLanguage'] === 'string' ? record['sourceLanguage'].trim() : '';
    return {
      sourceLanguage: sourceLanguage.slice(0, MAX_LANGUAGE_NAME_LENGTH) || 'Unknown',
      translation,
      explanation,
    };
  }

  /** Validates recommendations generated for the partner section. */
  private parseRecommendations(
    text: string,
    defaultLevel?: string,
  ): GeneratedPartnerRecommendation[] {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.stripCodeFence(text));
    } catch {
      console.error('Gemini returned malformed JSON for recommendations.');
      throw new GeminiRequestError('Gemini returned no usable response', true);
    }
    if (typeof parsed !== 'object' || parsed === null)
      throw new GeminiRequestError('Gemini returned no usable response', true);

    const record = parsed as { recommendations?: unknown };
    if (!Array.isArray(record.recommendations)) {
      throw new GeminiRequestError('Gemini returned invalid recommendations array', true);
    }

    const validCategories = new Set(['topic', 'roleplay', 'challenge', 'casual', 'debate']);
    const validDifficulties = new Set(['beginner', 'intermediate', 'advanced']);
    const fallbackDiff = (
      defaultLevel && validDifficulties.has(defaultLevel) ? defaultLevel : 'intermediate'
    ) as 'beginner' | 'intermediate' | 'advanced';

    const results: GeneratedPartnerRecommendation[] = [];
    for (const item of record.recommendations) {
      if (typeof item !== 'object' || item === null) continue;
      const rec = item as Record<string, unknown>;
      const title = typeof rec['title'] === 'string' ? rec['title'].trim() : '';
      const description = typeof rec['description'] === 'string' ? rec['description'].trim() : '';
      const starterPrompt =
        typeof rec['starterPrompt'] === 'string' ? rec['starterPrompt'].trim() : '';
      if (!title || !description || !starterPrompt) continue;

      const rawCat =
        typeof rec['category'] === 'string' ? rec['category'].trim().toLowerCase() : '';
      const category = (validCategories.has(rawCat) ? rawCat : 'topic') as
        | 'topic'
        | 'roleplay'
        | 'challenge'
        | 'casual'
        | 'debate';

      const rawDiff =
        typeof rec['difficulty'] === 'string' ? rec['difficulty'].trim().toLowerCase() : '';
      const difficulty = (validDifficulties.has(rawDiff) ? rawDiff : fallbackDiff) as
        | 'beginner'
        | 'intermediate'
        | 'advanced';

      const contextReason =
        typeof rec['contextReason'] === 'string' && rec['contextReason'].trim().length > 0
          ? rec['contextReason'].trim().slice(0, 150)
          : undefined;

      results.push({
        title,
        description,
        starterPrompt,
        contextReason,
        category,
        difficulty,
      });
    }

    if (results.length === 0) {
      throw new GeminiRequestError('No valid recommendations parsed from Gemini response', true);
    }
    return results;
  }

  /**
   * Turns the model's raw output into a validated turn.
   *
   * Corrections are a secondary feature, so malformed structure must never cost the learner their
   * reply: prose that is not JSON at all is used verbatim as the reply with no corrections, and
   * only output that looks like broken JSON is treated as retryable.
   */
  private parseTurn(text: string, latestUserMessage: string): TutorTurn {
    const candidate = this.stripCodeFence(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      if (!candidate.includes('{')) return { reply: candidate, corrections: [] };
      console.error('Gemini returned malformed JSON for a tutor turn.');
      throw new GeminiRequestError('Gemini returned no usable response', true);
    }

    if (typeof parsed !== 'object' || parsed === null)
      throw new GeminiRequestError('Gemini returned no usable response', true);

    const record = parsed as { reply?: unknown; corrections?: unknown };
    const reply = typeof record.reply === 'string' ? record.reply.trim() : '';
    if (!reply) throw new GeminiRequestError('Gemini returned no usable response', true);

    return { reply, corrections: this.validCorrections(record.corrections, latestUserMessage) };
  }

  /**
   * Keeps only corrections that verifiably describe the learner's own words.
   *
   * Requiring `original` to appear in the message is the guard against a confident model inventing
   * a mistake, which matters because these rows become the learner's study material.
   */
  private validCorrections(value: unknown, latestUserMessage: string): DetectedCorrection[] {
    if (!Array.isArray(value)) return [];
    const haystack = this.normalize(latestUserMessage);
    const accepted: DetectedCorrection[] = [];
    const seen = new Set<string>();

    for (const entry of value) {
      if (accepted.length >= MAX_CORRECTIONS_PER_TURN) break;
      if (typeof entry !== 'object' || entry === null) continue;
      const record = entry as Partial<Record<keyof DetectedCorrection, unknown>>;
      const original = typeof record.original === 'string' ? record.original.trim() : '';
      const corrected = typeof record.corrected === 'string' ? record.corrected.trim() : '';
      const explanation = typeof record.explanation === 'string' ? record.explanation.trim() : '';
      if (!original || !corrected || !explanation) continue;
      if (this.normalize(original) === this.normalize(corrected)) continue;
      if (!haystack.includes(this.normalize(original))) {
        console.warn('Discarding a Gemini correction whose original text is not in the message.');
        continue;
      }

      const key = `${this.normalize(original)}=>${this.normalize(corrected)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      accepted.push({
        errorType: this.validErrorType(record.errorType),
        original,
        corrected,
        explanation,
      });
    }

    return accepted;
  }

  private validErrorType(value: unknown): string {
    const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if (!candidate) return 'other';
    const known = ERROR_TYPES.find((errorType) => errorType === candidate);
    return known ?? candidate.slice(0, MAX_ERROR_TYPE_LENGTH);
  }

  private latestUserContent(messages: Message[]): string {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'user') return message.content;
    }
    return '';
  }

  /** Comparison form that ignores case and whitespace noise without touching what gets stored. */
  private normalize(value: string): string {
    return value.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  /** Tolerates a fenced ```json block, which models still emit despite a JSON response type. */
  private stripCodeFence(text: string): string {
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/u.exec(text.trim());
    return fenced?.[1]?.trim() ?? text.trim();
  }
}

export const geminiService = new GeminiService();
