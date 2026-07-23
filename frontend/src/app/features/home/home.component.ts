import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `<section class="hero">
    <p class="eyebrow">English practice, made conversational</p>
    <h1>Build confidence one conversation at a time.</h1>
    <p>Secure accounts and real-time connectivity are ready for the voice learning experience.</p>
    <a class="cta" routerLink="/signup">Get started</a>
  </section>`,
})
export class HomeComponent {}
