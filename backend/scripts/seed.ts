import 'dotenv/config';
import { supabase } from '../src/config/supabase.config.js';
import { DatabaseService } from '../src/services/database.service.js';

const email = 'test@example.com';
const password = 'testpass123';
const name = 'Test User';

async function seed(): Promise<void> {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  let authUser = listed.users.find((user) => user.email === email);
  if (!authUser) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw error ?? new Error('Unable to create seed auth user');
    authUser = data.user;
  }
  const database = new DatabaseService(supabase);
  let user = await database.getUser(authUser.id);
  if (!user) user = await database.createUser(authUser.id, email, name);
  let progress = await database.getUserProgress(user.id);
  if (!progress) progress = await database.createUserProgress(user.id);
  const conversations = await database.getUserConversations(user.id, 1);
  if (conversations.length === 0) {
    const conversation = await database.createConversation(user.id, 'en');
    const message = await database.saveMessage(
      conversation.id,
      'user',
      'She go to school every day.',
    );
    await database.saveMessage(
      conversation.id,
      'assistant',
      'Almost! Say: She goes to school every day.',
    );
    await database.saveCorrection(
      message.id,
      user.id,
      'grammar',
      'She go',
      'She goes',
      'Use third-person singular -s in the present simple.',
    );
    await database.markMessageWithCorrections(message.id);
    await database.incrementConversationCount(user.id);
  }
  console.info(`Seed complete for ${email} (${user.id})`);
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
