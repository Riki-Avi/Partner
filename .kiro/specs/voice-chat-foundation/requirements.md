# Requirements Document - Voice Chat Foundation (Phase 1)

## Introduction

This document specifies the requirements for Phase 1 (Foundation) of a voice-based English learning chat application. Phase 1 establishes the core infrastructure including project structure, database schema, authentication, and WebSocket communication. This foundation enables future phases to implement voice processing, AI conversation, and real-time corrections.

## Glossary

- **Frontend**: Angular TypeScript application running in the user's browser
- **Backend**: Node.js/Express/TypeScript server handling API requests and WebSocket connections
- **Shared**: TypeScript type definitions and interfaces used by both Frontend and Backend
- **Supabase**: Cloud database service (PostgreSQL) with built-in authentication
- **Database_Service**: Backend component that handles database operations
- **Auth_Service_Backend**: Backend component managing user authentication
- **Auth_Service_Frontend**: Frontend component managing authentication state and API calls
- **Socket_Service_Backend**: Backend component managing WebSocket connections
- **Socket_Service_Frontend**: Frontend component managing WebSocket client connections
- **RLS**: Row Level Security - database security model restricting data access per user
- **JWT**: JSON Web Token - authentication token format
- **Monorepo**: Single repository containing multiple related projects

## Requirements

### Requirement 1: Project Structure and Configuration

**User Story:** As a developer, I want a well-organized monorepo with proper tooling, so that I can develop and maintain both frontend and backend efficiently.

#### Acceptance Criteria

1. THE System SHALL organize code in a monorepo with three top-level directories: frontend/, backend/, and shared/
2. THE Frontend SHALL be an Angular application with TypeScript strict mode enabled
3. THE Backend SHALL be a Node.js/Express application with TypeScript
4. THE System SHALL include ESLint and Prettier configuration for code quality in both Frontend and Backend
5. THE Shared SHALL contain TypeScript type definitions accessible to both Frontend and Backend
6. THE System SHALL provide npm scripts: dev:frontend, dev:backend, and dev (runs both in parallel)
7. THE System SHALL include environment variable configuration files with placeholder values
8. THE System SHALL include a README.md with complete setup instructions enabling a new developer to run the project in under 15 minutes

### Requirement 2: Database Schema and Setup

**User Story:** As a system architect, I want a complete database schema in Supabase, so that the application can persist user data, conversations, messages, corrections, and progress.

#### Acceptance Criteria

1. THE Database_Service SHALL create a users table with columns: id (UUID primary key), email (unique), name, level, created_at
2. THE Database_Service SHALL create a conversations table with columns: id (UUID primary key), user_id (foreign key to users), started_at, ended_at, language, duration_seconds
3. THE Database_Service SHALL create a messages table with columns: id (UUID primary key), conversation_id (foreign key to conversations), role (enum: user/assistant), content (text), audio_url, timestamp, has_corrections (boolean)
4. THE Database_Service SHALL create a corrections table with columns: id (UUID primary key), message_id (foreign key to messages), error_type, original, corrected, explanation
5. THE Database_Service SHALL create a user_progress table with columns: id (UUID primary key), user_id (foreign key to users, unique), total_conversations, total_time_minutes, common_errors (jsonb), last_updated
6. WHEN a user queries data THEN the Supabase RLS SHALL restrict results to only that user's data
7. THE Database_Service SHALL provide methods for CREATE, READ, UPDATE, DELETE operations on all tables
8. THE System SHALL include a database seed script that populates test data for development

### Requirement 3: User Authentication

**User Story:** As a user, I want to create an account and log in securely, so that I can access my personalized learning data.

#### Acceptance Criteria

1. WHEN a user submits valid signup data THEN the Auth_Service_Backend SHALL create a new user account in Supabase and return a JWT
2. WHEN a user submits valid login credentials THEN the Auth_Service_Backend SHALL authenticate the user with Supabase and return a JWT
3. WHEN a user requests logout THEN the Auth_Service_Backend SHALL invalidate the user's session
4. WHEN an authenticated user requests their profile THEN the Auth_Service_Backend SHALL return the user's data
5. WHEN a user submits signup data with an existing email THEN the Auth_Service_Backend SHALL return an error indicating the user already exists
6. WHEN a user submits invalid login credentials THEN the Auth_Service_Backend SHALL return an authentication error
7. THE Backend SHALL provide REST endpoints: POST /api/auth/signup, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
8. THE Backend SHALL include an authMiddleware that verifies JWT tokens on protected routes
9. THE Frontend Auth_Service_Frontend SHALL store the JWT in localStorage after successful authentication
10. THE Frontend SHALL include an AuthGuard that redirects unauthenticated users to the login page
11. THE Frontend SHALL include an AuthInterceptor that adds JWT tokens to HTTP request headers
12. THE Frontend SHALL provide LoginComponent and SignupComponent for user authentication
13. THE Frontend SHALL provide a basic profile page displaying user information

### Requirement 4: WebSocket Communication

**User Story:** As a system architect, I want bidirectional real-time communication between frontend and backend, so that future features can support live voice chat and instant corrections.

#### Acceptance Criteria

1. THE Backend SHALL initialize a Socket.IO server integrated with the Express application
2. WHEN a client connects to the WebSocket THEN the Socket_Service_Backend SHALL verify the JWT token
3. WHEN JWT verification fails THEN the Socket_Service_Backend SHALL reject the WebSocket connection
4. WHEN a client successfully authenticates THEN the Socket_Service_Backend SHALL create a user-specific room
5. WHEN a WebSocket connection is established THEN the Socket_Service_Backend SHALL log the connection event
6. WHEN a WebSocket connection terminates THEN the Socket_Service_Backend SHALL log the disconnection event
7. THE Socket_Service_Backend SHALL handle base events: connection, disconnect, and error
8. THE Frontend Socket_Service_Frontend SHALL establish a WebSocket connection using the stored JWT
9. WHEN the WebSocket connection drops THEN the Socket_Service_Frontend SHALL automatically attempt to reconnect
10. THE Socket_Service_Frontend SHALL expose Observable streams for WebSocket events
11. THE Socket_Service_Frontend SHALL track connection state: connecting, connected, disconnected
12. THE Shared SHALL define TypeScript interfaces for ClientEvents and ServerEvents
13. WHEN the Frontend loads THEN the Socket_Service_Frontend SHALL automatically connect to the Backend WebSocket server

### Requirement 5: Development Workflow and Documentation

**User Story:** As a developer, I want clear documentation and smooth development workflow, so that I can quickly set up the project and understand its structure.

#### Acceptance Criteria

1. THE README.md SHALL document prerequisites (Node.js version, npm version, Supabase account)
2. THE README.md SHALL provide step-by-step installation instructions
3. THE README.md SHALL document all npm scripts and their purposes
4. THE README.md SHALL explain the monorepo structure and purpose of each directory
5. THE README.md SHALL document environment variables required for both Frontend and Backend
6. THE README.md SHALL include troubleshooting section for common setup issues
7. WHEN a developer runs npm install in the root directory THEN the System SHALL install dependencies for both Frontend and Backend
8. WHEN a developer runs the dev script THEN the System SHALL start both Frontend and Backend servers concurrently
9. THE Frontend SHALL be accessible at http://localhost:4200
10. THE Backend SHALL be accessible at http://localhost:3000
