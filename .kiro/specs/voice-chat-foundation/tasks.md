# Implementation Plan: Voice Chat Foundation (Phase 1)

## Overview

This implementation plan breaks down Phase 1 of the voice-based English learning chat application into discrete, actionable tasks. Phase 1 establishes the foundational infrastructure including:

- Monorepo structure with Angular frontend, Node.js/Express backend, and shared TypeScript types
- Supabase database with complete schema and Row Level Security
- User authentication system with JWT tokens
- WebSocket communication using Socket.IO with authentication
- Development tooling and comprehensive documentation

Each task is designed to produce working, testable functionality. The implementation follows a test-driven approach where core functionality is validated through code early in the development process.

**Technology Stack:**
- Frontend: Angular 18+, TypeScript 5+, RxJS, Socket.IO client
- Backend: Node.js 20+, Express, TypeScript, Socket.IO server
- Database: Supabase (PostgreSQL with Row Level Security)
- Development: ESLint, Prettier, Concurrently, Nodemon

## Tasks

### Task 1: Project Setup and Monorepo Structure

- [x] 1.1 Initialize monorepo structure
  - Create root directory structure: `frontend/`, `backend/`, `shared/`
  - Initialize root `package.json` with workspace configuration
  - Add npm scripts: `dev`, `dev:frontend`, `dev:backend`, `build`, `test`, `lint`
  - Install `concurrently` as dev dependency for running multiple processes
  - Create `.gitignore` with Node.js, Angular, and IDE exclusions
  - _Requirements: 1.1, 1.6_

- [x] 1.2 Initialize Angular frontend application
  - Run `ng new frontend --strict --routing --style=css --skip-git`
  - Configure TypeScript `tsconfig.json` with strict mode and path mapping for shared types
  - Install Socket.IO client: `npm install socket.io-client`
  - Install RxJS operators (included with Angular)
  - Create `environment.example.ts` with placeholders for API URL and Supabase config
  - Configure Angular to serve on port 4200
  - _Requirements: 1.2, 1.7_

- [x] 1.3 Initialize Node.js/Express backend application
  - Create `backend/` directory and run `npm init -y`
  - Install dependencies: `express`, `cors`, `dotenv`, `@supabase/supabase-js`, `socket.io`
  - Install dev dependencies: `typescript`, `ts-node`, `nodemon`, `@types/node`, `@types/express`, `@types/cors`
  - Create `tsconfig.json` with strict mode and ES modules configuration
  - Create `src/` directory structure: `config/`, `controllers/`, `middleware/`, `routes/`, `services/`, `models/`
  - Create `.env.example` with placeholders for PORT, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY, FRONTEND_URL
  - Add npm scripts: `dev` (nodemon), `build` (tsc), `start` (node dist/index.js)
  - _Requirements: 1.3, 1.7_

- [x] 1.4 Initialize shared types package
  - Create `shared/` directory with `package.json`
  - Create `types/` subdirectory for TypeScript interfaces
  - Create placeholder files: `auth.types.ts`, `database.types.ts`, `socket-events.types.ts`
  - Create `index.ts` to export all types
  - Configure `tsconfig.json` for declaration file generation
  - Add npm script: `build` (tsc)
  - _Requirements: 1.5_

- [x] 1.5 Configure ESLint and Prettier
  - Install ESLint and Prettier in root: `npm install --save-dev eslint prettier eslint-config-prettier`
  - Create `.eslintrc.json` with TypeScript rules for both frontend and backend
  - Create `.prettierrc` with consistent formatting rules (2 spaces, single quotes, trailing commas)
  - Add lint scripts to root `package.json`: `lint:frontend`, `lint:backend`, `lint` (runs both)
  - Configure ESLint to work with Angular and Node.js/Express
  - _Requirements: 1.4_

- [x] 1.6 Create comprehensive README.md
  - Document prerequisites: Node.js 20+, npm, Angular CLI, Supabase account
  - Provide step-by-step installation instructions
  - Explain monorepo structure and purpose of each directory
  - Document environment variables for frontend and backend
  - Include instructions for Supabase setup
  - Add troubleshooting section for common setup issues
  - Document all npm scripts and their purposes
  - Include expected outcomes: Frontend at :4200, Backend at :3000
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [ ]* 1.7 Write integration test for development setup
  - Test that `npm run dev` starts both frontend and backend servers
  - Verify frontend serves Angular default page at http://localhost:4200
  - Verify backend responds with "Hello World" at http://localhost:3000/health
  - Test that hot-reload works for both frontend and backend changes
  - _Requirements: 1.6, 5.8_

