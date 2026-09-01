import type { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { HomeComponent } from './features/home/home.component';
import { LoginComponent } from './features/auth/components/login/login.component';
import { SignupComponent } from './features/auth/components/signup/signup.component';
import { ProfileComponent } from './features/profile/profile.component';
import { ChatComponent } from './features/chat/chat.component';
import { PartnerComponent } from './features/partner/partner.component';
import { PhrasesComponent } from './features/phrases/phrases.component';
import { StudyComponent } from './features/study/study.component';
import { AdventureComponent } from './features/adventure/adventure.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'profile', component: ProfileComponent, canActivate: [AuthGuard] },
  { path: 'partner', component: PartnerComponent, canActivate: [AuthGuard] },
  { path: 'adventure', component: AdventureComponent, canActivate: [AuthGuard] },
  { path: 'chat', component: ChatComponent, canActivate: [AuthGuard] },
  { path: 'study', component: StudyComponent, canActivate: [AuthGuard] },
  { path: 'phrases', component: PhrasesComponent, canActivate: [AuthGuard] },
  { path: '**', redirectTo: '' },
];
