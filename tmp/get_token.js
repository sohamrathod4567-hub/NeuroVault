const fetch = require('node-fetch');

async function getToken() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'vault9@test.com', password: 'Password123' })
  });
  const data = await res.json();
  console.log('Status:', res.status);
  console.log('Body:', JSON.stringify(data, null, 2));
}

getToken();