- [ ] 1.8 Checkpoint - Verify project structure
  - Ensure all tests pass
  - Verify `npm run dev` starts both servers successfully
  - Verify README instructions are clear and complete
  - Ask user if any questions arise

### Task 2: Database Schema and Supabase Configuration

- [x] 2.1 Create database migration file
  - Create `backend/migrations/` directory
  - Create `001_initial_schema.sql` with complete schema
  - Include tables: users, conversations, messages, corrections, user_progress
  - Include all indexes for optimized queries
  - Include all foreign key constraints with CASCADE delete
  - Include CHECK constraints for enum values (e.g., role IN ('user', 'assistant'))
  - Add detailed comments explaining each table and field
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2.2 Configure Row Level Security policies
  - Add RLS policies to migration file
  - Enable RLS on all tables: users, conversations, messages, corrections, user_progress
  - Create SELECT policies: users can only read their own data
  - Create INSERT policies: users can only insert their own data
  - Create UPDATE policies: users can only update their own data
  - Create policies for joined tables (messages through conversations, corrections through messages)
  - Add comments explaining each policy
  - _Requirements: 2.6_

- [x] 2.3 Document migration execution process
  - Update README with Supabase setup section
  - Document how to create a Supabase project
  - Provide instructions for obtaining Supabase URL and keys
  - Document how to run migration in Supabase SQL Editor
  - Include screenshots or detailed steps
  - Add troubleshooting tips for common migration issues
  - _Requirements: 5.1, 5.5_

- [x] 2.4 Configure Supabase client in backend
  - Install `@supabase/supabase-js` in backend
  - Create `backend/src/config/supabase.config.ts`
  - Initialize Supabase client using environment variables (SUPABASE_URL, SUPABASE_SERVICE_KEY)
  - Export configured client for use in services
  - Add error handling for missing configuration
  - _Requirements: 2.7_

- [x] 2.5 Implement DatabaseService with CRUD methods
  - Create `backend/src/services/database.service.ts`
  - Implement user operations: `createUser()`, `getUser()`, `updateUserLevel()`
  - Implement conversation operations: `createConversation()`, `getConversation()`, `getUserConversations()`, `endConversation()`
  - Implement message operations: `saveMessage()`, `getConversationMessages()`, `markMessageWithCorrections()`
  - Implement correction operations: `saveCorrection()`, `getMessageCorrections()`
  - Implement progress operations: `getUserProgress()`, `updateUserProgress()`, `incrementConversationCount()`, `addTimeToProgress()`
  - Add comprehensive error handling with custom error classes
  - Add TypeScript types for all method parameters and return values
  - _Requirements: 2.7_

- [ ]* 2.6 Write unit tests for DatabaseService
  - Mock Supabase client using Jest
  - Test successful CRUD operations for all entities
  - Test error handling (database errors, not found errors)
  - Test that methods call Supabase with correct parameters
  - Verify error messages are clear and actionable
  - _Requirements: 2.7_

- [x] 2.7 Create database seed script
  - Create `backend/scripts/seed.ts`
  - Create test user with known credentials (email: test@example.com, password: testpass123, name: Test User)
  - Create sample conversation for test user
  - Create sample messages in the conversation
  - Create sample corrections for messages
  - Create user progress record for test user
  - Add script to package.json: `seed` (ts-node scripts/seed.ts)
  - Document seed script usage in README
  - _Requirements: 2.8_

