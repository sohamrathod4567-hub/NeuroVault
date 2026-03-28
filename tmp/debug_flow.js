const fetch = require('node-fetch');

async function debugFlow() {
  const BASE_URL = 'http://localhost:3000';
  
  try {
    // 1. Login
    console.log('--- Logging in ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'Password123' })
    });
    
    // If user doesn't exist, register
    let token = '';
    if (loginRes.status === 401 || loginRes.status === 404) {
      console.log('User not found, registering...');
      const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', email: 'test@example.com', password: 'Password123' })
      });
      const regData = await regRes.json();
      token = regData.token;
    } else {
      const loginData = await loginRes.json();
      token = loginData.token;
    }

    if (!token) throw new Error('Failed to get token');
    console.log('Token acquired.');

    // 2. Fetch Notes
    console.log('--- Fetching Notes ---');
    const notesRes = await fetch(`${BASE_URL}/api/notes`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log('Notes Status:', notesRes.status);
    const notesData = await notesRes.json();
    console.log('Notes Length:', Array.isArray(notesData) ? notesData.length : 'Not an array');
    if (notesRes.status === 500) console.log('Notes Error:', notesData);

    // 3. Test Chat
    console.log('--- Testing Chat ---');
    const chatRes = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ question: 'Hello' })
    });
    console.log('Chat Status:', chatRes.status);
    const chatData = await chatRes.json();
    console.log('Chat Response:', JSON.stringify(chatData, null, 2));

  } catch (err) {
    console.error('Debug Flow Failed:', err.stack);
  }
}

debugFlow();
