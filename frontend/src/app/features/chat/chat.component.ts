import { DatePipe, NgClass, NgFor, NgIf, UpperCasePipe } from '@angular/common';
import {
  AfterViewChecked,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { finalize, type Subscription } from 'rxjs';
import type {
  ChatCorrectionsPayload,
  ChatErrorPayload,
  ChatMessagePayload,
  ChatTypingPayload,
  ConnectionState,
  Conversation,
  ConversationFeedback,
  Correction,
  Message,
} from '@voice-chat/shared';
import { ChatService } from '../../core/services/chat.service';
import { PartnerService } from '../../core/services/partner.service';
import { SocketService } from '../../core/services/socket.service';
import { SpeechService } from '../../core/services/speech.service';

interface DisplayMessage extends Message {
  deliveryState?: 'sending' | 'failed';
}

const DEFAULT_CONVERSATION_TITLE = 'English practice';
const MAX_TITLE_LENGTH = 120;
const AUTO_READ_STORAGE_KEY = 'voice_chat_read_replies_aloud';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [DatePipe, NgClass, NgFor, NgIf, ReactiveFormsModule, RouterLink, UpperCasePipe],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css',
})
export class ChatComponent implements AfterViewChecked, OnDestroy {
  @ViewChild('messageList') private messageList?: ElementRef<HTMLElement>;