- [ ]* 2.8 Write integration test for database operations
  - Test creating a user via DatabaseService
  - Test retrieving user data
  - Test RLS enforcement (attempt to access other user's data should fail)
  - Verify seed script creates expected test data
  - Verify test data is visible in Supabase dashboard
  - _Requirements: 2.8_

- [x] 2.9 Checkpoint - Verify database setup
  - Run migration in Supabase SQL Editor
  - Run seed script to populate test data
  - Verify all tests pass
  - Check Supabase dashboard to confirm tables and data exist
  - Ask user if any questions arise

### Task 3: Backend Authentication Implementation

- [x] 3.1 Create shared authentication types
  - Create `shared/types/auth.types.ts`
  - Define interfaces: `SignupRequest`, `LoginRequest`, `AuthResponse`, `ErrorResponse`, `AuthRequest`
  - Export all types from `shared/index.ts`
  - Update backend and frontend to import from shared package
  - _Requirements: 3.1, 3.2_

- [x] 3.2 Implement custom error classes
  - Create `backend/src/middleware/error.middleware.ts`
  - Define custom error classes: `ValidationError`, `NotFoundError`, `UnauthorizedError`, `DatabaseError`
  - Each error class should include statusCode property
  - Add error middleware function to catch and format all errors
  - Map error types to appropriate HTTP status codes
  - Return consistent error response format
  - Log errors with stack trace in development, sanitize in production
  - _Requirements: 3.5, 3.6_

- [x] 3.3 Implement authentication middleware
  - Create `backend/src/middleware/auth.middleware.ts`
  - Extract JWT token from Authorization header (format: "Bearer <token>")
  - Verify token with Supabase Auth client
  - Extract userId from verified token payload
  - Attach userId to request object (extend Express Request type)
  - Handle errors: missing token, invalid token, expired token
  - Call next() on successful verification
  - _Requirements: 3.8_

- [x] 3.4 Implement AuthController
  - Create `backend/src/controllers/auth.controller.ts`
  - Implement `signup()`: validate input, create user in Supabase Auth, create user record in database, return user + token
  - Implement `login()`: validate input, authenticate with Supabase Auth, fetch user from database, return user + token
  - Implement `logout()`: invalidate session in Supabase Auth, return success message
  - Implement `getMe()`: retrieve authenticated user's data from database using userId from request
  - Handle all errors appropriately (duplicate email, invalid credentials, not found)
  - Return consistent response format for all endpoints
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [x] 3.5 Create authentication routes
  - Create `backend/src/routes/auth.routes.ts`
  - Define routes: POST /api/auth/signup, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
  - Apply authMiddleware to protected routes (/api/auth/me)
  - Wire up routes to AuthController methods
  - Export router for integration in main app
  - _Requirements: 3.7_

- [x] 3.6 Integrate authentication into Express app
  - Update `backend/src/index.ts`
  - Configure Express with JSON body parser, CORS (allow frontend origin), and error middleware
  - Mount auth routes at /api/auth
  - Create health check endpoint: GET /health (returns { status: 'ok' })
  - Start Express server on port from environment variable (default: 3000)
  - Add graceful shutdown handling
  - _Requirements: 3.7, 5.9_

- [ ]* 3.7 Write unit tests for AuthController
  - Mock DatabaseService and Supabase Auth client
  - Test signup: successful signup, duplicate email error, validation errors
  - Test login: successful login, invalid credentials error
  - Test logout: successful logout
  - Test getMe: returns user data, handles not found
  - Verify correct HTTP status codes and response formats
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ]* 3.8 Write integration tests for authentication flow
  - Use Supertest to test actual HTTP endpoints
  - Test signup with valid data → 201 with user + token
  - Test signup with duplicate email → 409 error
  - Test login with valid credentials → 200 with user + token
  - Test login with invalid credentials → 401 error
  - Test accessing /api/auth/me without token → 401 error
  - Test accessing /api/auth/me with valid token → 200 with user data
  - Test accessing /api/auth/me with invalid token → 401 error
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 3.9 Checkpoint - Verify backend authentication
  - Ensure all tests pass
  - Test endpoints manually with Postman or curl
  - Verify signup → login → getMe flow works end-to-end
  - Verify error handling for invalid inputs and unauthorized access
  - Ask user if any questions arise

### Task 4: Frontend Authentication UI and Services

- [x] 4.1 Configure shared types in frontend
  - Update `frontend/tsconfig.json` to include path mapping for shared package
  - Add paths configuration: `"@shared/*": ["../shared/*"]`
  - Verify frontend can import types from shared package
  - _Requirements: 1.5_

- [x] 4.2 Implement API service base
  - Create `frontend/src/app/core/services/api.service.ts`
  - Inject Angular HttpClient
  - Provide base methods: `get()`, `post()`, `put()`, `delete()`
  - Add proper TypeScript generics for type-safe responses
  - Configure base URL from environment
  - _Requirements: 3.9_

