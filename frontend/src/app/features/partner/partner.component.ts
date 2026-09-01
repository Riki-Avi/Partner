import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { PartnerHubSummary, PartnerRecommendation, PartnerTone } from '@voice-chat/shared';
import { PartnerService } from '../../core/services/partner.service';
import { AuthService } from '../../core/services/auth.service';

export interface InterestOption {
  id: string;
  label: string;
  emoji: string;
}

export interface ToneOption {
  id: PartnerTone;
  label: string;
  description: string;
  emoji: string;
}

@Component({
  selector: 'app-partner',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './partner.component.html',
  styleUrl: './partner.component.css',
})
export class PartnerComponent implements OnInit {
  private readonly partnerService = inject(PartnerService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly availableInterests: InterestOption[] = [
    { id: 'tech-ai', label: 'Tech & AI', emoji: '🤖' },
    { id: 'movies-series', label: 'Movies & Series', emoji: '🎬' },
    { id: 'music', label: 'Music & Concerts', emoji: '🎵' },
    { id: 'travel', label: 'Travel & Adventures', emoji: '✈️' },
    { id: 'gaming', label: 'Video Games', emoji: '🎮' },
    { id: 'food-cooking', label: 'Food & Cooking', emoji: '🍕' },
    { id: 'books', label: 'Books & Stories', emoji: '📚' },
    { id: 'sports-fitness', label: 'Sports & Fitness', emoji: '🏃' },
    { id: 'business', label: 'Business & Startups', emoji: '💼' },
    { id: 'science', label: 'Science & Space', emoji: '🚀' },
    { id: 'daily-life', label: 'Daily Life & Routines', emoji: '☕' },
    { id: 'art-culture', label: 'Art & Photography', emoji: '🎨' },
  ];

  readonly toneOptions: ToneOption[] = [
    {
      id: 'friendly',
      label: 'Warm & Friendly',
      description: 'Encouraging, smiling, easy to chat with.',
      emoji: '😊',
    },
    {
      id: 'casual',
      label: 'Chill & Casual',
      description: 'Natural slang, relaxed pacing, like a friend at a cafe.',
      emoji: '🤙',
    },
    {
      id: 'intellectual',
      label: 'Curious & Analytical',
      description: 'Loves deep questions, philosophical debates, and insights.',
      emoji: '🧐',
    },
    {
      id: 'supportive',
      label: 'Patient & Gentle',
      description: 'Takes it step-by-step, builds confidence with warm praise.',
      emoji: '🌱',
    },
    {
      id: 'professional',
      label: 'Polished & Professional',
      description: 'Focuses on workplace fluency, networking, and formal English.',
      emoji: '👔',
    },
  ];

  summary: PartnerHubSummary | null = null;
  loading = true;
  refreshing = false;
  savingPreferences = false;
  actionRecommendationId: string | null = null;
  errorMessage = '';
  successMessage = '';

  selectedInterests: string[] = [];
  selectedTone: PartnerTone = 'friendly';
  readonly customTopicControl = new FormControl('', { nonNullable: true });
  readonly customInterestInput = new FormControl('', { nonNullable: true });

  currentUser$ = this.auth.currentUser$;

  ngOnInit(): void {
    this.loadHub();
  }

  loadHub(): void {
    this.loading = true;
    this.errorMessage = '';
    this.partnerService.getSummary().subscribe({
      next: (summary) => {
        this.summary = summary;
        this.selectedInterests = [...summary.preferences.interests];
        this.selectedTone = summary.preferences.tone;
        this.customTopicControl.setValue(summary.preferences.custom_topics || '');
        this.loading = false;
      },
      error: (err) => {
        console.error('Failed to load partner hub', err);
        this.errorMessage = 'Could not load your Partner recommendations. Please try again.';
        this.loading = false;
      },
    });
  }

  isInterestSelected(id: string): boolean {
    return this.selectedInterests.includes(id);
  }

  toggleInterest(id: string): void {
    if (this.isInterestSelected(id)) {
      this.selectedInterests = this.selectedInterests.filter((item) => item !== id);
    } else {
      if (this.selectedInterests.length >= 15) return;
      this.selectedInterests.push(id);
    }
  }

  addCustomInterest(): void {
    const raw = this.customInterestInput.value.trim();
    if (!raw) return;
    if (!this.selectedInterests.includes(raw)) {
      this.selectedInterests.push(raw);
    }
    this.customInterestInput.setValue('');
  }

  removeInterest(interest: string): void {
    this.selectedInterests = this.selectedInterests.filter((item) => item !== interest);
  }

  selectTone(tone: PartnerTone): void {
    this.selectedTone = tone;
  }

  savePreferences(): void {
    this.savingPreferences = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.partnerService
      .updatePreferences({
        interests: this.selectedInterests,
        tone: this.selectedTone,
        custom_topics: this.customTopicControl.value.trim(),
      })
      .subscribe({
        next: (updatedPrefs) => {
          if (this.summary) {
            this.summary.preferences = updatedPrefs;
          }
          this.savingPreferences = false;
          this.successMessage = 'Preferences saved! Refreshing recommendations…';
          this.refreshRecommendations();
        },
        error: (err) => {
          console.error('Failed to update preferences', err);
          this.errorMessage = 'Failed to save preferences.';
          this.savingPreferences = false;
        },
      });
  }

  refreshRecommendations(): void {
    this.refreshing = true;
    this.errorMessage = '';
    this.partnerService.refreshRecommendations().subscribe({
      next: (recommendations) => {
        if (this.summary) {
          this.summary.recommendations = recommendations;
        }
        this.refreshing = false;
        this.successMessage = 'Fresh personalized recommendations ready!';
        setTimeout(() => (this.successMessage = ''), 4000);
      },
      error: (err) => {
        console.error('Failed to refresh recommendations', err);
        this.errorMessage = 'Failed to generate new recommendations. Please try again.';
        this.refreshing = false;
      },
    });
  }

  toggleFavorite(rec: PartnerRecommendation): void {
    this.actionRecommendationId = rec.id;
    this.partnerService.toggleFavorite(rec.id).subscribe({
      next: (updated) => {
        if (this.summary) {
          this.summary.recommendations = this.summary.recommendations.map((r) =>
            r.id === updated.id ? updated : r,
          );
        }
        this.actionRecommendationId = null;
      },
      error: (err) => {
        console.error('Failed to toggle favorite', err);
        this.actionRecommendationId = null;
      },
    });
  }

  startChat(rec: PartnerRecommendation): void {
    // Navigate to /chat with the recommendation starter query parameters
    void this.router.navigate(['/chat'], {
      queryParams: {
        topic: rec.title,
        starter: rec.starter_prompt,
        category: rec.category,
      },
    });
  }

  greetingMessage(name?: string): string {
    const hour = new Date().getHours();
    const displayName = name ? `, ${name}` : '';
    if (hour < 12) return `Good morning${displayName}! What should we talk about today?`;
    if (hour < 18) return `Good afternoon${displayName}! Ready for an English practice break?`;
    return `Good evening${displayName}! Let's wind down with a nice conversation.`;
  }

  categoryLabel(cat: string): string {
    switch (cat) {
      case 'roleplay':
        return '🎭 Roleplay & Scenario';
      case 'challenge':
        return '🎯 Daily Challenge';
      case 'debate':
        return '⚖️ Friendly Debate';
      case 'casual':
        return '☕ Casual Talk';
      default:
        return '💡 Topic of Interest';
    }
  }

  categoryClass(cat: string): string {
    return `cat-${cat}`;
  }

  starRatingString(score: number): string {
    const rounded = Math.round(score);
    return '★'.repeat(rounded) + '☆'.repeat(Math.max(0, 5 - rounded));
  }
}
