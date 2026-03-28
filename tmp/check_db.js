const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'neurovault.db');
console.log('Checking DB:', DB_PATH);

try {
  const db = new Database(DB_PATH);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name).join(', '));
  
  if (tables.some(t => t.name === 'notes')) {
    const count = db.prepare("SELECT count(*) as cnt FROM notes").get().cnt;
    console.log('Notes Count:', count);
  } else {
    console.error('Notes table MISSING!');
  }
} catch (err) {
  console.error('DB Check failed:', err.message);
}