- [x] 4.3 Implement AuthService
  - Create `frontend/src/app/core/services/auth.service.ts`
  - Create BehaviorSubject for currentUser (User | null)
  - Expose Observable: `currentUser$`, `isAuthenticated$` (derived from currentUser$)
  - Implement `signup()`: POST /api/auth/signup, store token, update currentUser
  - Implement `login()`: POST /api/auth/login, store token, update currentUser
  - Implement `logout()`: POST /api/auth/logout, clear token, reset currentUser
  - Implement `getMe()`: GET /api/auth/me, update currentUser
  - Implement token management: `getToken()`, `setToken()`, `clearToken()` (use localStorage key: 'voice_chat_token')
  - Implement `checkAuthStatus()`: restore session on app init by validating token with getMe()
  - _Requirements: 3.9, 3.10, 3.12_

- [x] 4.4 Implement AuthGuard
  - Create `frontend/src/app/guards/auth.guard.ts`
  - Check AuthService.isAuthenticated$
  - If authenticated: allow navigation (return true)
  - If not authenticated: redirect to /login (return false)
  - Use Angular Router for navigation
  - _Requirements: 3.10_

- [x] 4.5 Implement AuthInterceptor
  - Create `frontend/src/app/interceptors/auth.interceptor.ts`
  - Intercept outgoing HTTP requests
  - Get token from AuthService
  - If token exists and request is to API: clone request and add Authorization header (format: "Bearer <token>")
  - Pass cloned request to next handler
  - Catch 401 errors → trigger AuthService.logout() and redirect to /login
  - _Requirements: 3.11_

- [x] 4.6 Create LoginComponent
  - Generate component: `ng generate component features/auth/components/login`
  - Create reactive form with fields: email (required, email validation), password (required, minLength: 8)
  - Add form submission handler: call AuthService.login()
  - Display loading state during API call
  - On success: navigate to /profile
  - On error: display error message from API response
  - Add link to signup page
  - Style with clean, minimal CSS
  - _Requirements: 3.12_

- [x] 4.7 Create SignupComponent
  - Generate component: `ng generate component features/auth/components/signup`
  - Create reactive form with fields: name (required), email (required, email validation), password (required, minLength: 8), confirmPassword (required)
  - Add custom validator: passwords must match
  - Add form submission handler: call AuthService.signup()
  - Display loading state during API call
  - On success: navigate to /profile
  - On error: display error message from API response (especially duplicate email)
  - Add link to login page
  - Style with clean, minimal CSS
  - _Requirements: 3.12_

- [x] 4.8 Create ProfileComponent
  - Generate component: `ng generate component features/profile`
  - Subscribe to AuthService.currentUser$ to get user data
  - Display user information: name, email, level, account created date
  - Add logout button that calls AuthService.logout() and navigates to /login
  - Protect route with AuthGuard in route configuration
  - Add placeholder section for socket connection status (will be implemented in Task 6)
  - Style with clean layout
  - _Requirements: 3.13_

- [x] 4.9 Create navigation component
  - Generate component: `ng generate component shared/components/nav`
  - Subscribe to AuthService.isAuthenticated$ to determine which links to show
  - Show when logged out: Home, Login, Signup
  - Show when logged in: Home, Profile, Logout button
  - Implement logout action: call AuthService.logout()
  - Style as horizontal navigation bar
  - Add to main app component template
  - _Requirements: 3.12, 3.13_

- [x] 4.10 Configure routes and integrate components
  - Update `frontend/src/app/app.routes.ts`
  - Add routes: '/' (home/landing), '/login' (LoginComponent), '/signup' (SignupComponent), '/profile' (ProfileComponent with AuthGuard)
  - Configure default redirect: '' → '/login'
  - Add wildcard route → redirect to '/'
  - Integrate AuthInterceptor in `app.config.ts` using `provideHttpClient(withInterceptors([authInterceptor]))`
  - Call AuthService.checkAuthStatus() in app initialization
  - _Requirements: 3.9, 3.10, 3.11, 3.12, 3.13_

- [ ]* 4.11 Write unit tests for AuthService
  - Mock HttpClient using Angular TestBed
  - Test signup: successful signup updates currentUser$ and stores token
  - Test login: successful login updates currentUser$ and stores token
  - Test logout: clears token and resets currentUser$
  - Test getMe: updates currentUser$ with API response
  - Test token management methods
  - Test checkAuthStatus: restores session if valid token, clears if invalid
  - _Requirements: 3.9_

