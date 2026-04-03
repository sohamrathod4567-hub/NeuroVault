'use strict';
const { chatCompletion } = require('./server/services/aiProvider');

async function testOllama() {
  console.log('--- Testing Ollama Integration ---');
  
  try {
    console.log('\n[Test 1] Non-streaming completion...');
    const response = await chatCompletion({
      messages: [{ role: 'user', content: 'Say "Ollama is ready" if you can hear me.' }],
      stream: false
    });
    console.log('Response:', response);

    console.log('\n[Test 2] Streaming completion...');
    const stream = await chatCompletion({
      messages: [{ role: 'user', content: 'Count from 1 to 3 slowly.' }],
      stream: true
    });

    process.stdout.write('Stream: ');
    return new Promise((resolve, reject) => {
      stream.on('data', chunk => {
        // Simple chunk display
        process.stdout.write(chunk.toString().replace(/\n/g, ' '));
      });
      stream.on('end', () => {
        console.log('\n\n--- Test Complete ---');
        resolve();
      });
      stream.on('error', reject);
    });

  } catch (err) {
    console.error('\n❌ Test Failed:', err.message);
    if (err.message.includes('ECONNREFUSED')) {
      console.log('💡 Tip: Ensure Ollama is running on http://localhost:11434');
    }
  }
}

testOllama().catch(console.error);
