import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import type {
  ChatErrorPayload,
  ChatSendPayload,
  ClientEvents,
  ServerEvents,
} from '@voice-chat/shared';
import { authBypassEnabled, resolveBypassUserId } from '../config/dev-auth.config.js';
import { supabase } from '../config/supabase.config.js';
import { ConversationEndedError } from '../middleware/error.middleware.js';
import { databaseService, type NewCorrection } from './database.service.js';
import { geminiService } from './gemini.service.js';

interface SocketData {
  userId: string;
}
type AppSocket = Socket<ClientEvents, ServerEvents, object, SocketData>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE_LENGTH = 4_000;

/** Owns the authenticated Socket.IO server, user rooms, and serialized Gemini chat turns. */
export class SocketService {
  private io?: Server<ClientEvents, ServerEvents, object, SocketData>;
  private readonly busyConversations = new Set<string>();

  initialize(server: HttpServer): void {
    if (this.io) return;
    this.io = new Server(server, {
      cors: { origin: process.env['FRONTEND_URL'] ?? 'http://localhost:4200', credentials: true },
    });
    this.io.use(async (socket, next) => {
      try {
        // Development bypass: accept the handshake and attribute it to a fixed user.
        if (authBypassEnabled) {
          socket.data.userId = await resolveBypassUserId();
          next();
          return;
        }

        const token = socket.handshake.auth['token'] as unknown;
        if (typeof token !== 'string' || !token)
          return next(new Error('Authentication token required'));
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user) return next(new Error('Invalid or expired token'));
        socket.data.userId = data.user.id;
        next();
      } catch (error) {
        console.error('Socket authentication failed:', error);
        next(new Error('WebSocket authentication failed'));
      }
    });
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: AppSocket): void {
    const { userId } = socket.data;
    console.info(`Socket connected: ${userId}`);
    void socket.join(`user:${userId}`);
    socket.emit('authenticated', { userId });
    socket.on('ping', (payload) => socket.emit('pong', payload));
    socket.on('chat:send', (payload) => {
      void this.handleChatSend(socket, payload).catch(() => {
        this.emitChatError(socket, { code: 'CHAT_ERROR', message: 'Unable to process message' });
      });
    });
    socket.on('disconnect', (reason) => console.info(`Socket disconnected: ${userId} (${reason})`));
    socket.on('error', (error) => console.error(`Socket error for ${userId}:`, error));
  }

  private async handleChatSend(socket: AppSocket, payload: ChatSendPayload): Promise<void> {
    const userId = socket.data.userId;
    const conversationId =
      typeof payload?.conversationId === 'string' ? payload.conversationId : '';
    const clientMessageId =
      typeof payload?.clientMessageId === 'string' ? payload.clientMessageId : undefined;
    const content = typeof payload?.content === 'string' ? payload.content.trim() : '';
    const correlation = { conversationId: conversationId || undefined, clientMessageId };

    if (
      !UUID_PATTERN.test(conversationId) ||
      !clientMessageId ||
      !UUID_PATTERN.test(clientMessageId)
    ) {
      this.emitChatError(socket, {
        ...correlation,
        code: 'INVALID_MESSAGE',
        message: 'Invalid conversation or message identifier',
      });
      return;
    }
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      this.emitChatError(socket, {
        ...correlation,
        code: 'INVALID_CONTENT',
        message: `Message must contain 1-${MAX_MESSAGE_LENGTH} characters`,
      });
      return;
    }

    try {
      const conversation = await databaseService.getOwnedConversation(conversationId, userId);
      if (!conversation) {
        this.emitChatError(socket, {
          ...correlation,
          code: 'CONVERSATION_NOT_FOUND',
          message: 'Conversation not found',
        });
        return;
      }
      if (conversation.ended_at) {
        this.emitChatError(socket, {
          ...correlation,
          code: 'CONVERSATION_ENDED',
          message: 'This conversation has ended and can no longer receive messages',
        });
        return;
      }
    } catch {
      this.emitChatError(socket, {
        ...correlation,
        code: 'CHAT_UNAVAILABLE',
        message: 'Unable to access conversation',
      });
      return;
    }

    if (this.busyConversations.has(conversationId)) {
      this.emitChatError(socket, {
        ...correlation,
        code: 'TURN_IN_PROGRESS',
        message: 'Please wait for the current reply to finish',
      });
      return;
    }

    this.busyConversations.add(conversationId);
    const room = `user:${userId}`;
    let typing = false;
    try {
      const userMessage = await databaseService.saveOwnedUserMessage(
        conversationId,
        userId,
        clientMessageId,
        content,
      );
      this.io?.to(room).emit('chat:message', { message: userMessage, clientMessageId });

      const persistedReply = await databaseService.getOwnedAssistantReply(
        conversationId,
        userId,
        userMessage.id,
      );
      if (persistedReply) {
        this.io?.to(room).emit('chat:message', { message: persistedReply, clientMessageId });
        // The turn already completed, so its corrections are replayed from storage rather than
        // asking the tutor to find them again, which would duplicate the learner's study rows.
        await this.emitPersistedCorrections(
          room,
          conversationId,
          userId,
          userMessage.id,
          clientMessageId,
        );
        return;
      }

      typing = true;
      this.io?.to(room).emit('chat:typing', { conversationId, typing: true });
      const history = await databaseService.getOwnedConversationMessages(conversationId, userId);
      const turn = await geminiService.generateTurn(history);
      const assistantMessage = await databaseService.saveOwnedAssistantReply(
        conversationId,
        userId,
        userMessage.id,
        turn.reply,
      );
      this.io?.to(room).emit('chat:message', { message: assistantMessage, clientMessageId });
      await this.persistCorrections(
        room,
        conversationId,
        userId,
        userMessage.id,
        clientMessageId,
        turn.corrections,
      );
    } catch (error) {
      if (error instanceof ConversationEndedError) {
        this.emitChatError(socket, {
          ...correlation,
          code: 'CONVERSATION_ENDED',
          message: error.message,
        });
      } else {
        console.error(`Chat turn failed for conversation ${conversationId}:`, error);
        this.emitChatError(socket, {
          ...correlation,
          code: 'CHAT_GENERATION_FAILED',
          message: 'Unable to complete this reply. Please try again.',
        });
      }
    } finally {
      this.busyConversations.delete(conversationId);
      if (typing) this.io?.to(room).emit('chat:typing', { conversationId, typing: false });
    }
  }

  /**
   * Stores the corrections for a completed turn and delivers them to the learner.
   *
   * Failures are swallowed deliberately: by this point the reply is persisted and already on its
   * way to the browser, so losing the study rows must not turn a successful turn into an error the
   * learner is told to retry.
   */
  private async persistCorrections(
    room: string,
    conversationId: string,
    userId: string,
    messageId: string,
    clientMessageId: string,
    corrections: readonly NewCorrection[],
  ): Promise<void> {
    if (corrections.length === 0) return;
    try {
      const saved = await databaseService.saveOwnedCorrections(messageId, userId, corrections);
      if (saved.length === 0) return;
      await databaseService.markMessageWithCorrections(messageId);
      this.io?.to(room).emit('chat:corrections', {
        conversationId,
        messageId,
        clientMessageId,
        corrections: saved,
      });
    } catch (error) {
      console.error(`Could not persist corrections for message ${messageId}:`, error);
    }
  }

  /** Re-delivers the corrections of a turn that had already completed before a retry. */
  private async emitPersistedCorrections(
    room: string,
    conversationId: string,
    userId: string,
    messageId: string,
    clientMessageId: string,
  ): Promise<void> {
    try {
      const corrections = await databaseService.getOwnedMessageCorrections(messageId, userId);
      if (corrections.length === 0) return;
      this.io
        ?.to(room)
        .emit('chat:corrections', { conversationId, messageId, clientMessageId, corrections });
    } catch (error) {
      console.error(`Could not replay corrections for message ${messageId}:`, error);
    }
  }

  private emitChatError(socket: AppSocket, payload: ChatErrorPayload): void {
    socket.emit('chat:error', payload);
  }
}

export const socketService = new SocketService();
