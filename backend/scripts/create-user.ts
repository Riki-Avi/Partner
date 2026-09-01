import 'dotenv/config';
import { supabase } from '../src/config/supabase.config.js';
import { DatabaseService } from '../src/services/database.service.js';

const email = 'asd@gmail.com';
const password = 'asd';
const name = 'asd';

async function createUserAccount(): Promise<void> {
  const { data: listed, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;
  let authUser = listed.users.find((u) => u.email === email);

  if (authUser) {
    console.info(
      `User ${email} already exists in Supabase Auth (${authUser.id}). Updating password...`,
    );
    const { error: updateError } = await supabase.auth.admin.updateUserById(authUser.id, {
      password,
      email_confirm: true,
    });
    if (updateError) {
      console.warn('Could not update password directly (length policy?):', updateError.message);
    }
  } else {
    console.info(`Creating user ${email}...`);
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) {
      console.warn('Error creating user with password:', error?.message);
      // If Supabase enforces min 6 chars password policy, let's try with fallback or inspect
      throw error ?? new Error('Failed to create auth user');
    }
    authUser = data.user;
  }

  const database = new DatabaseService(supabase);
  let user = await database.getUser(authUser.id);
  if (!user) {
    user = await database.createUser(authUser.id, email, name);
    await database.createUserProgress(user.id);
  }
  console.info(`Account ready for ${email} / password: "${password}" (User ID: ${user.id})`);
}

createUserAccount().catch((err: unknown) => {
  console.error('Create user failed:', err);
  process.exitCode = 1;
});