- [ ]* 4.12 Write unit tests for AuthGuard
  - Mock AuthService
  - Test canActivate: returns true when authenticated
  - Test canActivate: redirects to /login and returns false when not authenticated
  - Verify Router navigation is called correctly
  - _Requirements: 3.10_

- [ ]* 4.13 Write unit tests for components
  - Test LoginComponent: form validation, successful login navigates to /profile, displays errors
  - Test SignupComponent: form validation, password match validation, successful signup navigates to /profile, displays errors
  - Test ProfileComponent: displays user data from currentUser$, logout button works
  - Test NavComponent: shows correct links based on authentication state
  - _Requirements: 3.12, 3.13_

- [ ]* 4.14 Write integration tests for authentication flow
  - Test complete signup flow: fill form → submit → redirected to /profile → user data displayed
  - Test complete login flow: fill form → submit → redirected to /profile → user data displayed
  - Test logout flow: click logout → redirected to /login → cannot access /profile
  - Test AuthGuard: accessing /profile without login → redirected to /login
  - Test token persistence: login → refresh page → still logged in → user data restored
  - Test AuthInterceptor: HTTP requests include Authorization header after login
  - Test 401 handling: expired token → auto logout → redirected to /login
  - _Requirements: 3.9, 3.10, 3.11, 3.12, 3.13_

- [ ] 4.15 Checkpoint - Verify frontend authentication
  - Ensure all tests pass
  - Test complete user flows manually in browser
  - Verify signup → login → profile → logout works end-to-end
  - Verify AuthGuard prevents unauthorized access
  - Verify token persists across page refresh
  - Verify error handling displays user-friendly messages
  - Ask user if any questions arise

### Task 5: Backend WebSocket Implementation

- [x] 5.1 Create shared WebSocket types
  - Create `shared/types/socket-events.types.ts`
  - Define `ClientEvents` interface with events sent from client to server
  - Define `ServerEvents` interface with events sent from server to client
  - Define `ConnectionState` type: 'disconnected' | 'connecting' | 'connected' | 'error'
  - Include base events: authenticate, ping (client), authenticated, pong, error (server)
  - Add comments explaining each event's purpose
  - Export from `shared/index.ts`
  - _Requirements: 4.12_

- [x] 5.2 Implement backend SocketService
  - Create `backend/src/services/socket.service.ts`
  - Install Socket.IO server: `npm install socket.io` (if not already installed)
  - Create `SocketService` class with singleton pattern
  - Implement `initialize(httpServer)` method to create Socket.IO server
  - Configure CORS to allow frontend origin
  - Set up authentication middleware in Socket.IO handshake
  - Extract token from `socket.handshake.auth.token`
  - Verify token with Supabase Auth client
  - If invalid: disconnect with error event
  - If valid: attach userId to socket, proceed with connection
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 5.3 Implement WebSocket event handlers
  - In SocketService, implement `connection` handler
  - Log connection with userId
  - Join socket to user-specific room: `socket.join(`user:${userId}`)`
  - Emit `authenticated` event to client with userId
  - Implement `disconnect` handler: log disconnection with userId
  - Implement `error` handler: log error with userId and error details
  - Add ping/pong handlers for connection health checks
  - _Requirements: 4.4, 4.5, 4.6, 4.7_

- [x] 5.4 Integrate Socket.IO with Express
  - Update `backend/src/index.ts`
  - Import http module to create HTTP server
  - Wrap Express app with http.createServer()
  - Initialize SocketService with HTTP server
  - Ensure Express and Socket.IO share the same HTTP server
  - Start server with HTTP server.listen() instead of app.listen()
  - _Requirements: 4.1_

- [ ]* 5.5 Write unit tests for SocketService
  - Mock Socket.IO server and socket instances
  - Test initialize(): creates Socket.IO server with correct configuration
  - Test authentication: valid token → connection succeeds, userId attached, user joins room, authenticated event emitted
  - Test authentication: invalid token → connection rejected with error
  - Test connection handler: logs connection, joins room, emits authenticated event
  - Test disconnect handler: logs disconnection
  - Test error handler: logs error with context
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6_

