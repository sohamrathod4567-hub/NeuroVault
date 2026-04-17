'use strict';
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'neurovault.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL UNIQUE,
    email      TEXT    NOT NULL UNIQUE,
    password   TEXT    NOT NULL,
    created_at TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    title      TEXT    NOT NULL DEFAULT 'Untitled Note',
    content    TEXT    NOT NULL DEFAULT '',
    embedding  TEXT    DEFAULT NULL,
    tag        TEXT    DEFAULT 'general',
    created_at TEXT    DEFAULT (datetime('now')),
    updated_at TEXT    DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

// Idempotent migration: add embedding column to existing databases
const columns = db.pragma('table_info(notes)').map(c => c.name);
if (!columns.includes('embedding')) {
  db.exec('ALTER TABLE notes ADD COLUMN embedding TEXT DEFAULT NULL');
  console.log('[db] Migration: added embedding column to notes');
}

module.exports = db;
