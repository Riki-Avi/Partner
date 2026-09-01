import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import { UnauthorizedError, ValidationError } from '../middleware/error.middleware.js';
import { databaseService } from '../services/database.service.js';
import { geminiService } from '../services/gemini.service.js';
import type { ChatMemorySnippet, PartnerRecommendation, PartnerTone } from '@voice-chat/shared';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TONES: PartnerTone[] = [
  'friendly',
  'casual',
  'intellectual',
  'supportive',
  'professional',
];

function requestBody(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError('Request body must be an object');
  return value as Record<string, unknown>;
}

function singleParam(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return '';
}

function getFallbackRecommendations(
  interests: string[] = [],
  level = 'intermediate',
  chatMemories: ChatMemorySnippet[] = [],
): Array<Omit<PartnerRecommendation, 'id' | 'user_id' | 'created_at' | 'is_favorite'>> {
  const diff = (
    ['beginner', 'intermediate', 'advanced'].includes(level) ? level : 'intermediate'
  ) as 'beginner' | 'intermediate' | 'advanced';

  const hasMovies = interests.some((i) => /movie|cinema|series|film/i.test(i));
  const hasTech = interests.some((i) => /tech|ai|gaming|game|code|science/i.test(i));
  const hasTravel = interests.some((i) => /travel|adventure|nature|country/i.test(i));
  const hasFood = interests.some((i) => /food|cook|baking|cuisine/i.test(i));
  const hasMusic = interests.some((i) => /music|song|concert|band/i.test(i));
  const hasSports = interests.some((i) => /sport|fitness|gym|workout|football/i.test(i));

  const recentChat = chatMemories[0];

  const recs: Array<Omit<PartnerRecommendation, 'id' | 'user_id' | 'created_at' | 'is_favorite'>> =
    [];

  // Card 1: Main Interest or Chat Sequel Topic
  if (recentChat && recentChat.title && recentChat.userSnippets.length > 0) {
    recs.push({
      category: 'topic',
      title: `Continuing our chat: ${recentChat.title}`,
      description: `We had a great chat about ${recentChat.title.toLowerCase()}. Let’s dive deeper and explore new perspectives together.`,
      starter_prompt: `Hey! I was thinking about our conversation on "${recentChat.title}". You mentioned some great points! What else would you like to explore on this topic?`,
      difficulty: diff,
      context_reason: `Inspired by your chat about "${recentChat.title}" 💬`,
    });
  } else if (hasMovies) {
    recs.push({
      category: 'topic',
      title: 'Debating your all-time favorite movies and series',
      description: 'Discuss plot twists, memorable characters, and stories that blew your mind.',
      starter_prompt:
        'Hey! I would love to know: what is a movie or series you watched recently that really stayed with you, and why?',
      difficulty: diff,
      context_reason: 'Based on your interest in Movies & Cinema 🎬',
    });
  } else if (hasTech) {
    recs.push({
      category: 'topic',
      title: 'AI, Gadgets and Future Tech in Daily Life',
      description: 'Explore how new technology and tools are transforming how we work and play.',
      starter_prompt:
        'Technology is moving fast! What is one tech tool or app that has completely changed how you organize your day?',
      difficulty: diff,
      context_reason: 'Based on your interest in Technology & AI 🤖',
    });
  } else if (hasMusic) {
    recs.push({
      category: 'topic',
      title: 'Soundtracks of our lives: Favorite artists & concerts',
      description: 'Talk about genres, live music experiences, and songs that change your mood.',
      starter_prompt:
        'Music is such a great universal language! If you could attend a concert by any artist in history, who would you choose?',
      difficulty: diff,
      context_reason: 'Based on your interest in Music 🎵',
    });
  } else if (hasTravel) {
    recs.push({
      category: 'topic',
      title: 'Unforgettable Journeys & Dream Destinations',
      description: 'Share stories from past trips and describe the top place on your bucket list.',
      starter_prompt:
        'I love travel stories! What has been your most memorable trip so far, or what is the number one destination you want to visit next?',
      difficulty: diff,
      context_reason: 'Based on your interest in Travel ✈️',
    });
  } else {
    recs.push({
      category: 'topic',
      title: 'Passions, hobbies and weekend routines',
      description: 'Share stories about what you genuinely enjoy doing when you have free time.',
      starter_prompt:
        'Hi there! When you have completely free time on a weekend, what is your favorite thing to do to recharge?',
      difficulty: diff,
      context_reason: 'Tailored to get to know your favorite hobbies 😊',
    });
  }

  // Card 2: Roleplay
  if (hasFood) {
    recs.push({
      category: 'roleplay',
      title: 'Ordering at a cozy international bistro',
      description: 'Practice asking for specials, dietary preferences, and chatting with the chef.',
      starter_prompt:
        'Good evening and welcome to The Olive Branch! Can I start you off with something refreshing to drink while you look over the menu?',
      difficulty: 'beginner',
      context_reason: 'Interactive dining roleplay 🍽️',
    });
  } else {
    recs.push({
      category: 'roleplay',
      title: 'Checking in at a boutique hotel in London',
      description:
        'Practice natural traveler English, asking for local tips and neighborhood recommendations.',
      starter_prompt:
        'Hello and welcome to The Bloomsbury Hotel! Are you checking in today? May I have your name and reservation details, please?',
      difficulty: 'beginner',
      context_reason: 'Travel & hospitality practice 🏨',
    });
  }

  // Card 3: Challenge (or Grammar Focus from errorTypes)
  const errorPoint = recentChat?.errorTypes?.[0];
  if (errorPoint) {
    recs.push({
      category: 'challenge',
      title: `Fluency Challenge: Mastering ${errorPoint} in action`,
      description: `A fun scenario designed to build muscle memory and confidence with ${errorPoint}.`,
      starter_prompt: `Let's try a quick storytelling challenge! Tell me about something funny that happened to you recently in 3 sentences.`,
      difficulty: diff,
      context_reason: `Targeted practice for ${errorPoint} from recent chats 🎯`,
    });
  } else if (hasSports) {
    recs.push({
      category: 'challenge',
      title: 'Fitness & Mindset: 3 minutes storytelling',
      description: 'Describe a challenging goal you set for yourself and how you achieved it.',
      starter_prompt:
        'Here is today’s quick challenge: Tell me about a personal achievement or fitness goal you worked hard to reach!',
      difficulty: diff,
      context_reason: 'High-energy storytelling challenge 🏃',
    });
  } else {
    recs.push({
      category: 'challenge',
      title: '3-Minute Desert Island Survival Strategy',
      description:
        'A fun fluency drill: pick 3 items to take to a deserted island and explain your logic.',
      starter_prompt:
        'Here is today’s creative challenge: If you were stranded on a peaceful desert island for a month, which three items would you bring along and why?',
      difficulty: diff,
      context_reason: 'Creative fluency drill 🏝️',
    });
  }

  // Card 4: Friendly Debate
  recs.push({
    category: 'debate',
    title: 'Remote work freedom vs In-person energy',
    description:
      'Exchange perspectives on productivity, office culture, and finding the sweet spot.',
    starter_prompt:
      'Do you feel people are more creative and productive working from home, or collaborating together in person? I’d love to hear your take!',
    difficulty: 'intermediate',
    context_reason: 'Popular debate topic on modern lifestyle 💡',
  });

  return recs;
}