- [ ]* 5.6 Write integration tests for WebSocket connection
  - Use Socket.IO client to test actual connections
  - Test connection with valid token → receives authenticated event
  - Test connection with invalid token → connection rejected
  - Test connection without token → connection rejected
  - Test ping/pong: send ping → receive pong
  - Verify backend logs show connection/disconnection events
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

- [ ] 5.7 Checkpoint - Verify backend WebSocket
  - Ensure all tests pass
  - Test WebSocket connection manually using Postman WebSocket or custom script
  - Verify successful connection with valid token
  - Verify connection rejection with invalid token
  - Check backend logs for connection/disconnection events
  - Ask user if any questions arise

### Task 6: Frontend WebSocket Implementation

- [x] 6.1 Implement frontend SocketService
  - Create `frontend/src/app/core/services/socket.service.ts`
  - Install Socket.IO client: `npm install socket.io-client` (if not already installed)
  - Create BehaviorSubject for connectionState (ConnectionState type from shared)
  - Expose Observable: `connectionState$`
  - Implement `connect(token)`: initialize Socket.IO client with token in auth object, set up event listeners
  - Configure client: autoConnect: false, reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: 5
  - Implement `disconnect()`: disconnect socket, set connectionState to 'disconnected'
  - Implement `emit(event, data)`: emit event only if connected
  - Implement `on<T>(event): Observable<T>`: return Observable for specific event, auto-cleanup on unsubscribe
  - _Requirements: 4.8, 4.9_

- [x] 6.2 Implement connection lifecycle management
  - In SocketService, handle Socket.IO events: 'connect', 'disconnect', 'connect_error', 'authenticated'
  - On 'connecting': set connectionState to 'connecting'
  - On 'connect': set connectionState to 'connected', log success
  - On 'authenticated': log userId from event data
  - On 'disconnect': set connectionState to 'disconnected', log reason, prepare for auto-reconnect
  - On 'connect_error': set connectionState to 'error', log error, handle reconnection logic
  - Implement exponential backoff for reconnection attempts
  - _Requirements: 4.9, 4.10_

- [x] 6.3 Integrate SocketService with AuthService
  - Update AuthService to inject SocketService
  - In `login()`: after successful login, call SocketService.connect(token)
  - In `logout()`: call SocketService.disconnect()
  - In `checkAuthStatus()`: if token exists and getMe() succeeds, call SocketService.connect(token)
  - Ensure socket connects automatically after authentication
  - _Requirements: 4.13_

- [x] 6.4 Update ProfileComponent with connection status
  - Update ProfileComponent to subscribe to SocketService.connectionState$
  - Display connection status indicator:
    - 'connected': green chip/badge with text "Connected"
    - 'disconnected': red chip/badge with text "Disconnected"
    - 'connecting': yellow chip/badge with text "Connecting..."
    - 'error': red chip/badge with text "Connection Error"
  - Position status indicator prominently (e.g., top right of profile card)
  - Add tooltip or help text explaining what the status means
  - _Requirements: 4.11_

- [ ]* 6.5 Write unit tests for SocketService
  - Mock Socket.IO client
  - Test connect(): initializes client with correct configuration, passes token in auth
  - Test disconnect(): disconnects socket, updates connectionState
  - Test emit(): sends event only when connected
  - Test on(): returns Observable that emits socket events
  - Test connection lifecycle: verify connectionState updates for each Socket.IO event
  - Test reconnection logic: verify exponential backoff
  - _Requirements: 4.8, 4.9, 4.10_

- [ ]* 6.6 Write integration tests for WebSocket integration
  - Test login → socket connects automatically → connectionState becomes 'connected'
  - Test logout → socket disconnects → connectionState becomes 'disconnected'
  - Test page refresh with valid token → socket reconnects automatically
  - Test backend stop → connectionState becomes 'disconnected' → backend restart → auto-reconnect → connectionState becomes 'connected'
  - Test ProfileComponent: connection status indicator updates based on connectionState$
  - Verify backend logs show connection/disconnection with correct userId
  - _Requirements: 4.8, 4.9, 4.10, 4.11, 4.13_

