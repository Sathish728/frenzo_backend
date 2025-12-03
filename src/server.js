import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { connectDatabase } from './config/database.js';
import { initializeFirebase } from './config/firebase.js';
import { config } from './config/env.js';
import { logger } from './config/logger.js';
import { setupSocketHandlers } from './websocket/socketHandler.js';

// Import scheduler
import './jobs/payout.scheduler.js';

const server = http.createServer(app);

// Setup Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Setup socket handlers
setupSocketHandlers(io);

// Initialize Firebase
initializeFirebase();

// Connect to database
connectDatabase();

// Start server
server.listen(config.port, () => {
  logger.info(`🚀 Server running on port ${config.port}`);
  logger.info(`📝 Environment: ${config.env}`);
  logger.info(`🔗 API: http://localhost:${config.port}/api`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  server.close(() => process.exit(1));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, closing server gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});