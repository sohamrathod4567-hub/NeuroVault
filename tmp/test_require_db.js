try {
  const db = require('./server/db');
  const row = db.prepare('SELECT count(*) as cnt FROM notes').get();
  console.log('SUCCESS: notes count =', row.cnt);
} catch (err) {
  console.error('FAILURE:', err.stack);
}
