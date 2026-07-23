import 'dotenv/config';
import http from 'node:http';
import cors from 'cors';
import express from 'express';
import { authRouter } from './routes/auth.routes.js';
import { conversationsRouter } from './routes/conversations.routes.js';
import { errorMiddleware } from './middleware/error.middleware.js';
import { socketService } from './services/socket.service.js';

const app = express();
app.use(
  cors({ origin: process.env['FRONTEND_URL'] ?? 'http://localhost:4200', credentials: true }),
);
app.use(express.json({ limit: '1mb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/conversations', conversationsRouter);
app.use(errorMiddleware);

const server = http.createServer(app);
socketService.initialize(server);
const port = Number(process.env['PORT'] ?? 3000);
server.listen(port, () => console.info(`Backend listening on http://localhost:${port}`));

function shutdown(signal: string): void {
  console.info(`${signal} received; closing server`);
  server.close(() => process.exit(0));
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
