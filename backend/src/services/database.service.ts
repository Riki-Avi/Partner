import type {
  CommonError,
  Conversation,
  Correction,
  Message,
  MessageRole,
  User,
  UserLevel,
  UserProgress,
} from '@voice-chat/shared';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '../config/supabase.config.js';
import { DatabaseError, NotFoundError } from '../middleware/error.middleware.js';

type UserChanges = Partial<Pick<User, 'name' | 'level'>>;
type ConversationChanges = Partial<
  Pick<Conversation, 'ended_at' | 'language' | 'duration_seconds'>
>;
type MessageChanges = Partial<Pick<Message, 'content' | 'audio_url' | 'has_corrections'>>;
type CorrectionChanges = Partial<
  Pick<Correction, 'error_type' | 'original' | 'corrected' | 'explanation'>
>;
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
   * @returns The newly persisted conversation.
   * @throws {DatabaseError} If insertion fails.
   * @throws {NotFoundError} If the database does not return the inserted row.
   */
  async createConversation(userId: string, language = 'en'): Promise<Conversation> {
    const r = await this.client
      .from('conversations')
      .insert({ user_id: userId, language })
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

  /**
   * Applies editable fields to a conversation.
   * @param id Conversation identifier to update.
   * @param changes End time, language, or duration fields to persist.
   * @returns The updated conversation.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the conversation does not exist.
   */
  async updateConversation(id: string, changes: ConversationChanges): Promise<Conversation> {
    return this.updateById('conversations', id, changes, 'Conversation');
  }

  /**
   * Marks a conversation as ended at the current time.
   * @param id Conversation identifier to end.
   * @param durationSeconds Total elapsed conversation duration in seconds.
   * @returns The ended conversation.
   * @throws {DatabaseError} If the update fails.
   * @throws {NotFoundError} If the conversation does not exist.
   */
  async endConversation(id: string, durationSeconds: number): Promise<Conversation> {
    return this.updateConversation(id, {
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
    });
  }

  /**
   * Deletes a conversation by identifier.
   * @param id Conversation identifier to delete.
   * @returns A promise that resolves when deletion completes.
   * @throws {DatabaseError} If deletion fails.
   * @throws {NotFoundError} If the conversation does not exist.
   */
  async deleteConversation(id: string): Promise<void> {
    await this.deleteById('conversations', id, 'Conversation');
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
    errorType: string,
    original: string,
    corrected: string,
    explanation: string,
  ): Promise<Correction> {
    const r = await this.client
      .from('corrections')
      .insert({ message_id: messageId, error_type: errorType, original, corrected, explanation })
      .select()
      .single();
    return this.unwrap(r.data as Correction | null, r.error, 'Correction');
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
