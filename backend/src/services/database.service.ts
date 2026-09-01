import type {
  AdventureCharacter,
  AdventureTurn,
  AdventureTurnResponse,
  ChatMemorySnippet,
  CommonError,
  Conversation,
  ConversationFeedback,
  Correction,
  CorrectionErrorTypeCount,
  CorrectionReviewItem,
  CorrectionStats,
  Message,
  MessageRole,
  PartnerHubSummary,
  PartnerRecommendation,
  PartnerSatisfactionStats,
  PhraseStats,
  SavedPhrase,
  StoryAdventure,
  User,
  UserLevel,
  UserPreferences,
  UserProgress,
} from '@voice-chat/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase.config.js';
import {
  ConversationEndedError,
  DatabaseError,
  NotFoundError,
} from '../middleware/error.middleware.js';

type UserChanges = Partial<Pick<User, 'name' | 'level'>>;
type ConversationChanges = Partial<
  Pick<Conversation, 'ended_at' | 'language' | 'duration_seconds'>
>;
type MessageChanges = Partial<Pick<Message, 'content' | 'audio_url' | 'has_corrections'>>;
type CorrectionChanges = Partial<
  Pick<Correction, 'error_type' | 'original' | 'corrected' | 'explanation'>
>;

/** Which slice of the study pile a review list should return. */
export type CorrectionReviewStatus = 'all' | 'pending' | 'mastered';

export interface CorrectionQuery {
  status?: CorrectionReviewStatus;
  errorType?: string;
  limit?: number;
  offset?: number;
}

export interface CorrectionReviewChanges {
  reviewed?: boolean;
  mastered?: boolean;
}

/** A correction to persist, before it has an identity. */
export interface NewCorrection {
  errorType: string;
  original: string;
  corrected: string;
  explanation: string;
}

const MAX_CORRECTION_PAGE_SIZE = 200;
const DEFAULT_CORRECTION_PAGE_SIZE = 50;

/**
 * Ceiling on rows scanned to build study statistics. PostgREST cannot group without a database
 * function, so the two smallest columns are aggregated in process; the cap keeps that bounded for
 * a learner who has accumulated a very long history.
 */
const CORRECTION_STATS_ROW_CAP = 5_000;

/** Which slice of the phrase notebook a list should return. */
export type PhraseStatus = 'all' | 'pending' | 'mastered' | 'untranslated';

export interface PhraseQuery {
  status?: PhraseStatus;
  limit?: number;
  offset?: number;
}

export interface PhraseReviewChanges {
  note?: string | null;
  reviewed?: boolean;
  mastered?: boolean;
}

export interface PhraseTranslationFields {
  sourceLanguage: string;
  translation: string;
  explanation: string;
}

/** Shape returned when a correction is selected with its message and conversation embedded. */
interface EmbeddedCorrectionRow extends Correction {
  messages?: {
    content?: unknown;
    conversation_id?: unknown;
    conversations?: { title?: unknown } | null;
  } | null;
}
type ProgressChanges = Partial<
  Pick<UserProgress, 'total_conversations' | 'total_time_minutes' | 'common_errors'>
>;

/** Typed CRUD facade for all application tables. */
export class DatabaseService {
  constructor(private readonly client: SupabaseClient = supabase) {}
  private unwrap<T>(data: T | null, error: { message: string } | null, entity: string): T {
    if (error) throw new DatabaseError(`${entity}: ${error.message}`);
    if (data === null) throw new NotFoundError(`${entity} not found`);
    return data;
  }

  /**
   * Creates the public profile associated with a Supabase Auth user.
   * @param id Supabase Auth user identifier.
   * @param email Unique email address for the profile.
   * @param name Display name for the profile.
   * @returns The newly persisted user.
   * @throws {DatabaseError} If insertion fails.
   * @throws {NotFoundError} If the database does not return the inserted row.
   */
  async createUser(id: string, email: string, name: string): Promise<User> {
    const result = await this.client.from('users').insert({ id, email, name }).select().single();
    return this.unwrap(result.data as User | null, result.error, 'User');
  }

  /**
   * Finds a user profile by identifier.
   * @param userId User identifier to query.
   * @returns The matching user, or `null` when no profile exists.
   * @throws {DatabaseError} If the query fails.
   */
  async getUser(userId: string): Promise<User | null> {
    const { data, error } = await this.client
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw new DatabaseError(`User: ${error.message}`);
    return data as User | null;
  }

  /**
   * Applies editable profile fields to a user.
   * @param userId User identifier to update.
   * @param changes Name or proficiency-level fields to persist.
   * @returns The updated user.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the user does not exist.
   */
  async updateUser(userId: string, changes: UserChanges): Promise<User> {
    const result = await this.client
      .from('users')
      .update(changes)
      .eq('id', userId)
      .select()
      .single();
    return this.unwrap(result.data as User | null, result.error, 'User');
  }

  /**
   * Changes a user's proficiency level.
   * @param userId User identifier to update.
   * @param level New supported proficiency level.
   * @returns The updated user.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the user does not exist.
   */
  async updateUserLevel(userId: string, level: UserLevel): Promise<User> {
    return this.updateUser(userId, { level });
  }

  /**
   * Deletes a user profile by identifier.
   * @param userId User identifier to delete.
   * @returns A promise that resolves when deletion completes.
   * @throws {DatabaseError} If deletion fails.
   * @throws {NotFoundError} If the user does not exist.
   */
  async deleteUser(userId: string): Promise<void> {
    await this.deleteById('users', userId, 'User');
  }

  /**
   * Starts a conversation for a user.
   * @param userId Owner of the conversation.
   * @param language Conversation language code; defaults to English.
   * @param title Human-readable conversation title.
   * @returns The newly persisted conversation.
   * @throws {DatabaseError} If insertion fails.
   * @throws {NotFoundError} If the database does not return the inserted row.
   */
  async createConversation(
    userId: string,
    language = 'en',
    title = 'English practice',
  ): Promise<Conversation> {
    const r = await this.client
      .from('conversations')
      .insert({ user_id: userId, language, title })
      .select()
      .single();
    return this.unwrap(r.data as Conversation | null, r.error, 'Conversation');
  }

  /**
   * Finds a conversation by identifier.
   * @param id Conversation identifier to query.
   * @returns The matching conversation, or `null` when absent.
   * @throws {DatabaseError} If the query fails.
   */
  async getConversation(id: string): Promise<Conversation | null> {
    return this.getById<Conversation>('conversations', id);
  }

