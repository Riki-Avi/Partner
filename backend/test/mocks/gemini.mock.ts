import type {
  DetectedCorrection,
  GeneratedPartnerRecommendation,
  PhraseTranslation,
  TutorTurn,
} from '../../src/services/gemini.service.js';

export function createMockGeminiService() {
  return {
    async generateTurn(_messages: any[]): Promise<TutorTurn> {
      const corrections: DetectedCorrection[] = [
        {
          errorType: 'grammar',
          original: 'She go',
          corrected: 'She goes',
          explanation: 'Use third-person singular -s with she/he/it.',
        },
      ];
      return {
        reply: 'That sounds really interesting! Tell me more about what happened next.',
        corrections,
      };
    },

    async translatePhrase(phrase: string): Promise<PhraseTranslation> {
      return {
        sourceLanguage: 'Spanish',
        translation: `Translated: ${phrase}`,
        explanation: 'Natural expression used in conversational English.',
      };
    },

    async generatePartnerRecommendations(_params: any): Promise<GeneratedPartnerRecommendation[]> {
      return [
        {
          category: 'topic',
          title: 'Favorite Sci-Fi Movies & Series',
          description: 'Explore mind-bending plots and memorable cinematic universes.',
          starterPrompt: 'Hey! What is your all-time favorite sci-fi movie and why?',
          difficulty: 'intermediate',
          contextReason: 'Inspired by your chat about cinema 🎬',
        },
        {
          category: 'roleplay',
          title: 'Booking a Boutique Hotel in London',
          description: 'Practice natural traveler phrases and asking for local tips.',
          starterPrompt:
            'Good afternoon! Welcome to The Bloomsbury. Do you have a reservation with us?',
          difficulty: 'beginner',
          contextReason: 'Practical travel roleplay 🏨',
        },
        {
          category: 'challenge',
          title: '3-Minute Storytelling Drill',
          description: 'Practice fluency and quick thinking with a fun survival prompt.',
          starterPrompt: 'If you could only keep 3 apps on your phone, which would you pick?',
          difficulty: 'intermediate',
          contextReason: 'Targeted fluency challenge 🚀',
        },
        {
          category: 'debate',
          title: 'Remote Work vs Office Life',
          description: 'Exchange viewpoints on productivity and workplace freedom.',
          starterPrompt: 'Do you prefer working from home or in an office environment?',
          difficulty: 'advanced',
          contextReason: 'Engaging lifestyle debate 💡',
        },
      ];
    },
  };
}