  readonly messageControl = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(4000)],
  });
  readonly socket = inject(SocketService);

  conversations: Conversation[] = [];
  messages: DisplayMessage[] = [];
  selectedConversationId: string | null = null;
  connectionState: ConnectionState = 'disconnected';
  loadingConversations = true;
  loadingMessages = false;
  creatingConversation = false;
  pendingTurn = false;
  geminiTyping = false;
  errorMessage = '';
  voiceError = '';
  isListening = false;
  isTranscribing = false;
  listeningSessionActive = false;
  isSpeaking = false;
  speakingMessageId: string | null = null;
  conversationActionId: string | null = null;
  readRepliesAloud = this.loadAutoReadPreference();

  showRatingModal = false;
  ratingScore = 5;
  selectedRatingTags: string[] = [];
  readonly ratingNotesControl = new FormControl('', { nonNullable: true });
  savingRating = false;
  ratingSuccessMessage = '';
  existingFeedback: ConversationFeedback | null = null;
  readonly availableRatingTags = [
    'Natural voice 🎙️',
    'Great topic 💡',
    'Low latency ⚡',
    'Helpful corrections 🎯',
    'Friendly partner 😊',
    'Fun practice 🚀',
  ];

  /**
   * Corrections received live, keyed by the message they describe.
   *
   * Held separately from {@link messages} because they arrive after the message is already
   * rendered, and because reloading history does not refetch them.
   */
  readonly correctionsByMessageId = new Map<string, Correction[]>();

  private activeClientMessageId: string | null = null;
  private listeningSubscription: Subscription | null = null;
  private messageLoadRequestId = 0;
  private shouldScroll = false;
  private readonly optimisticMessages = new Map<string, DisplayMessage>();
  private readonly spokenMessageIds = new Set<string>();
  private readonly chat = inject(ChatService);
  private readonly partner = inject(PartnerService);
  private readonly speech = inject(SpeechService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly recordingSupported = this.speech.recordingSupported;
  readonly synthesisSupported = this.speech.synthesisSupported;

  constructor() {
    this.socket.connectionState$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((state) => {
      const previousState = this.connectionState;
      this.connectionState = state;
      // Dictation is deliberately not cancelled here. It only needs REST and the browser
      // microphone, so a socket blip must not silently discard audio the user already spoke; the
      // transcript still lands in the composer and sending is what waits for the connection.
      if (this.pendingTurn && state !== 'connected') {
        if (this.activeClientMessageId)
          this.setMessageDeliveryState(this.activeClientMessageId, 'failed');
        this.pendingTurn = false;
        this.geminiTyping = false;
        this.activeClientMessageId = null;
        this.errorMessage =
          'The connection was interrupted. Retry your message after reconnecting.';
      }
      if (state === 'connected' && previousState !== 'connected' && this.selectedConversationId)
        this.loadMessages(this.selectedConversationId);
    });
    this.socket
      .on<ChatMessagePayload>('chat:message')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => this.receiveMessage(payload));
    this.socket
      .on<ChatTypingPayload>('chat:typing')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => {
        if (payload.conversationId === this.selectedConversationId)
          this.geminiTyping = payload.typing;
      });
    this.socket
      .on<ChatCorrectionsPayload>('chat:corrections')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => this.receiveCorrections(payload));
    this.socket
      .on<ChatErrorPayload>('chat:error')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((payload) => this.receiveError(payload));
    this.speech.listening$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((listening) => (this.isListening = listening));
    this.speech.transcribing$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((transcribing) => (this.isTranscribing = transcribing));
    this.speech.speaking$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((speaking) => {
      this.isSpeaking = speaking;
      if (!speaking) this.speakingMessageId = null;
    });
    this.speech.error$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((message) => (this.voiceError = message ?? ''));
    this.loadConversations();
  }

  get selectedConversation(): Conversation | undefined {
    return this.conversations.find(
      (conversation) => conversation.id === this.selectedConversationId,
    );
  }

  get selectedConversationEnded(): boolean {
    return !!this.selectedConversation?.ended_at;
  }

  ngAfterViewChecked(): void {
    if (!this.shouldScroll || !this.messageList) return;
    this.messageList.nativeElement.scrollTop = this.messageList.nativeElement.scrollHeight;
    this.shouldScroll = false;
  }

  ngOnDestroy(): void {
    this.stopVoice();
  }

  selectConversation(conversation: Conversation): void {
    if (this.selectedConversationId === conversation.id) {
      if (!this.loadingMessages) this.loadMessages(conversation.id);
      return;
    }
    this.stopVoice();
    this.messageControl.reset('');
    this.selectedConversationId = conversation.id;
    this.messages = this.optimisticMessagesFor(conversation.id);
    this.errorMessage = '';
    this.voiceError = '';
    this.geminiTyping = false;
    this.updateComposerAvailability();
    this.loadMessages(conversation.id);
    this.loadFeedback(conversation.id);
  }

  createConversation(initialTitle?: string, initialStarter?: string): void {
    if (this.creatingConversation) return;
    this.creatingConversation = true;
    this.errorMessage = '';
    this.chat
      .create('en', initialTitle || DEFAULT_CONVERSATION_TITLE)
      .pipe(
        finalize(() => (this.creatingConversation = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (conversation) => {
          this.conversations = [
            conversation,
            ...this.conversations.filter((item) => item.id !== conversation.id),
          ];
          this.selectConversation(conversation);
          if (initialStarter) {
            this.messageControl.setValue(initialStarter);
          }
        },
        error: () => (this.errorMessage = 'Could not create a conversation. Please try again.'),
      });
  }

  openRatingModal(): void {
    if (!this.selectedConversationId) return;
    this.showRatingModal = true;
    this.ratingSuccessMessage = '';
    if (this.existingFeedback) {
      this.ratingScore = this.existingFeedback.satisfaction_score;
      this.selectedRatingTags = [...this.existingFeedback.tags];
      this.ratingNotesControl.setValue(this.existingFeedback.notes || '');
    } else {
      this.ratingScore = 5;
      this.selectedRatingTags = [];
      this.ratingNotesControl.setValue('');
    }
  }

  closeRatingModal(): void {
    this.showRatingModal = false;
  }

  setRatingScore(score: number): void {
    this.ratingScore = score;
  }

  toggleRatingTag(tag: string): void {
    if (this.selectedRatingTags.includes(tag)) {
      this.selectedRatingTags = this.selectedRatingTags.filter((t) => t !== tag);
    } else {
      this.selectedRatingTags.push(tag);
    }
  }

  submitRating(): void {
    if (!this.selectedConversationId) return;
    this.savingRating = true;
    this.partner
      .saveFeedback({
        conversation_id: this.selectedConversationId,
        satisfaction_score: this.ratingScore,
        tags: this.selectedRatingTags,
        notes: this.ratingNotesControl.value.trim() || null,
      })
      .pipe(
        finalize(() => (this.savingRating = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (saved) => {
          this.existingFeedback = saved;
          this.ratingSuccessMessage = 'Thank you! Your feedback helps your Partner adapt.';
          setTimeout(() => {
            this.showRatingModal = false;
            this.ratingSuccessMessage = '';
          }, 1500);
        },
        error: () => {
          this.errorMessage = 'Could not save your rating. Please try again.';
        },
      });
  }

  private loadFeedback(conversationId: string): void {
    this.partner.getConversationFeedback(conversationId).subscribe({
      next: (feedback) => (this.existingFeedback = feedback),
      error: () => (this.existingFeedback = null),
    });
  }

  renameConversation(conversation: Conversation): void {
    if (this.conversationActionId || this.pendingTurn || typeof window === 'undefined') return;
    const requestedTitle = window.prompt('Conversation title', conversation.title);
    if (requestedTitle === null) return;
    const title = requestedTitle.trim();
    if (!title || title.length > MAX_TITLE_LENGTH) {
      this.errorMessage = `Conversation titles must contain 1-${MAX_TITLE_LENGTH} characters.`;
      return;
    }
    if (title === conversation.title) return;

    this.conversationActionId = conversation.id;
    this.errorMessage = '';
    this.chat
      .rename(conversation.id, title)
      .pipe(
        finalize(() => {
          if (this.conversationActionId === conversation.id) this.conversationActionId = null;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.conversations = this.conversations.map((item) =>
            item.id === updated.id ? updated : item,
          );
        },
        error: () => (this.errorMessage = 'Could not rename this conversation. Please try again.'),
      });
  }

  endConversation(conversation: Conversation): void {
    if (
      conversation.ended_at ||
      this.conversationActionId ||
      this.pendingTurn ||
      typeof window === 'undefined'
    )
      return;
    if (!window.confirm(`End “${conversation.title}”? You will not be able to send more messages.`))
      return;

    if (conversation.id === this.selectedConversationId) this.stopVoice();
    this.conversationActionId = conversation.id;
    this.errorMessage = '';
    this.chat
      .end(conversation.id)
      .pipe(
        finalize(() => {
          if (this.conversationActionId === conversation.id) this.conversationActionId = null;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.conversations = this.conversations.map((item) =>
            item.id === updated.id ? updated : item,
          );
          if (updated.id === this.selectedConversationId) this.updateComposerAvailability();
        },
        error: () => (this.errorMessage = 'Could not end this conversation. Please try again.'),
      });
  }

  deleteConversation(conversation: Conversation): void {
    if (this.conversationActionId || this.pendingTurn || typeof window === 'undefined') return;
    if (!window.confirm(`Delete “${conversation.title}” and all of its messages?`)) return;

    if (this.selectedConversationId === conversation.id) this.stopVoice();
    const deletedIndex = this.conversations.findIndex((item) => item.id === conversation.id);
    this.conversationActionId = conversation.id;
    this.errorMessage = '';
    this.chat
      .delete(conversation.id)
      .pipe(
        finalize(() => {
          if (this.conversationActionId === conversation.id) this.conversationActionId = null;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          const remaining = this.conversations.filter((item) => item.id !== conversation.id);
          this.conversations = remaining;
          for (const [clientMessageId, message] of this.optimisticMessages) {
            if (message.conversation_id === conversation.id)
              this.optimisticMessages.delete(clientMessageId);
          }
          if (this.selectedConversationId !== conversation.id) return;

          this.selectedConversationId = null;
          this.messageLoadRequestId += 1;
          this.loadingMessages = false;
          this.messages = [];
          this.messageControl.reset('');
          this.pendingTurn = false;
          this.geminiTyping = false;
          this.activeClientMessageId = null;
          this.updateComposerAvailability();
          const neighbor = remaining[Math.min(Math.max(deletedIndex, 0), remaining.length - 1)];
          if (neighbor) this.selectConversation(neighbor);
          else this.createConversation();
        },
        error: () => (this.errorMessage = 'Could not delete this conversation. Please try again.'),
      });
  }

  send(): void {
    const conversationId = this.selectedConversationId;
    const content = this.messageControl.value.trim();
    if (!conversationId || !content || !this.canSend()) return;

    const clientMessageId = this.newClientMessageId();
    const optimisticMessage: DisplayMessage = {
      id: `optimistic:${clientMessageId}`,
      conversation_id: conversationId,
      role: 'user',
      content,
      audio_url: null,
      timestamp: new Date().toISOString(),
      has_corrections: false,
      client_message_id: clientMessageId,
      reply_to_message_id: null,
      deliveryState: 'sending',
    };
    this.optimisticMessages.set(clientMessageId, optimisticMessage);
    this.messages = this.uniqueMessages([...this.messages, optimisticMessage]);
    this.activeClientMessageId = clientMessageId;
    this.pendingTurn = true;
    this.errorMessage = '';
    this.messageControl.reset('');
    this.shouldScroll = true;

    const sent = this.socket.emit('chat:send', { conversationId, content, clientMessageId });
    if (!sent) {
      this.setMessageDeliveryState(clientMessageId, 'failed');
      this.pendingTurn = false;
      this.geminiTyping = false;
      this.activeClientMessageId = null;
      this.errorMessage = 'The real-time connection is unavailable. Reconnect and try again.';
    }
  }

  /**
   * Handles the composer's native submit event.
   *
   * The form binds `submit` rather than `ngSubmit` because it has no `formGroup`: without a
   * `FormGroupDirective` or `NgForm` on the element, `ngSubmit` is not an output that Angular can
   * bind, so nothing would cancel the browser's native submission and the page would navigate away
   * instead of sending the message. Preventing the default here keeps the submit button working
   * while leaving its `type="submit"` semantics intact for keyboard and assistive technology.
   */
  handleSubmit(event: Event): void {
    event.preventDefault();
    this.send();
  }

  handleComposerKeydown(event: KeyboardEvent): void {
    if (event.isComposing || event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    this.send();
  }

  retry(message: DisplayMessage): void {
    const clientMessageId = message.client_message_id;
    if (message.deliveryState !== 'failed' || !clientMessageId) return;
    if (this.selectedConversationEnded) {
      this.errorMessage = 'This conversation has ended and cannot receive more messages.';
      return;
    }
    if (this.connectionState !== 'connected') {
      this.errorMessage = 'The real-time connection is unavailable. Reconnect and try again.';
      return;
    }
    if (this.pendingTurn) {
      this.errorMessage = 'Wait for the current response before retrying this message.';
      return;
    }

    const sent = this.socket.emit('chat:send', {
      conversationId: message.conversation_id,
      content: message.content,
      clientMessageId,
    });
    if (!sent) {
      this.errorMessage = 'The real-time connection is unavailable. Reconnect and try again.';
      return;
    }

    this.setMessageDeliveryState(clientMessageId, 'sending');
    this.activeClientMessageId = clientMessageId;
    this.pendingTurn = true;
    this.geminiTyping = false;
    this.errorMessage = '';
    this.shouldScroll = true;
  }

  canSend(): boolean {
    return (
      this.connectionState === 'connected' &&
      !this.pendingTurn &&
      !this.conversationActionId &&
      !this.listeningSessionActive &&
      !this.selectedConversationEnded &&
      !!this.messageControl.value.trim() &&
      this.messageControl.valid
    );
  }

  /**
   * Dictation intentionally does not require a live socket: it records locally and transcribes over
   * REST, and the transcript is reviewed in the composer before any send.
   */
  canStartListening(): boolean {
    return (
      this.recordingSupported &&
      !this.isTranscribing &&
      !!this.selectedConversationId &&
      !this.selectedConversationEnded &&
      !this.pendingTurn &&
      !this.conversationActionId
    );
  }

  toggleListening(): void {
    if (this.listeningSessionActive) {
      // The upload is already in flight; stopping again would discard a transcript being fetched.
      if (!this.isTranscribing) this.speech.stopListening();
      return;
    }
    if (!this.canStartListening()) return;

    this.stopSpeaking();
    this.voiceError = '';
    const conversationId = this.selectedConversationId;
    this.listeningSessionActive = true;
    let subscription: Subscription | null = null;
    subscription = this.speech
      .startListening()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (transcript) => {
          if (
            conversationId !== this.selectedConversationId ||
            !conversationId ||
            this.selectedConversationEnded
          )
            return;
          const draft = this.messageControl.value.trimEnd();
          const combinedTranscript = draft ? `${draft} ${transcript}` : transcript;
          if (combinedTranscript.length > 4000)
            this.voiceError = 'The transcript was shortened to the 4,000-character limit.';
          this.messageControl.setValue(combinedTranscript.slice(0, 4000));
          this.messageControl.markAsTouched();
        },
        error: (error: unknown) => {
          this.voiceError =
            error instanceof Error ? error.message : 'Dictation could not be completed.';
          this.finishListeningSubscription(subscription);
        },
        complete: () => this.finishListeningSubscription(subscription),
      });
    this.listeningSubscription = subscription.closed ? null : subscription;
    if (subscription.closed) this.listeningSessionActive = false;
  }

  toggleMessageSpeech(message: DisplayMessage): void {
    if (this.speakingMessageId === message.id) {
      this.stopSpeaking();
      return;
    }
    if (!this.synthesisSupported) return;
    this.cancelListening();
    this.voiceError = '';
    this.speech.speak(message.content);
    this.speakingMessageId = message.id;
  }

  isReadingMessage(message: DisplayMessage): boolean {
    return this.speakingMessageId === message.id;
  }

  updateReadRepliesAloud(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    this.readRepliesAloud = input?.checked ?? false;
    try {
      window.localStorage.setItem(AUTO_READ_STORAGE_KEY, String(this.readRepliesAloud));
    } catch {
      this.errorMessage = 'The read-aloud preference could not be saved in this browser.';
    }
    if (!this.readRepliesAloud) this.stopSpeaking();
  }

  trackConversation(_index: number, conversation: Conversation): string {
    return conversation.id;
  }

  trackMessage(_index: number, message: DisplayMessage): string {
    return message.id;
  }

  private loadConversations(): void {
    this.chat
      .list()
      .pipe(
        finalize(() => (this.loadingConversations = false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (conversations) => {
          this.conversations = [...conversations];
          const topicParam = this.route.snapshot.queryParams['topic'];
          const starterParam = this.route.snapshot.queryParams['starter'];

          if (topicParam) {
            const title = String(topicParam).slice(0, MAX_TITLE_LENGTH);
            this.createConversation(title, starterParam ? String(starterParam) : undefined);
            void this.router.navigate([], { queryParams: {}, replaceUrl: true });
          } else if (conversations[0]) {
            this.selectConversation(conversations[0]);
          } else {
            this.createConversation();
          }
        },
        error: () => (this.errorMessage = 'Could not load your conversations.'),
      });
  }

  private loadMessages(conversationId: string): void {
    const requestId = ++this.messageLoadRequestId;
    this.loadingMessages = true;
    this.chat
      .loadMessages(conversationId)
      .pipe(
        finalize(() => {
          if (
            requestId === this.messageLoadRequestId &&
            this.selectedConversationId === conversationId
          )
            this.loadingMessages = false;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (messages) => {
          if (
            requestId !== this.messageLoadRequestId ||
            this.selectedConversationId !== conversationId
          )
            return;

          const persistedClientMessageIds = new Set(
            messages
              .map((message) => message.client_message_id)
              .filter((clientMessageId): clientMessageId is string => !!clientMessageId),
          );
          for (const clientMessageId of persistedClientMessageIds)
            this.optimisticMessages.delete(clientMessageId);

          const receivedPersistedMessages = this.messages.filter(
            (message) => !message.deliveryState && message.conversation_id === conversationId,
          );
          this.messages = this.uniqueMessages([
            ...receivedPersistedMessages,
            ...messages,
            ...this.optimisticMessagesFor(conversationId),
          ]);
          this.shouldScroll = true;
        },
        error: () => {
          if (
            requestId === this.messageLoadRequestId &&
            this.selectedConversationId === conversationId
          )
            this.errorMessage = 'Could not load this conversation.';
        },
      });
  }

  private receiveMessage(payload: ChatMessagePayload): void {
    const clientMessageId = payload.clientMessageId ?? payload.message.client_message_id;
    if (payload.message.role === 'user' && clientMessageId) {
      this.optimisticMessages.delete(clientMessageId);
      this.messages = this.messages.filter(
        (message) => !message.deliveryState || message.client_message_id !== clientMessageId,
      );
    }

    if (payload.message.role === 'assistant' && clientMessageId === this.activeClientMessageId) {
      this.pendingTurn = false;
      this.geminiTyping = false;
      this.activeClientMessageId = null;
    }
    if (payload.message.conversation_id !== this.selectedConversationId) return;

    const messageAlreadyDisplayed = this.messages.some(
      (message) => message.id === payload.message.id,
    );
    this.messages = this.uniqueMessages([...this.messages, payload.message]);
    this.shouldScroll = true;
    if (
      payload.message.role === 'assistant' &&
      !messageAlreadyDisplayed &&
      !this.selectedConversationEnded &&
      this.readRepliesAloud &&
      this.synthesisSupported &&
      !this.spokenMessageIds.has(payload.message.id)
    ) {
      this.spokenMessageIds.add(payload.message.id);
      this.cancelListening();
      this.speech.speak(payload.message.content);
      this.speakingMessageId = payload.message.id;
    }
  }

  /** Attaches the tutor's corrections to the user message they describe. */
  private receiveCorrections(payload: ChatCorrectionsPayload): void {
    if (payload.conversationId !== this.selectedConversationId) return;
    if (!payload.corrections.length) return;
    this.correctionsByMessageId.set(payload.messageId, payload.corrections);
    this.shouldScroll = true;
  }

  /** Corrections to render under a message, if any arrived during this session. */
  correctionsFor(message: DisplayMessage): Correction[] {
    return this.correctionsByMessageId.get(message.id) ?? [];
  }

  trackCorrection(_index: number, correction: Correction): string {
    return correction.id;
  }

  private receiveError(payload: ChatErrorPayload): void {
    const clientMessageId = payload.clientMessageId;
    const optimisticMessage = clientMessageId
      ? this.optimisticMessages.get(clientMessageId)
      : undefined;
    const matchesActiveTurn = !!clientMessageId && clientMessageId === this.activeClientMessageId;

    if (payload.code === 'CONVERSATION_ENDED' && payload.conversationId) {
      const endedAt = new Date().toISOString();
      this.conversations = this.conversations.map((conversation) =>
        conversation.id === payload.conversationId && !conversation.ended_at
          ? { ...conversation, ended_at: endedAt }
          : conversation,
      );
      if (payload.conversationId === this.selectedConversationId) {
        this.cancelListening();
        this.updateComposerAvailability();
      }
    }

    if (clientMessageId) this.setMessageDeliveryState(clientMessageId, 'failed');
    if (matchesActiveTurn) {
      this.pendingTurn = false;
      this.activeClientMessageId = null;
    }
    if (payload.conversationId && payload.conversationId !== this.selectedConversationId) return;
    if (clientMessageId && !matchesActiveTurn && !optimisticMessage) return;

    this.errorMessage = payload.message || 'The message could not be sent.';
    this.pendingTurn = false;
    this.geminiTyping = false;
  }

  private setMessageDeliveryState(
    clientMessageId: string,
    deliveryState: NonNullable<DisplayMessage['deliveryState']>,
  ): void {
    const optimisticMessage = this.optimisticMessages.get(clientMessageId);
    if (optimisticMessage) {
      const updatedMessage: DisplayMessage = { ...optimisticMessage, deliveryState };
      this.optimisticMessages.set(clientMessageId, updatedMessage);
    }
    this.messages = this.messages.map((message) =>
      message.role === 'user' && message.client_message_id === clientMessageId
        ? { ...message, deliveryState }
        : message,
    );
  }

  private optimisticMessagesFor(conversationId: string): DisplayMessage[] {
    return Array.from(this.optimisticMessages.values()).filter(
      (message) => message.conversation_id === conversationId,
    );
  }

  private uniqueMessages(messages: DisplayMessage[]): DisplayMessage[] {
    const uniqueMessages = new Map<string, DisplayMessage>();
    for (const message of messages) {
      const key =
        message.role === 'user' && message.client_message_id
          ? `client:${message.client_message_id}`
          : `id:${message.id}`;
      const existing = uniqueMessages.get(key);
      if (!existing || existing.deliveryState || !message.deliveryState)
        uniqueMessages.set(key, message);
    }

    return Array.from(uniqueMessages.values()).sort(
      (left, right) =>
        left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id),
    );
  }

  private updateComposerAvailability(): void {
    if (!this.selectedConversation || this.selectedConversationEnded)
      this.messageControl.disable({ emitEvent: false });
    else this.messageControl.enable({ emitEvent: false });
  }

  private cancelListening(): void {
    this.listeningSubscription?.unsubscribe();
    this.listeningSubscription = null;
    this.listeningSessionActive = false;
    this.speech.abortListening();
  }

  private stopSpeaking(): void {
    this.speech.stopSpeaking();
    this.speakingMessageId = null;
  }

  private stopVoice(): void {
    this.cancelListening();
    this.stopSpeaking();
  }

  private finishListeningSubscription(subscription: Subscription | null): void {
    if (subscription && this.listeningSubscription !== subscription) return;
    this.listeningSubscription = null;
    this.listeningSessionActive = false;
  }

  private loadAutoReadPreference(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(AUTO_READ_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  }

  private newClientMessageId(): string {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