- [ ] 6.7 Checkpoint - Verify frontend WebSocket
  - Ensure all tests pass
  - Test socket connection manually in browser
  - Login → verify connection status shows "Connected" in ProfileComponent
  - Check browser console for "Socket connected" log
  - Stop backend → verify status shows "Disconnected", attempts reconnect
  - Restart backend → verify status shows "Connected" automatically
  - Check backend logs for connection events with userId
  - Ask user if any questions arise

### Task 7: Integration, Polish, and Documentation

- [x] 7.1 Update comprehensive README
  - Verify prerequisites section is complete and accurate
  - Ensure installation instructions are clear and step-by-step
  - Document Supabase setup process with detailed steps
  - List all environment variables with descriptions and example values
  - Document migration execution process
  - Document seed script usage
  - Explain all npm scripts and when to use them
  - Add troubleshooting section with common issues and solutions:
    - Port already in use
    - Supabase connection errors
    - Token expiration issues
    - Socket connection failures
  - Add architecture diagram (use Mermaid if possible)
  - Document technology stack versions
  - Add "Next Steps" section pointing to Phase 2 features
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 7.2 Add JSDoc comments to key components
  - Add JSDoc comments to all DatabaseService methods
  - Add JSDoc comments to all AuthController methods
  - Add JSDoc comments to middleware functions (auth, error)
  - Add JSDoc comments to frontend services (AuthService, SocketService)
  - Document method parameters, return types, and thrown errors
  - Add usage examples in comments where helpful
  - _Requirements: 5.1_

- [x] 7.3 Run linter and fix all issues
  - Run `npm run lint` from root directory
  - Fix all ESLint errors and warnings in backend
  - Fix all ESLint errors and warnings in frontend
  - Ensure consistent code style across entire codebase
  - Verify Prettier formatting is applied consistently
  - Run `npm run lint -- --fix` to auto-fix issues where possible
  - _Requirements: 1.4_

- [x] 7.4 Verify all tests pass
  - Run `npm run test` from root directory
  - Ensure all backend unit tests pass
  - Ensure all backend integration tests pass
  - Ensure all frontend unit tests pass
  - Ensure all frontend integration tests pass
  - Fix any failing tests
  - Verify test coverage is reasonable (aim for >70% on critical paths)
  - _Requirements: 5.7_

- [x] 7.5 Clean up codebase
  - Remove any unused imports across frontend and backend
  - Remove commented-out code
  - Remove console.log statements (except intentional logging)
  - Remove any TODO comments that are no longer relevant
  - Verify file structure matches design document
  - Ensure consistent naming conventions throughout
  - Remove any placeholder or test files not needed for production
  - _Requirements: 5.1_

- [x] 7.6 Verify .gitignore is complete
  - Ensure node_modules/ is ignored in all directories
  - Ensure .env files are ignored
  - Ensure build output directories are ignored (dist/, build/)
  - Ensure IDE-specific files are ignored (.vscode/, .idea/)
  - Ensure OS-specific files are ignored (.DS_Store, Thumbs.db)
  - Verify no sensitive files are tracked in git
  - _Requirements: 1.1_

- [ ] 7.7 Manual end-to-end testing
  - Follow README instructions as a new developer would
  - Verify project setup completes in under 15 minutes
  - Test complete user flow: signup → login → profile → logout
  - Verify duplicate email signup shows error
  - Verify invalid login credentials show error
  - Verify AuthGuard prevents unauthorized access to /profile
  - Verify token persists across browser refresh
  - Verify all HTTP requests include Authorization header (check Network tab)
  - Verify socket connection establishes after login
  - Verify connection status indicator works correctly
  - Verify socket reconnects after backend restart
  - Test in multiple browsers (Chrome, Firefox, Safari)
  - Verify no console errors during normal operation
  - _Requirements: 5.1, 5.7, 5.8_

- [ ] 7.8 Final checkpoint - Phase 1 completion
  - All tests pass without errors
  - All linting passes without errors
  - README is comprehensive and accurate
  - Code is clean, documented, and follows conventions
  - All Phase 1 acceptance criteria are met
  - New developer can set up and run project in under 15 minutes
  - All core features work end-to-end
  - No console errors or warnings
  - Ask user for final review and approval


## Notes

