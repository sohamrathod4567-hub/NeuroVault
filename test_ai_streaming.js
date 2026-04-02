'use strict';
const { chatCompletion } = require('./server/services/aiProvider');

async function testAI() {
  console.log('Testing non-streaming completion...');
  const response = await chatCompletion({
    messages: [{ role: 'user', content: 'Hello, how are you?' }],
    stream: false
  });
  console.log('Response:', response);

  console.log('\nTesting streaming completion...');
  const stream = await chatCompletion({
    messages: [{ role: 'user', content: 'Count from 1 to 5' }],
    stream: true
  });

  process.stdout.write('Stream chunks: ');
  stream.on('data', chunk => {
    process.stdout.write(chunk.toString());
  });

  stream.on('end', () => {
    console.log('\nStream completed.');
  });
}

testAI().catch(console.error);
