const fetch = require('node-fetch');

async function testChat() {
  const payload = { question: "What is NeuroVault?" };
  try {
    const res = await fetch('http://localhost:3000/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        // Note: This needs a real token to work if authentication is enabled.
        // For debugging purposes, I might need to check if I can bypass auth or use a test token.
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('Response Status:', res.status);
    console.log('Response Body:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

// testChat(); // Uncomment if running in a real node env
