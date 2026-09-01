export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/api',
  socketUrl: 'http://localhost:3000',
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_ANON_KEY',
  // Development only. Must match AUTH_BYPASS in the backend environment: when true the app skips
  // login and the backend serves every request as its configured development user.
  authBypass: false,
};
