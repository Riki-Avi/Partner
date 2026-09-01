import { Component, OnInit, inject, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdventureService } from '../../core/services/adventure.service';
import { SpeechService } from '../../core/services/speech.service';
import type { AdventureCharacter, AdventureTurn, StoryAdventure } from '@voice-chat/shared';

@Component({
  selector: 'app-adventure',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './adventure.component.html',
  styleUrls: ['./adventure.component.css'],
})
export class AdventureComponent implements OnInit, AfterViewChecked {
  private readonly adventureService = inject(AdventureService);
  readonly speech = inject(SpeechService);

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  adventure: StoryAdventure | null = null;
  loading = true;
  submitting = false;
  resetting = false;
  error: string | null = null;
  userInput = '';
  shouldScrollToBottom = false;

  speakingTurnId: string | null = null;

  ngOnInit(): void {
    this.loadActiveAdventure();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  loadActiveAdventure(): void {
    this.loading = true;
    this.error = null;
    this.adventureService.getCurrent().subscribe({
      next: (adv) => {
        this.adventure = adv;
        this.loading = false;
        this.shouldScrollToBottom = true;
      },
      error: (err) => {
        this.error = err.message || 'Could not load adventure. Please try again.';
        this.loading = false;
      },
    });
  }

  sendTurn(textToSend?: string): void {
    const text = (textToSend ?? this.userInput).trim();
    if (!text || this.submitting || !this.adventure) return;

    this.submitting = true;
    this.error = null;
    this.userInput = '';

    // Optimistically push user turn
    const tempUserTurn: AdventureTurn = {
      id: `temp-${Date.now()}`,
      adventure_id: this.adventure.id,
      speaker_role: 'user',
      speaker_name: 'You',
      content: text,
      timestamp: new Date().toISOString(),
    };
    this.adventure.turns.push(tempUserTurn);
    this.shouldScrollToBottom = true;

    this.adventureService.sendTurn(text).subscribe({
      next: (res) => {
        this.adventure = res.adventure;
        this.submitting = false;
        this.shouldScrollToBottom = true;
      },
      error: (err) => {
        this.error = err.message || 'Failed to send your action. Please retry.';
        this.submitting = false;
      },
    });
  }

  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendTurn();
    }
  }

  selectChip(chip: string): void {
    const cleaned = chip.replace(/^["']|["']$/g, '');
    this.sendTurn(cleaned);
  }

  resetStory(): void {
    if (this.resetting) return;
    if (!confirm('Start a fresh adventure tailored to your latest chats and focus areas?')) return;

    this.resetting = true;
    this.error = null;
    this.adventureService.resetAdventure().subscribe({
      next: (adv) => {
        this.adventure = adv;
        this.resetting = false;
        this.shouldScrollToBottom = true;
      },
      error: (err) => {
        this.error = err.message || 'Failed to generate a new story. Please retry.';
        this.resetting = false;
      },
    });
  }

  playAudio(turn: AdventureTurn): void {
    if (this.speakingTurnId === turn.id) {
      this.speech.stopSpeaking();
      this.speakingTurnId = null;
      return;
    }

    this.speakingTurnId = turn.id;
    this.speech.speak(turn.content);

    // Reset indicator when done speaking
    setTimeout(
      () => {
        if (this.speakingTurnId === turn.id) {
          this.speakingTurnId = null;
        }
      },
      Math.max(3000, turn.content.length * 75),
    );
  }

  getCharacter(turn: AdventureTurn): AdventureCharacter | undefined {
    return (
      this.adventure?.characters.find(
        (c) => c.name.toLowerCase() === turn.speaker_name.toLowerCase(),
      ) ?? this.adventure?.characters.find((c) => c.role === turn.speaker_role)
    );
  }

  getRoleBadge(role: string): string {
    switch (role) {
      case 'guide':
        return '🧙‍♂️ Guide & Mentor';
      case 'playful':
        return '🦊 Playful Scout';
      case 'serious':
        return '⚔️ Stoic Warrior';
      case 'narrator':
        return '📜 Story Master';
      default:
        return '👤 Companion';
    }
  }

  private scrollToBottom(): void {
    if (this.scrollContainer) {
      const el = this.scrollContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}