- **Optional Tasks**: Tasks marked with `*` are optional test-related sub-tasks that can be skipped for a faster MVP. However, implementing them will ensure higher code quality and easier maintenance.
- **Incremental Progress**: Each task builds on previous tasks and results in working, testable functionality. Verify each task before moving to the next.
- **Test-Driven Approach**: While test tasks are marked optional, they provide crucial validation of implementation correctness and should be implemented when possible.
- **Requirements Traceability**: Each task references specific requirement IDs from requirements.md to maintain traceability.
- **Checkpoints**: Regular checkpoint tasks ensure progress is validated and issues are caught early. Use these moments to ask questions and verify understanding.
- **TypeScript Strict Mode**: All code uses TypeScript strict mode for maximum type safety. Avoid `any` types unless absolutely necessary.
- **Error Handling**: All services and controllers include comprehensive error handling with clear, user-friendly messages.
- **Security**: Authentication uses Supabase Auth with JWT tokens. Database security enforced through Row Level Security policies.
- **Development Workflow**: Use `npm run dev` from root to run both frontend and backend with hot-reload for efficient development.

## Phase 1 Completion Criteria

Phase 1 is complete when:

- [ ] User can sign up with valid credentials
- [ ] Duplicate email signup shows appropriate error
- [ ] User can log in with correct credentials
- [ ] Invalid credentials show appropriate error
- [ ] Authenticated user can access /profile
- [ ] Unauthenticated user is redirected from /profile to /login
- [ ] User data displays correctly on profile page
- [ ] Socket connection establishes after login
- [ ] Socket connection status displays correctly in ProfileComponent
- [ ] User can log out successfully
- [ ] Token persists across browser refresh
- [ ] All HTTP requests include Authorization header
- [ ] Database queries respect RLS (user can only see own data)
- [ ] Backend and frontend run without errors
- [x] All tests pass (unit and integration)
- [x] Code is linted and formatted consistently
- [x] README is comprehensive and accurate
- [ ] New developer can set up project in under 15 minutes


## Task Dependency Graph

```json
{
  "waves": [
    {
      "id": 0,
      "tasks": ["1.1", "1.4", "2.1", "2.2", "3.1"]
    },
    {
      "id": 1,
      "tasks": ["1.2", "1.3", "1.5", "2.3", "5.1"]
    },
    {
      "id": 2,
      "tasks": ["1.6", "2.4", "3.2", "3.3"]
    },
    {
      "id": 3,
      "tasks": ["1.7", "2.5", "3.4"]
    },
    {
      "id": 4,
      "tasks": ["2.6", "2.7", "3.5"]
    },
    {
      "id": 5,
      "tasks": ["2.8", "3.6"]
    },
    {
      "id": 6,
      "tasks": ["3.7", "3.8", "4.1"]
    },
    {
      "id": 7,
      "tasks": ["4.2", "4.3", "5.2"]
    },
    {
      "id": 8,
      "tasks": ["4.4", "4.5", "5.3"]
    },
    {
      "id": 9,
      "tasks": ["4.6", "4.7", "4.8", "5.4"]
    },
    {
      "id": 10,
      "tasks": ["4.9", "5.5", "5.6"]
    },
    {
      "id": 11,
      "tasks": ["4.10", "6.1"]
    },
    {
      "id": 12,
      "tasks": ["4.11", "4.12", "4.13", "6.2"]
    },
    {
      "id": 13,
      "tasks": ["4.14", "6.3"]
    },
    {
      "id": 14,
      "tasks": ["6.4"]
    },
    {
      "id": 15,
      "tasks": ["6.5", "6.6"]
    },
    {
      "id": 16,
      "tasks": ["7.1", "7.2"]
    },
    {
      "id": 17,
      "tasks": ["7.3", "7.4", "7.5", "7.6"]
    },
    {
      "id": 18,
      "tasks": ["7.7"]
    }
  ]
}
```

---

## Next Steps

Once all tasks are complete:

1. **Phase 2: Voice Processing** - Add audio recording, streaming, and playback capabilities
2. **Phase 3: AI Conversation** - Integrate OpenAI/Anthropic for intelligent conversation responses
3. **Phase 4: Real-time Corrections** - Implement grammar and pronunciation correction with explanations
4. **Phase 5: Progress Tracking** - Build dashboard with analytics and personalized learning insights

To begin executing tasks:
- Open this tasks.md file in your development environment
- Click "Start task" next to any task item to begin implementation
- Follow the incremental approach, completing each task before moving to the next