export class PartnerController {
  async getSummary(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      let summary = await databaseService.getPartnerHubSummary(req.userId);

      const [user, chatMemories] = await Promise.all([
        databaseService.getUser(req.userId),
        databaseService.getRecentChatMemoriesForPartner(req.userId, 5),
      ]);

      const hasRecentChats = chatMemories.some((m) => m.userSnippets.length > 0);
      const latestRecDate = summary.recommendations[0]?.created_at
        ? new Date(summary.recommendations[0].created_at).getTime()
        : 0;
      const latestChatDate = chatMemories[0]?.startedAt
        ? new Date(chatMemories[0].startedAt).getTime()
        : 0;

      const shouldRegenerate =
        summary.recommendations.length === 0 || (hasRecentChats && latestChatDate > latestRecDate);

      if (shouldRegenerate) {
        let items: Array<
          Omit<PartnerRecommendation, 'id' | 'user_id' | 'created_at' | 'is_favorite'>
        >;
        try {
          const generated = await geminiService.generatePartnerRecommendations({
            userName: user?.name,
            level: user?.level ?? 'intermediate',
            interests: summary.preferences.interests,
            goals: summary.preferences.goals,
            tone: summary.preferences.tone,
            customTopics: summary.preferences.custom_topics,
            chatMemories,
          });

          items = generated.map((g) => ({
            category: g.category,
            title: g.title,
            description: g.description,
            starter_prompt: g.starterPrompt,
            difficulty: g.difficulty,
            context_reason: g.contextReason || null,
          }));
        } catch (genErr) {
          console.warn('Gemini summary recs failed; using fallback:', genErr);
          items = getFallbackRecommendations(
            summary.preferences.interests,
            user?.level ?? 'intermediate',
            chatMemories,
          );
        }

        const saved = await databaseService.savePartnerRecommendations(req.userId, items);
        summary = { ...summary, recommendations: saved };
      }

      res.json({ success: true, data: summary });
    } catch (error) {
      next(error);
    }
  }

  async getPreferences(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const preferences = await databaseService.getUserPreferences(req.userId);
      res.json({ success: true, data: preferences });
    } catch (error) {
      next(error);
    }
  }

  async updatePreferences(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const body = requestBody(req.body);

      const interests = Array.isArray(body['interests'])
        ? (body['interests'] as unknown[])
            .filter((i): i is string => typeof i === 'string')
            .map((i) => i.trim().slice(0, 50))
            .slice(0, 20)
        : undefined;

      const goals = Array.isArray(body['goals'])
        ? (body['goals'] as unknown[])
            .filter((g): g is string => typeof g === 'string')
            .map((g) => g.trim().slice(0, 50))
            .slice(0, 10)
        : undefined;

      const rawTone =
        typeof body['tone'] === 'string' ? body['tone'].trim().toLowerCase() : undefined;
      const tone =
        rawTone && ALLOWED_TONES.includes(rawTone as PartnerTone)
          ? (rawTone as PartnerTone)
          : undefined;

      const customTopics =
        typeof body['custom_topics'] === 'string'
          ? body['custom_topics'].trim().slice(0, 500)
          : undefined;

      const updated = await databaseService.upsertUserPreferences(req.userId, {
        ...(interests !== undefined ? { interests } : {}),
        ...(goals !== undefined ? { goals } : {}),
        ...(tone !== undefined ? { tone } : {}),
        ...(customTopics !== undefined ? { custom_topics: customTopics } : {}),
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async getRecommendations(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      let recommendations = await databaseService.getPartnerRecommendations(req.userId);

      if (recommendations.length === 0) {
        const [preferences, user, chatMemories] = await Promise.all([
          databaseService.getUserPreferences(req.userId),
          databaseService.getUser(req.userId),
          databaseService.getRecentChatMemoriesForPartner(req.userId, 5),
        ]);

        const items = getFallbackRecommendations(
          preferences.interests,
          user?.level ?? 'intermediate',
          chatMemories,
        );

        recommendations = await databaseService.savePartnerRecommendations(req.userId, items);
      }

      res.json({ success: true, data: recommendations });
    } catch (error) {
      next(error);
    }
  }

  async refreshRecommendations(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const [preferences, recentFeedbacks, user, chatMemories] = await Promise.all([
        databaseService.getUserPreferences(req.userId),
        databaseService.getRecentFeedbacks(req.userId, 5),
        databaseService.getUser(req.userId),
        databaseService.getRecentChatMemoriesForPartner(req.userId, 5),
      ]);

      const recentTopics = recentFeedbacks
        .map((f) => f.conversation_title)
        .filter(Boolean) as string[];

      let items: Array<
        Omit<PartnerRecommendation, 'id' | 'user_id' | 'created_at' | 'is_favorite'>
      >;

      try {
        const generated = await geminiService.generatePartnerRecommendations({
          userName: user?.name,
          level: user?.level ?? 'intermediate',
          interests: preferences.interests,
          goals: preferences.goals,
          tone: preferences.tone,
          customTopics: preferences.custom_topics,
          recentTopics,
          chatMemories,
        });

        items = generated.map((g) => ({
          category: g.category,
          title: g.title,
          description: g.description,
          starter_prompt: g.starterPrompt,
          difficulty: g.difficulty,
          context_reason: g.contextReason || null,
        }));
      } catch (genErr) {
        console.warn('Gemini refresh failed or timed out; using tailored fallbacks:', genErr);
        items = getFallbackRecommendations(
          preferences.interests,
          user?.level ?? 'intermediate',
          chatMemories,
        );
      }

      const saved = await databaseService.savePartnerRecommendations(req.userId, items);
      res.json({ success: true, data: saved });
    } catch (error) {
      next(error);
    }
  }

  async toggleFavoriteRecommendation(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const recommendationId = singleParam(req.params['recommendationId']);
      if (!recommendationId || !UUID_PATTERN.test(recommendationId)) {
        throw new ValidationError('A valid recommendation identifier is required');
      }

      const updated = await databaseService.toggleFavoriteRecommendation(
        req.userId,
        recommendationId,
      );
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async saveFeedback(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const body = requestBody(req.body);

      const conversationId =
        typeof body['conversation_id'] === 'string' ? body['conversation_id'].trim() : '';
      if (!conversationId || !UUID_PATTERN.test(conversationId)) {
        throw new ValidationError('A valid conversation identifier is required');
      }

      const score = Number(body['satisfaction_score']);
      if (!Number.isInteger(score) || score < 1 || score > 5) {
        throw new ValidationError('Satisfaction score must be an integer between 1 and 5');
      }

      const tags = Array.isArray(body['tags'])
        ? (body['tags'] as unknown[])
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().slice(0, 50))
            .slice(0, 10)
        : [];

      const notes = typeof body['notes'] === 'string' ? body['notes'].trim().slice(0, 1000) : null;

      const saved = await databaseService.saveConversationFeedback(req.userId, conversationId, {
        satisfaction_score: score,
        tags,
        notes,
      });

      res.status(201).json({ success: true, data: saved });
    } catch (error) {
      next(error);
    }
  }

  async getConversationFeedback(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const conversationId = singleParam(req.params['conversationId']);
      if (!conversationId || !UUID_PATTERN.test(conversationId)) {
        throw new ValidationError('A valid conversation identifier is required');
      }

      const feedback = await databaseService.getConversationFeedback(req.userId, conversationId);
      res.json({ success: true, data: feedback });
    } catch (error) {
      next(error);
    }
  }
}

export const partnerController = new PartnerController();
