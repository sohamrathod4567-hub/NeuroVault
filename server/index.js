'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
const helmet = require('helmet');

const authRoutes  = require('./routes/auth');
const notesRoutes = require('./routes/notes');
const searchRoutes = require('./routes/search');
const chatRoutes  = require('./routes/chat');
const documentsRoutes = require('./routes/documents');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet({ contentSecurityPolicy: false })); // allow local scripts/images
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static frontend files with 1-day caching
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth',   authRoutes);
app.use('/api/notes',  notesRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/chat',   chatRoutes);
app.use('/api/documents', documentsRoutes);

// Catch-all: serve index.html for client-side routing
app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🧠 NeuroVault server running at http://localhost:${PORT}\n`);
});

// Process-level guards
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});
