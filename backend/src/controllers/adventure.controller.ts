import type { NextFunction, Response } from 'express';
import type { AuthenticatedRequest } from '../middleware/auth.middleware.js';
import {
  UnauthorizedError,
  ValidationError,
} from '../middleware/error.middleware.js';
import { databaseService } from '../services/database.service.js';
import { geminiService } from '../services/gemini.service.js';
import type { ChatMemorySnippet, StoryAdventure } from '@voice-chat/shared';

function requestBody(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ValidationError('Request body must be an object');
  return value as Record<string, unknown>;
}

export class AdventureController {
  async getCurrent(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      let adventure = await databaseService.getActiveAdventure(req.userId);

      if (!adventure) {
        adventure = await this.generateNewAdventure(req.userId);
      }

      res.json({ success: true, data: adventure });
    } catch (error) {
      next(error);
    }
  }

  async sendTurn(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const body = requestBody(req.body);
      const rawMessage = typeof body['message'] === 'string' ? body['message'].trim() : '';
      if (!rawMessage) throw new ValidationError('Message content is required');

      let adventure = await databaseService.getActiveAdventure(req.userId);
      if (!adventure) {
        adventure = await this.generateNewAdventure(req.userId);
      }

      const user = await databaseService.getUser(req.userId);

      const generated = await geminiService.generateAdventureTurn({
        adventure,
        userMessage: rawMessage,
        userName: user?.name,
        level: user?.level,
      });

      const userTurn = {
        speaker_role: 'user' as const,
        speaker_name: user?.name || 'You',
        content: rawMessage,
        corrections: generated.corrections.map((c) => ({
          original: c.original,
          corrected: c.corrected,
          explanation: c.explanation,
          error_type: c.errorType,
        })),
        action_chips: [],
      };

      const characterReplies = generated.replies.map((r) => ({
        speaker_role: r.speaker_role,
        speaker_name: r.speaker_name,
        content: r.content,
        corrections: [],
        action_chips: r.action_chips ?? [],
      }));

      const response = await databaseService.addAdventureUserTurnAndReplies(
        adventure.id,
        req.userId,
        {
          userTurn,
          characterReplies,
          newSummary: generated.newSummary,
        },
      );

      res.json({ success: true, data: response });
    } catch (error) {
      next(error);
    }
  }

  async resetAdventure(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.userId) throw new UnauthorizedError('Authentication required');
      const adventure = await this.generateNewAdventure(req.userId);
      res.json({ success: true, data: adventure });
    } catch (error) {
      next(error);
    }
  }

  private async generateNewAdventure(userId: string): Promise<StoryAdventure> {
    const [user, preferences, chatMemories, correctionStats] = await Promise.all([
      databaseService.getUser(userId),
      databaseService.getUserPreferences(userId),
      databaseService.getRecentChatMemoriesForPartner(userId, 5),
      databaseService.getOwnedCorrectionStats(userId),
    ]);

    const errorNames = correctionStats.byErrorType.map((e) => e.error_type);

    let world;
    try {
      world = await geminiService.generateAdventureWorld({
        userName: user?.name,
        level: user?.level ?? 'intermediate',
        interests: preferences.interests,
        chatMemories,
        commonErrors: errorNames,
      });
    } catch (err) {
      console.warn('Gemini adventure generation failed, using fallback world:', err);
      world = this.getFallbackAdventureWorld(user?.name, chatMemories);
    }

    return databaseService.createAdventure(userId, {
      title: world.title,
      theme: world.theme,
      setting: world.setting,
      summary: world.summary,
      characters: world.characters,
      initialTurns: world.initialTurns,
    });
  }

  private getFallbackAdventureWorld(
    userName?: string,
    chatMemories: ChatMemorySnippet[] = [],
  ) {
    const hasLoL = chatMemories.some((m) =>
      m.userSnippets?.some((s: string) => /league|yasuo|stoic|sword/i.test(s)),
    );

    if (hasLoL) {
      return {
        title: 'The Wandering Blade of Ionia',
        theme: 'Swordsmanship & Stoic Philosophy',
        setting: 'The wind-swept hills and cherry blossom paths of the sacred lands of Ionia.',
        summary:
          'You and your companions journey along the ancient shrine road to test your sword and resolve.',
        characters: [
          {
            name: 'Master Shen',
            role: 'guide' as const,
            personality: 'Calm and enlightened mentor who values inner peace and precise words.',
            avatar_emoji: '🧙‍♂️',
            voice_pitch: 0.9,
          },
          {
            name: 'Kiko',
            role: 'playful' as const,
            personality:
              'Energetic and playful fox-spirit scout who loves teasing and adventurous detours.',
            avatar_emoji: '🦊',
            voice_pitch: 1.2,
          },
          {
            name: 'Kaelen',
            role: 'serious' as const,
            personality:
              'Disciplined wandering swordsman who seeks focus and mastery of the blade.',
            avatar_emoji: '⚔️',
            voice_pitch: 0.8,
          },
        ],
        initialTurns: [
          {
            speaker_role: 'narrator' as const,
            speaker_name: 'Narrator',
            content:
              'The wind whispers through the ancient bamboo forest of Ionia. Ahead lies the Whispering Shrine, shrouded in morning mist.',
          },
          {
            speaker_role: 'guide' as const,
            speaker_name: 'Master Shen',
            content: `Welcome, ${userName || 'swordsman'}. To master the sword, one must first master the mind. What path shall we take today?`,
          },
          {
            speaker_role: 'playful' as const,
            speaker_name: 'Kiko',
            content:
              'Come on! I smell adventure—and maybe some sweet roasted chestnuts at the next village!',
          },
          {
            speaker_role: 'serious' as const,
            speaker_name: 'Kaelen',
            content:
              'Stay vigilant. A true warrior remains stoic in every storm. What is your command?',
            action_chips: [
              '"I choose the mountain shrine trail."',
              '"Let us speak with the villagers first."',
              '"I am ready to sharpen our focus and train."',
            ],
          },
        ],
      };
    }

    return {
      title: 'The Great Journey Beyond the Horizon',
      theme: 'Exploration & Discovery',
      setting: 'A bustling port town opening up to uncharted frontiers.',
      summary: 'Your party prepares to set out on a grand expedition across unknown lands.',
      characters: [
        {
          name: 'Captain Rowan',
          role: 'guide' as const,
          personality: 'Experienced navigator who knows every map and encourages confidence.',
          avatar_emoji: '🧭',
          voice_pitch: 0.9,
        },
        {
          name: 'Ellie',
          role: 'playful' as const,
          personality: 'Bubbly, curious explorer who loves finding hidden treasures and jokes.',
          avatar_emoji: '🎒',
          voice_pitch: 1.2,
        },
        {
          name: 'Vance',
          role: 'serious' as const,
          personality: 'Calculated, pragmatic guardian who keeps the team safe and prepared.',
          avatar_emoji: '🛡️',
          voice_pitch: 0.8,
        },
      ],
      initialTurns: [
        {
          speaker_role: 'narrator' as const,
          speaker_name: 'Narrator',
          content:
            'The morning bell rings across the sunlit harbor as your expedition prepares to depart.',
        },
        {
          speaker_role: 'guide' as const,
          speaker_name: 'Captain Rowan',
          content: `Glad to have you with us, ${userName || 'adventurer'}! The open seas await. Are your supplies ready?`,
        },
        {
          speaker_role: 'playful' as const,
          speaker_name: 'Ellie',
          content:
            'I packed three maps and enough snacks for a month! Where are we exploring first?',
        },
        {
          speaker_role: 'serious' as const,
          speaker_name: 'Vance',
          content:
            'Keep your wits sharp. Every new frontier requires discipline. How shall we begin?',
          action_chips: [
            '"Let us set sail toward the mysterious islands."',
            '"I want to review our map and strategy first."',
            '"I am ready for whatever challenge awaits us."',
          ],
        },
      ],
    };
  }
}

export const adventureController = new AdventureController();