  /**
   * Finds a conversation only when it belongs to the supplied user.
   * @param id Conversation identifier to query.
   * @param userId Expected owner identifier.
   * @returns The owned conversation, or `null` when absent or owned by another user.
   */
  async getOwnedConversation(id: string, userId: string): Promise<Conversation | null> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new DatabaseError(`Conversation: ${error.message}`);
    return data as Conversation | null;
  }

  /**
   * Lists a user's newest conversations first.
   * @param userId Owner whose conversations are requested.
   * @param limit Maximum rows to return; defaults to 50.
   * @returns Conversations ordered by descending start time.
   * @throws {DatabaseError} If the query fails.
   */
  async getUserConversations(userId: string, limit = 50): Promise<Conversation[]> {
    const { data, error } = await this.client
      .from('conversations')
      .select('*')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw new DatabaseError(`Conversations: ${error.message}`);
    return data as Conversation[];
  }

  /** Applies editable fields to a conversation by identifier. */
  async updateConversation(id: string, changes: ConversationChanges): Promise<Conversation> {
    return this.updateById('conversations', id, changes, 'Conversation');
  }

  /** Marks a conversation as ended with a caller-supplied duration. */
  async endConversation(id: string, durationSeconds: number): Promise<Conversation> {
    return this.updateConversation(id, {
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
    });
  }

  /** Deletes a conversation by identifier. */
  async deleteConversation(id: string): Promise<void> {
    await this.deleteById('conversations', id, 'Conversation');
  }

  /** Renames a conversation only when it belongs to the supplied user. */
  async renameOwnedConversation(id: string, userId: string, title: string): Promise<Conversation> {
    const { data, error } = await this.client
      .from('conversations')
      .update({ title })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) throw new DatabaseError(`Conversation: ${error.message}`);
    if (!data) throw new NotFoundError('Conversation not found');
    return data as Conversation;
  }

  /**
   * Ends an owned conversation using application time clamped to its persisted start time.
   * Repeated calls return the original end state.
   */
  async endOwnedConversation(id: string, userId: string): Promise<Conversation> {
    const conversation = await this.requireOwnedConversation(id, userId);
    if (conversation.ended_at) return conversation;

    const startedAtMs = new Date(conversation.started_at).getTime();
    if (!Number.isFinite(startedAtMs))
      throw new DatabaseError('Conversation has an invalid start time');
    const endedAtMs = Math.max(Date.now(), startedAtMs);
    const endedAt = new Date(endedAtMs);
    const durationSeconds = Math.floor((endedAtMs - startedAtMs) / 1000);
    const { data, error } = await this.client
      .from('conversations')
      .update({ ended_at: endedAt.toISOString(), duration_seconds: durationSeconds })
      .eq('id', id)
      .eq('user_id', userId)
      .is('ended_at', null)
      .select()
      .maybeSingle();
    if (error) throw new DatabaseError(`Conversation: ${error.message}`);
    if (data) return data as Conversation;

    const concurrentlyEnded = await this.getOwnedConversation(id, userId);
    if (!concurrentlyEnded) throw new NotFoundError('Conversation not found');
    if (!concurrentlyEnded.ended_at) throw new DatabaseError('Conversation could not be ended');
    return concurrentlyEnded;
  }

  /** Deletes a conversation only when it belongs to the supplied user. */
  async deleteOwnedConversation(id: string, userId: string): Promise<void> {
    const { error, count } = await this.client
      .from('conversations')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new DatabaseError(`Conversation: ${error.message}`);
    if (count === 0) throw new NotFoundError('Conversation not found');
  }

  /**
   * Persists a message in a conversation.
   * @param conversationId Conversation receiving the message.
   * @param role Originating participant role.
   * @param content Text content of the message.
   * @param audioUrl Optional URL of associated audio.
   * @returns The newly persisted message.
   * @throws {DatabaseError} If insertion fails.
   * @throws {NotFoundError} If the database does not return the inserted row.
   */
  async saveMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    audioUrl?: string,
  ): Promise<Message> {
    const r = await this.client
      .from('messages')
      .insert({ conversation_id: conversationId, role, content, audio_url: audioUrl ?? null })
      .select()
      .single();
    return this.unwrap(r.data as Message | null, r.error, 'Message');
  }

  /**
   * Finds a message by identifier.
   * @param id Message identifier to query.
   * @returns The matching message, or `null` when absent.
   * @throws {DatabaseError} If the query fails.
   */
  async getMessage(id: string): Promise<Message | null> {
    return this.getById<Message>('messages', id);
  }

  /**
   * Gets an idempotent user message after verifying conversation ownership.
   * @param conversationId Conversation containing the message.
   * @param userId Expected conversation owner.
   * @param clientMessageId Client-generated idempotency identifier.
   * @returns The persisted user message, or `null` when it has not been stored.
   * @throws {NotFoundError} If the conversation is absent or belongs to another user.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedUserMessage(
    conversationId: string,
    userId: string,
    clientMessageId: string,
  ): Promise<Message | null> {
    await this.requireOwnedConversation(conversationId, userId);
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .eq('client_message_id', clientMessageId)
      .maybeSingle();
    if (error) throw new DatabaseError(`User message: ${error.message}`);
    return data as Message | null;
  }

  /**
   * Stores one user message per conversation/client identifier, recovering the winner of a race.
   * @param conversationId Conversation receiving the message.
   * @param userId Expected conversation owner.
   * @param clientMessageId Client-generated idempotency identifier.
   * @param content Validated message content.
   * @returns The inserted row or the already-persisted competing row.
   * @throws {NotFoundError} If the conversation is absent or belongs to another user.
   * @throws {DatabaseError} If persistence fails for a reason other than a uniqueness race.
   */
  async saveOwnedUserMessage(
    conversationId: string,
    userId: string,
    clientMessageId: string,
    content: string,
  ): Promise<Message> {
    await this.requireOwnedConversation(conversationId, userId);
    const { data, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'user',
        content,
        client_message_id: clientMessageId,
      })
      .select()
      .single();
    if (!error && data) return data as Message;
    if (error?.code === 'P0001' && error.message.toUpperCase().includes('CONVERSATION_ENDED'))
      throw new ConversationEndedError();
    if (error?.code === '23505') {
      const existing = await this.getOwnedUserMessage(conversationId, userId, clientMessageId);
      if (existing) return existing;
    }
    throw new DatabaseError(`User message: ${error?.message ?? 'insert returned no row'}`);
  }

  /**
   * Gets the unique assistant response to a user message after verifying ownership.
   * @param conversationId Conversation containing both messages.
   * @param userId Expected conversation owner.
   * @param userMessageId User message to which the assistant responds.
   * @returns The persisted assistant response, or `null` while the turn is partial.
   * @throws {NotFoundError} If the conversation is absent or belongs to another user.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedAssistantReply(
    conversationId: string,
    userId: string,
    userMessageId: string,
  ): Promise<Message | null> {
    await this.requireOwnedConversation(conversationId, userId);
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('role', 'assistant')
      .eq('reply_to_message_id', userMessageId)
      .maybeSingle();
    if (error) throw new DatabaseError(`Assistant reply: ${error.message}`);
    return data as Message | null;
  }

  /**
   * Stores one assistant response linked to an owned user message and recovers race winners.
   * @param conversationId Conversation containing the turn.
   * @param userId Expected conversation owner.
   * @param userMessageId Persisted user message receiving the response.
   * @param content Generated assistant content.
   * @returns The inserted row or the already-persisted competing row.
   * @throws {NotFoundError} If ownership or the referenced user message cannot be verified.
   * @throws {DatabaseError} If persistence fails for a reason other than a uniqueness race.
   */
  async saveOwnedAssistantReply(
    conversationId: string,
    userId: string,
    userMessageId: string,
    content: string,
  ): Promise<Message> {
    await this.requireOwnedConversation(conversationId, userId);
    const { data: userMessage, error: userMessageError } = await this.client
      .from('messages')
      .select('id')
      .eq('id', userMessageId)
      .eq('conversation_id', conversationId)
      .eq('role', 'user')
      .maybeSingle();
    if (userMessageError) throw new DatabaseError(`User message: ${userMessageError.message}`);
    if (!userMessage) throw new NotFoundError('User message not found');

    const { data, error } = await this.client
      .from('messages')
      .insert({
        conversation_id: conversationId,
        role: 'assistant',
        content,
        reply_to_message_id: userMessageId,
      })
      .select()
      .single();
    if (!error && data) return data as Message;
    if (error?.code === '23505') {
      const existing = await this.getOwnedAssistantReply(conversationId, userId, userMessageId);
      if (existing) return existing;
    }
    throw new DatabaseError(`Assistant reply: ${error?.message ?? 'insert returned no row'}`);
  }

  /**
   * Lists all messages in a conversation in chronological order.
   * @param conversationId Conversation whose messages are requested.
   * @returns Messages ordered by timestamp.
   * @throws {DatabaseError} If the query fails.
   */
  async getConversationMessages(conversationId: string): Promise<Message[]> {
    const { data, error } = await this.client
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new DatabaseError(`Messages: ${error.message}`);
    return data as Message[];
  }

  /**
   * Lists messages only when the conversation belongs to the supplied user.
   * @param conversationId Conversation whose messages are requested.
   * @param userId Expected conversation owner.
   * @returns Chronologically ordered messages.
   * @throws {NotFoundError} If the conversation is absent or belongs to another user.
   */
  async getOwnedConversationMessages(conversationId: string, userId: string): Promise<Message[]> {
    const conversation = await this.getOwnedConversation(conversationId, userId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    return this.getConversationMessages(conversationId);
  }

  /**
   * Applies editable fields to a message.
   * @param id Message identifier to update.
   * @param changes Content, audio URL, or correction-state fields to persist.
   * @returns The updated message.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the message does not exist.
   */
  async updateMessage(id: string, changes: MessageChanges): Promise<Message> {
    return this.updateById('messages', id, changes, 'Message');
  }

  /**
   * Records that a message has one or more corrections.
   * @param id Message identifier to mark.
   * @returns The updated message.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the message does not exist.
   */
  async markMessageWithCorrections(id: string): Promise<Message> {
    return this.updateMessage(id, { has_corrections: true });
  }

  /**
   * Deletes a message by identifier.
   * @param id Message identifier to delete.
   * @returns A promise that resolves when deletion completes.
   * @throws {DatabaseError} If deletion fails.
   * @throws {NotFoundError} If the message does not exist.
   */
  async deleteMessage(id: string): Promise<void> {
    await this.deleteById('messages', id, 'Message');
  }

  /**
   * Persists a correction for a message.
   * @param messageId Message receiving the correction.
   * @param errorType Classification of the language error.
   * @param original Original text containing the error.
   * @param corrected Corrected replacement text.
   * @param explanation Learner-facing rationale for the correction.
   * @returns The newly persisted correction.
   * @throws {DatabaseError} If insertion fails.
   * @throws {NotFoundError} If the database does not return the inserted row.
   */
  async saveCorrection(
    messageId: string,
    userId: string,
    errorType: string,
    original: string,
    corrected: string,
    explanation: string,
  ): Promise<Correction> {
    const r = await this.client
      .from('corrections')
      .insert({
        message_id: messageId,
        user_id: userId,
        error_type: errorType,
        original,
        corrected,
        explanation,
      })
      .select()
      .single();
    return this.unwrap(r.data as Correction | null, r.error, 'Correction');
  }

  /**
   * Stores every correction the tutor found in one message.
   * @param messageId User message the corrections describe.
   * @param userId Owner recorded on each row so study queries need no join.
   * @param corrections Validated corrections; an empty list is a no-op.
   * @returns The persisted corrections, or an empty array when nothing was supplied.
   * @throws {DatabaseError} If insertion fails.
   */
  async saveOwnedCorrections(
    messageId: string,
    userId: string,
    corrections: readonly NewCorrection[],
  ): Promise<Correction[]> {
    if (corrections.length === 0) return [];
    const { data, error } = await this.client
      .from('corrections')
      .insert(
        corrections.map((correction) => ({
          message_id: messageId,
          user_id: userId,
          error_type: correction.errorType,
          original: correction.original,
          corrected: correction.corrected,
          explanation: correction.explanation,
        })),
      )
      .select();
    if (error) throw new DatabaseError(`Corrections: ${error.message}`);
    return data as Correction[];
  }

  /**
   * Lists the corrections on a message that belong to the supplied user.
   *
   * Used when replaying an already-completed turn so a retry re-delivers the original corrections
   * instead of asking the tutor to find them again.
   * @param messageId Message whose corrections are requested.
   * @param userId Expected owner.
   * @returns Corrections in stable creation order.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedMessageCorrections(messageId: string, userId: string): Promise<Correction[]> {
    const { data, error } = await this.client
      .from('corrections')
      .select('*')
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw new DatabaseError(`Corrections: ${error.message}`);
    return data as Correction[];
  }

  /**
   * Finds one owned correction.
   * @param id Correction identifier.
   * @param userId Expected owner.
   * @returns The correction, or `null` when absent or owned by another user.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedCorrection(id: string, userId: string): Promise<Correction | null> {
    const { data, error } = await this.client
      .from('corrections')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new DatabaseError(`Correction: ${error.message}`);
    return data as Correction | null;
  }

  /**
   * Lists a user's corrections for study, newest first, with the message they came from.
   * @param userId Owner whose corrections are requested.
   * @param query Optional status filter, error-type filter, and pagination window.
   * @returns Corrections enriched with message and conversation context.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedCorrections(
    userId: string,
    query: CorrectionQuery = {},
  ): Promise<CorrectionReviewItem[]> {
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_CORRECTION_PAGE_SIZE, 1),
      MAX_CORRECTION_PAGE_SIZE,
    );
    const offset = Math.max(query.offset ?? 0, 0);

    let builder = this.client
      .from('corrections')
      .select('*, messages!inner(content, conversation_id, conversations!inner(title))')
      .eq('user_id', userId);
    if (query.status === 'pending') builder = builder.eq('mastered', false);
    if (query.status === 'mastered') builder = builder.eq('mastered', true);
    if (query.errorType) builder = builder.eq('error_type', query.errorType);

    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new DatabaseError(`Corrections: ${error.message}`);
    return (data as EmbeddedCorrectionRow[]).map((row) => this.toReviewItem(row));
  }

  /**
   * Summarizes a user's study pile.
   * @param userId Owner whose statistics are requested.
   * @returns Totals plus a descending count per error type.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedCorrectionStats(userId: string): Promise<CorrectionStats> {
    const { data, error } = await this.client
      .from('corrections')
      .select('error_type, mastered')
      .eq('user_id', userId)
      .limit(CORRECTION_STATS_ROW_CAP);
    if (error) throw new DatabaseError(`Correction stats: ${error.message}`);

    const rows = data as Array<{ error_type: string; mastered: boolean }>;
    const counts = new Map<string, number>();
    let mastered = 0;
    for (const row of rows) {
      if (row.mastered) mastered += 1;
      counts.set(row.error_type, (counts.get(row.error_type) ?? 0) + 1);
    }

    const byErrorType: CorrectionErrorTypeCount[] = Array.from(counts, ([errorType, count]) => ({
      error_type: errorType,
      count,
    })).sort(
      (left, right) => right.count - left.count || left.error_type.localeCompare(right.error_type),
    );

    return { total: rows.length, pending: rows.length - mastered, mastered, byErrorType };
  }

  /**
   * Records study progress on an owned correction.
   *
   * `reviewed` increments the practice counter and stamps the time; `mastered` moves the row in or
   * out of the pending pile. Both are independent so a learner can practise without retiring it.
   * @param id Correction identifier.
   * @param userId Expected owner.
   * @param changes Review flags to apply.
   * @returns The updated correction.
   * @throws {NotFoundError} If the correction is absent or owned by another user.
   * @throws {DatabaseError} If the update fails.
   */
  async reviewOwnedCorrection(
    id: string,
    userId: string,
    changes: CorrectionReviewChanges,
  ): Promise<Correction> {
    const current = await this.getOwnedCorrection(id, userId);
    if (!current) throw new NotFoundError('Correction not found');

    const update: Record<string, unknown> = {};
    if (changes.mastered !== undefined) update['mastered'] = changes.mastered;
    if (changes.reviewed) {
      update['review_count'] = current.review_count + 1;
      update['last_reviewed_at'] = new Date().toISOString();
    }
    if (Object.keys(update).length === 0) return current;

    const { data, error } = await this.client
      .from('corrections')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) throw new DatabaseError(`Correction: ${error.message}`);
    if (!data) throw new NotFoundError('Correction not found');
    return data as Correction;
  }

  /**
   * Saves a phrase the learner wants to study later.
   * @param userId Owner of the phrase.
   * @param content Phrase text as typed.
   * @param note Optional reminder about where it came from.
   * @returns The newly persisted phrase, with no translation yet.
   * @throws {DatabaseError} If insertion fails.
   */
  async createOwnedPhrase(userId: string, content: string, note?: string): Promise<SavedPhrase> {
    const r = await this.client
      .from('phrases')
      .insert({ user_id: userId, content, note: note ?? null })
      .select()
      .single();
    return this.unwrap(r.data as SavedPhrase | null, r.error, 'Phrase');
  }

  /**
   * Lists a user's saved phrases, newest first.
   * @param userId Owner whose phrases are requested.
   * @param query Optional status filter and pagination window.
   * @returns The matching phrases.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedPhrases(userId: string, query: PhraseQuery = {}): Promise<SavedPhrase[]> {
    const limit = Math.min(
      Math.max(query.limit ?? DEFAULT_CORRECTION_PAGE_SIZE, 1),
      MAX_CORRECTION_PAGE_SIZE,
    );
    const offset = Math.max(query.offset ?? 0, 0);

    let builder = this.client.from('phrases').select('*').eq('user_id', userId);
    if (query.status === 'pending') builder = builder.eq('mastered', false);
    if (query.status === 'mastered') builder = builder.eq('mastered', true);
    if (query.status === 'untranslated') builder = builder.is('translation', null);

    const { data, error } = await builder
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new DatabaseError(`Phrases: ${error.message}`);
    return data as SavedPhrase[];
  }

  /**
   * Finds one owned phrase.
   * @param id Phrase identifier.
   * @param userId Expected owner.
   * @returns The phrase, or `null` when absent or owned by another user.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedPhrase(id: string, userId: string): Promise<SavedPhrase | null> {
    const { data, error } = await this.client
      .from('phrases')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new DatabaseError(`Phrase: ${error.message}`);
    return data as SavedPhrase | null;
  }

  /**
   * Caches a translation on an owned phrase.
   * @param id Phrase identifier.
   * @param userId Expected owner.
   * @param translation Detected language, translation, and usage note.
   * @returns The updated phrase.
   * @throws {NotFoundError} If the phrase is absent or owned by another user.
   * @throws {DatabaseError} If the update fails.
   */
  async saveOwnedPhraseTranslation(
    id: string,
    userId: string,
    translation: PhraseTranslationFields,
  ): Promise<SavedPhrase> {
    return this.updateOwnedPhrase(id, userId, {
      source_language: translation.sourceLanguage,
      translation: translation.translation,
      explanation: translation.explanation,
      translated_at: new Date().toISOString(),
    });
  }

  /**
   * Records study progress and note edits on an owned phrase.
   * @param id Phrase identifier.
   * @param userId Expected owner.
   * @param changes Review flags and optional note replacement.
   * @returns The updated phrase.
   * @throws {NotFoundError} If the phrase is absent or owned by another user.
   * @throws {DatabaseError} If the update fails.
   */
  async reviewOwnedPhrase(
    id: string,
    userId: string,
    changes: PhraseReviewChanges,
  ): Promise<SavedPhrase> {
    const current = await this.getOwnedPhrase(id, userId);
    if (!current) throw new NotFoundError('Phrase not found');

    const update: Record<string, unknown> = {};
    if (changes.note !== undefined) update['note'] = changes.note;
    if (changes.mastered !== undefined) update['mastered'] = changes.mastered;
    if (changes.reviewed) {
      update['review_count'] = current.review_count + 1;
      update['last_reviewed_at'] = new Date().toISOString();
    }
    if (Object.keys(update).length === 0) return current;
    return this.updateOwnedPhrase(id, userId, update);
  }

  /** Deletes a phrase only when it belongs to the supplied user. */
  async deleteOwnedPhrase(id: string, userId: string): Promise<void> {
    const { error, count } = await this.client
      .from('phrases')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw new DatabaseError(`Phrase: ${error.message}`);
    if (count === 0) throw new NotFoundError('Phrase not found');
  }

  /**
   * Summarizes a user's phrase notebook.
   * @param userId Owner whose statistics are requested.
   * @returns Totals for pending, mastered, and not-yet-translated phrases.
   * @throws {DatabaseError} If the query fails.
   */
  async getOwnedPhraseStats(userId: string): Promise<PhraseStats> {
    const { data, error } = await this.client
      .from('phrases')
      .select('mastered, translation')
      .eq('user_id', userId)
      .limit(CORRECTION_STATS_ROW_CAP);
    if (error) throw new DatabaseError(`Phrase stats: ${error.message}`);

    const rows = data as Array<{ mastered: boolean; translation: string | null }>;
    let mastered = 0;
    let untranslated = 0;
    for (const row of rows) {
      if (row.mastered) mastered += 1;
      if (!row.translation) untranslated += 1;
    }
    return { total: rows.length, pending: rows.length - mastered, mastered, untranslated };
  }

  private async updateOwnedPhrase(
    id: string,
    userId: string,
    update: Record<string, unknown>,
  ): Promise<SavedPhrase> {
    const { data, error } = await this.client
      .from('phrases')
      .update(update)
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .maybeSingle();
    if (error) throw new DatabaseError(`Phrase: ${error.message}`);
    if (!data) throw new NotFoundError('Phrase not found');
    return data as SavedPhrase;
  }

  /** Flattens an embedded correction row into the shape the study list consumes. */
  private toReviewItem(row: EmbeddedCorrectionRow): CorrectionReviewItem {
    const { messages, ...correction } = row;
    const title = messages?.conversations?.title;
    return {
      ...correction,
      message_content: typeof messages?.content === 'string' ? messages.content : '',
      conversation_id:
        typeof messages?.conversation_id === 'string' ? messages.conversation_id : '',
      conversation_title: typeof title === 'string' ? title : '',
    };
  }

  /**
   * Finds a correction by identifier.
   * @param id Correction identifier to query.
   * @returns The matching correction, or `null` when absent.
   * @throws {DatabaseError} If the query fails.
   */
  async getCorrection(id: string): Promise<Correction | null> {
    return this.getById<Correction>('corrections', id);
  }

  /**
   * Lists every correction associated with a message.
   * @param messageId Message whose corrections are requested.
   * @returns The matching corrections.
   * @throws {DatabaseError} If the query fails.
   */
  async getMessageCorrections(messageId: string): Promise<Correction[]> {
    const { data, error } = await this.client
      .from('corrections')
      .select('*')
      .eq('message_id', messageId);
    if (error) throw new DatabaseError(`Corrections: ${error.message}`);
    return data as Correction[];
  }

  /**
   * Applies editable fields to a correction.
   * @param id Correction identifier to update.
   * @param changes Error type, text, or explanation fields to persist.
   * @returns The updated correction.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the correction does not exist.
   */
  async updateCorrection(id: string, changes: CorrectionChanges): Promise<Correction> {
    return this.updateById('corrections', id, changes, 'Correction');
  }

  /**
   * Deletes a correction by identifier.
   * @param id Correction identifier to delete.
   * @returns A promise that resolves when deletion completes.
   * @throws {DatabaseError} If deletion fails.
   * @throws {NotFoundError} If the correction does not exist.
   */
  async deleteCorrection(id: string): Promise<void> {
    await this.deleteById('corrections', id, 'Correction');
  }

  /**
   * Creates an empty progress record for a user.
   * @param userId User who owns the progress record.
   * @returns The newly persisted progress record.
   * @throws {DatabaseError} If insertion fails.
   * @throws {NotFoundError} If the database does not return the inserted row.
   */
  async createUserProgress(userId: string): Promise<UserProgress> {
    const r = await this.client.from('user_progress').insert({ user_id: userId }).select().single();
    return this.unwrap(r.data as UserProgress | null, r.error, 'User progress');
  }

  /**
   * Finds progress for a user.
   * @param userId User whose progress is requested.
   * @returns The matching progress record, or `null` when absent.
   * @throws {DatabaseError} If the query fails.
   */
  async getUserProgress(userId: string): Promise<UserProgress | null> {
    const { data, error } = await this.client
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new DatabaseError(`User progress: ${error.message}`);
    return data as UserProgress | null;
  }

  /**
   * Applies counters or common errors and refreshes the progress timestamp.
   * @param userId Owner of the progress record.
   * @param changes Progress fields to persist.
   * @returns The updated progress record.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the progress record does not exist.
   */
  async updateUserProgress(userId: string, changes: ProgressChanges): Promise<UserProgress> {
    const payload = { ...changes, last_updated: new Date().toISOString() };
    const r = await this.client
      .from('user_progress')
      .update(payload)
      .eq('user_id', userId)
      .select()
      .single();
    return this.unwrap(r.data as UserProgress | null, r.error, 'User progress');
  }

  /**
   * Increments a user's total conversation count, creating progress when absent.
   * @param userId User whose counter is incremented.
   * @returns A promise that resolves after the counter is persisted.
   * @throws {DatabaseError} If reading, creating, or updating progress fails.
   * @throws {NotFoundError} If a required write returns no row.
   */
  async incrementConversationCount(userId: string): Promise<void> {
    const current = (await this.getUserProgress(userId)) ?? (await this.createUserProgress(userId));
    await this.updateUserProgress(userId, { total_conversations: current.total_conversations + 1 });
  }

  /**
   * Adds practiced minutes to a user's progress, creating progress when absent.
   * @param userId User whose accumulated time is updated.
   * @param minutes Number of minutes to add.
   * @returns A promise that resolves after the total is persisted.
   * @throws {DatabaseError} If reading, creating, or updating progress fails.
   * @throws {NotFoundError} If a required write returns no row.
   */
  async addTimeToProgress(userId: string, minutes: number): Promise<void> {
    const current = (await this.getUserProgress(userId)) ?? (await this.createUserProgress(userId));
    await this.updateUserProgress(userId, {
      total_time_minutes: current.total_time_minutes + minutes,
    });
  }

  /**
   * Replaces the common-error summary for a user.
   * @param userId Owner of the progress record.
   * @param errors Error summaries including count and last-seen timestamp.
   * @returns The updated progress record.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the progress record does not exist.
   */
  async updateCommonErrors(userId: string, errors: CommonError[]): Promise<UserProgress> {
    return this.updateUserProgress(userId, { common_errors: errors });
  }

  /**
   * Deletes a progress record by its identifier.
   * @param id Progress-record identifier to delete.
   * @returns A promise that resolves when deletion completes.
   * @throws {DatabaseError} If deletion fails.
   * @throws {NotFoundError} If the progress record does not exist.
   */
  async deleteUserProgress(id: string): Promise<void> {
    await this.deleteById('user_progress', id, 'User progress');
  }

  /**
   * Retrieves preferences for a user, or creates default preferences if none exist.
   */
  async getUserPreferences(userId: string): Promise<UserPreferences> {
    const { data, error } = await this.client
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new DatabaseError(`user_preferences: ${error.message}`);
    if (data) return data as UserPreferences;

    const defaultPrefs = {
      user_id: userId,
      interests: ['everyday-life', 'culture', 'travel', 'movies'],
      goals: ['casual-fluency', 'natural-speaking'],
      tone: 'friendly' as const,
      custom_topics: '',
    };

    const insertResult = await this.client
      .from('user_preferences')
      .insert(defaultPrefs)
      .select()
      .single();

    return this.unwrap(
      insertResult.data as UserPreferences | null,
      insertResult.error,
      'UserPreferences',
    );
  }

  /**
   * Updates or inserts preferences for a user.
   */
  async upsertUserPreferences(
    userId: string,
    changes: Partial<Pick<UserPreferences, 'interests' | 'goals' | 'tone' | 'custom_topics'>>,
  ): Promise<UserPreferences> {
    const payload = {
      user_id: userId,
      ...changes,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from('user_preferences')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single();

    return this.unwrap(data as UserPreferences | null, error, 'UserPreferences');
  }

  /**
   * Saves or updates feedback for a conversation.
   */
  async saveConversationFeedback(
    userId: string,
    conversationId: string,
    feedback: { satisfaction_score: number; tags?: string[]; notes?: string | null },
  ): Promise<ConversationFeedback> {
    await this.requireOwnedConversation(conversationId, userId);

    const payload = {
      conversation_id: conversationId,
      user_id: userId,
      satisfaction_score: Math.max(1, Math.min(5, Math.round(feedback.satisfaction_score))),
      tags: feedback.tags ?? [],
      notes: feedback.notes?.trim() || null,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await this.client
      .from('conversation_feedback')
      .upsert(payload, { onConflict: 'conversation_id' })
      .select()
      .single();

    return this.unwrap(data as ConversationFeedback | null, error, 'ConversationFeedback');
  }

  /**
   * Gets feedback for a specific conversation.
   */
  async getConversationFeedback(
    userId: string,
    conversationId: string,
  ): Promise<ConversationFeedback | null> {
    await this.requireOwnedConversation(conversationId, userId);
    const { data, error } = await this.client
      .from('conversation_feedback')
      .select('*')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw new DatabaseError(`conversation_feedback: ${error.message}`);
    return data as ConversationFeedback | null;
  }

  /**
   * Computes satisfaction statistics from conversation feedbacks.
   */
  async getFeedbackStats(userId: string): Promise<PartnerSatisfactionStats> {
    const { data, error } = await this.client
      .from('conversation_feedback')
      .select('satisfaction_score, tags')
      .eq('user_id', userId);

    if (error) throw new DatabaseError(`conversation_feedback: ${error.message}`);
    const rows = (data ?? []) as Array<{ satisfaction_score: number; tags: string[] }>;

    if (rows.length === 0) {
      return { totalRated: 0, averageScore: 0, topTags: [] };
    }

    const totalRated = rows.length;
    const sumScore = rows.reduce((acc, row) => acc + (row.satisfaction_score || 0), 0);
    const averageScore = Math.round((sumScore / totalRated) * 10) / 10;

    const tagCounts = new Map<string, number>();
    for (const row of rows) {
      if (Array.isArray(row.tags)) {
        for (const tag of row.tags) {
          tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
        }
      }
    }

    const topTags = Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return { totalRated, averageScore, topTags };
  }

  /**
   * Returns recent conversation feedbacks for a user.
   */
  async getRecentFeedbacks(
    userId: string,
    limit = 10,
  ): Promise<(ConversationFeedback & { conversation_title?: string })[]> {
    const { data, error } = await this.client
      .from('conversation_feedback')
      .select('*, conversations:conversation_id (title)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw new DatabaseError(`conversation_feedback: ${error.message}`);
    const rows = (data ?? []) as Array<
      ConversationFeedback & { conversations?: { title?: string } | null }
    >;
    return rows.map((row) => ({
      id: row.id,
      conversation_id: row.conversation_id,
      user_id: row.user_id,
      satisfaction_score: row.satisfaction_score,
      tags: row.tags ?? [],
      notes: row.notes,
      created_at: row.created_at,
      conversation_title: row.conversations?.title ?? 'Conversation',
    }));
  }

  /**
   * Retrieves current partner recommendations for a user.
   */
  async getPartnerRecommendations(userId: string): Promise<PartnerRecommendation[]> {
    const { data, error } = await this.client
      .from('partner_recommendations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw new DatabaseError(`partner_recommendations: ${error.message}`);
    return (data ?? []) as PartnerRecommendation[];
  }

  /**
   * Replaces or saves recommendations for a user.
   */
  async savePartnerRecommendations(
    userId: string,
    recommendations: Array<
      Omit<PartnerRecommendation, 'id' | 'user_id' | 'created_at' | 'is_favorite'>
    >,
  ): Promise<PartnerRecommendation[]> {
    await this.client
      .from('partner_recommendations')
      .delete()
      .eq('user_id', userId)
      .eq('is_favorite', false);

    const rows = recommendations.map((rec) => ({
      user_id: userId,
      category: rec.category,
      title: rec.title,
      description: rec.description,
      starter_prompt: rec.starter_prompt,
      difficulty: rec.difficulty,
      context_reason: rec.context_reason || null,
      is_favorite: false,
    }));

    const { error } = await this.client.from('partner_recommendations').insert(rows);
    if (error) throw new DatabaseError(`partner_recommendations: ${error.message}`);
    return this.getPartnerRecommendations(userId);
  }

  /**
   * Retrieves recent conversation memories, including user dialogue, corrections, and satisfaction feedback,
   * for the partner recommendation engine to analyze.
   */
  async getRecentChatMemoriesForPartner(userId: string, limit = 5): Promise<ChatMemorySnippet[]> {
    const { data: conversations, error: convErr } = await this.client
      .from('conversations')
      .select('id, title, started_at')
      .eq('user_id', userId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (convErr) throw new DatabaseError(`conversations: ${convErr.message}`);
    if (!conversations || conversations.length === 0) return [];

    const conversationIds = conversations.map((c) => c.id);

    // Fetch messages and feedback for these conversations in parallel
    const [messagesRes, feedbackRes] = await Promise.all([
      this.client
        .from('messages')
        .select('id, conversation_id, role, content, has_corrections, timestamp')
        .in('conversation_id', conversationIds)
        .order('timestamp', { ascending: true }),
      this.client
        .from('conversation_feedback')
        .select('conversation_id, satisfaction_score, notes')
        .in('conversation_id', conversationIds),
    ]);

    const messages = messagesRes.data ?? [];
    const messageIdsWithCorrections = messages.filter((m) => m.has_corrections).map((m) => m.id);

    let corrections: Array<{ message_id: string; error_type: string }> = [];
    if (messageIdsWithCorrections.length > 0) {
      const corrRes = await this.client
        .from('corrections')
        .select('message_id, error_type')
        .in('message_id', messageIdsWithCorrections);
      corrections = corrRes.data ?? [];
    }

    const feedbackMap = new Map<string, { satisfaction_score: number; notes: string | null }>();
    for (const f of feedbackRes.data ?? []) {
      feedbackMap.set(f.conversation_id, {
        satisfaction_score: f.satisfaction_score,
        notes: f.notes,
      });
    }

    const memorySnippets: ChatMemorySnippet[] = [];

    for (const conv of conversations) {
      const convMessages = messages.filter((m) => m.conversation_id === conv.id);
      const userMessages = convMessages.filter((m) => m.role === 'user');
      const assistantMessages = convMessages.filter((m) => m.role === 'assistant');

      // Extract meaningful user statements (trimmed)
      const userSnippets = userMessages
        .map((m) => m.content.trim())
        .filter((c) => c.length > 0)
        .slice(-6);

      // Extract brief assistant context
      const assistantSnippets = assistantMessages
        .map((m) => m.content.trim().slice(0, 120))
        .filter((c) => c.length > 0)
        .slice(-3);

      const convMsgIds = new Set(convMessages.map((m) => m.id));
      const convErrors = Array.from(
        new Set(corrections.filter((c) => convMsgIds.has(c.message_id)).map((c) => c.error_type)),
      );

      const fb = feedbackMap.get(conv.id);

      memorySnippets.push({
        conversationId: conv.id,
        title: conv.title,
        startedAt: conv.started_at,
        userMessagesCount: userMessages.length,
        userSnippets,
        assistantSnippets,
        errorTypes: convErrors,
        satisfactionScore: fb?.satisfaction_score ?? null,
        feedbackNotes: fb?.notes ?? null,
      });
    }

    return memorySnippets;
  }

  /**
   * Toggles the favorite status of a recommendation.
   */
  async toggleFavoriteRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<PartnerRecommendation> {
    const { data: existing, error: fetchErr } = await this.client
      .from('partner_recommendations')
      .select('*')
      .eq('id', recommendationId)
      .eq('user_id', userId)
      .single();

    if (fetchErr || !existing) throw new NotFoundError('Recommendation not found');

    const nextState = !existing.is_favorite;
    const { data, error } = await this.client
      .from('partner_recommendations')
      .update({ is_favorite: nextState })
      .eq('id', recommendationId)
      .eq('user_id', userId)
      .select()
      .single();

    return this.unwrap(data as PartnerRecommendation | null, error, 'PartnerRecommendation');
  }

  /**
   * Gathers full summary for the Partner Hub.
   */
  async getPartnerHubSummary(userId: string): Promise<PartnerHubSummary> {
    const [preferences, recommendations, stats, recentFeedbacks] = await Promise.all([
      this.getUserPreferences(userId),
      this.getPartnerRecommendations(userId),
      this.getFeedbackStats(userId),
      this.getRecentFeedbacks(userId, 5),
    ]);

    return {
      preferences,
      recommendations,
      stats,
      recentFeedbacks,
    };
  }

  /**
   * Retrieves the currently active story adventure for a user with characters and turns.
   */
  async getActiveAdventure(userId: string): Promise<StoryAdventure | null> {
    const { data: adventure, error: advErr } = await this.client
      .from('adventures')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (advErr) throw new DatabaseError(`adventures: ${advErr.message}`);
    if (!adventure) return null;

    const [charsRes, turnsRes] = await Promise.all([
      this.client
        .from('adventure_characters')
        .select('*')
        .eq('adventure_id', adventure.id)
        .order('created_at', { ascending: true }),
      this.client
        .from('adventure_turns')
        .select('*')
        .eq('adventure_id', adventure.id)
        .order('timestamp', { ascending: true }),
    ]);

    if (charsRes.error) throw new DatabaseError(`adventure_characters: ${charsRes.error.message}`);
    if (turnsRes.error) throw new DatabaseError(`adventure_turns: ${turnsRes.error.message}`);

    return {
      ...adventure,
      characters: (charsRes.data ?? []) as AdventureCharacter[],
      turns: (turnsRes.data ?? []) as AdventureTurn[],
    };
  }

  /**
   * Archives any existing active adventures for a user.
   */
  async archiveActiveAdventures(userId: string): Promise<void> {
    const { error } = await this.client
      .from('adventures')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active');
    if (error) throw new DatabaseError(`adventures archive: ${error.message}`);
  }

  /**
   * Creates a fresh story adventure with initial party characters and opening narrative turns.
   */
  async createAdventure(
    userId: string,
    params: {
      title: string;
      theme: string;
      setting: string;
      summary: string;
      characters: Array<Omit<AdventureCharacter, 'id' | 'adventure_id' | 'created_at'>>;
      initialTurns: Array<Omit<AdventureTurn, 'id' | 'adventure_id' | 'timestamp'>>;
    },
  ): Promise<StoryAdventure> {
    await this.archiveActiveAdventures(userId);

    const { data: adv, error: advErr } = await this.client
      .from('adventures')
      .insert({
        user_id: userId,
        title: params.title,
        theme: params.theme,
        setting: params.setting,
        summary: params.summary,
        status: 'active',
      })
      .select()
      .single();

    if (advErr || !adv) throw new DatabaseError(`adventures insert: ${advErr?.message}`);

    const characterRows = params.characters.map((c) => ({
      adventure_id: adv.id,
      name: c.name,
      role: c.role,
      personality: c.personality,
      avatar_emoji: c.avatar_emoji,
      voice_pitch: c.voice_pitch,
    }));

    const { data: chars, error: charsErr } = await this.client
      .from('adventure_characters')
      .insert(characterRows)
      .select();

    if (charsErr) throw new DatabaseError(`adventure_characters insert: ${charsErr.message}`);

    const turnRows = params.initialTurns.map((t) => ({
      adventure_id: adv.id,
      speaker_role: t.speaker_role,
      speaker_name: t.speaker_name,
      content: t.content,
      corrections: t.corrections ?? [],
      action_chips: t.action_chips ?? [],
    }));

    const { data: turns, error: turnsErr } = await this.client
      .from('adventure_turns')
      .insert(turnRows)
      .select();

    if (turnsErr) throw new DatabaseError(`adventure_turns insert: ${turnsErr.message}`);

    return {
      ...adv,
      characters: chars as AdventureCharacter[],
      turns: turns as AdventureTurn[],
    };
  }

  /**
   * Appends user turn and character replies to an active adventure.
   */
  async addAdventureUserTurnAndReplies(
    adventureId: string,
    userId: string,
    params: {
      userTurn: Omit<AdventureTurn, 'id' | 'adventure_id' | 'timestamp'>;
      characterReplies: Array<Omit<AdventureTurn, 'id' | 'adventure_id' | 'timestamp'>>;
      newSummary?: string;
    },
  ): Promise<AdventureTurnResponse> {
    const { data: adv, error: advErr } = await this.client
      .from('adventures')
      .select('*')
      .eq('id', adventureId)
      .eq('user_id', userId)
      .single();

    if (advErr || !adv) throw new NotFoundError('Adventure not found');

    const allTurnRows = [
      {
        adventure_id: adventureId,
        speaker_role: params.userTurn.speaker_role,
        speaker_name: params.userTurn.speaker_name,
        content: params.userTurn.content,
        corrections: params.userTurn.corrections ?? [],
        action_chips: params.userTurn.action_chips ?? [],
      },
      ...params.characterReplies.map((r) => ({
        adventure_id: adventureId,
        speaker_role: r.speaker_role,
        speaker_name: r.speaker_name,
        content: r.content,
        corrections: r.corrections ?? [],
        action_chips: r.action_chips ?? [],
      })),
    ];

    const { data: savedTurns, error: turnsErr } = await this.client
      .from('adventure_turns')
      .insert(allTurnRows)
      .select();

    if (turnsErr || !savedTurns) throw new DatabaseError(`adventure_turns: ${turnsErr?.message}`);

    if (params.newSummary) {
      await this.client
        .from('adventures')
        .update({ summary: params.newSummary, updated_at: new Date().toISOString() })
        .eq('id', adventureId);
    }

    const fullAdventure = await this.getActiveAdventure(userId);
    if (!fullAdventure) throw new DatabaseError('Failed to reload updated adventure');

    return {
      userTurn: savedTurns[0] as AdventureTurn,
      characterReplies: savedTurns.slice(1) as AdventureTurn[],
      adventure: fullAdventure,
    };
  }

  private async requireOwnedConversation(id: string, userId: string): Promise<Conversation> {
    const conversation = await this.getOwnedConversation(id, userId);
    if (!conversation) throw new NotFoundError('Conversation not found');
    return conversation;
  }

  private async getById<T>(table: string, id: string): Promise<T | null> {
    const { data, error } = await this.client.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new DatabaseError(`${table}: ${error.message}`);
    return data as T | null;
  }
  private async updateById<T>(
    table: string,
    id: string,
    changes: object,
    entity: string,
  ): Promise<T> {
    const r = await this.client.from(table).update(changes).eq('id', id).select().single();
    return this.unwrap(r.data as T | null, r.error, entity);
  }
  private async deleteById(table: string, id: string, entity: string): Promise<void> {
    const { error, count } = await this.client.from(table).delete({ count: 'exact' }).eq('id', id);
    if (error) throw new DatabaseError(`${entity}: ${error.message}`);
    if (count === 0) throw new NotFoundError(`${entity} not found`);
  }
}

export const databaseService = new DatabaseService();
