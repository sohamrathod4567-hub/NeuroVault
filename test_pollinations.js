const fetch = require('node-fetch');

async function test(model, endpoint) {
  console.log(`Testing ${model} on ${endpoint}...`);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false
      })
    });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length}`);
    if (res.ok) {
        try {
            const data = JSON.parse(text);
            console.log(`JSON valid! Content: ${data.choices?.[0]?.message?.content?.substring(0, 20)}`);
        } catch {
            console.log(`Not JSON, but OK. Text: ${text.substring(0, 50)}`);
        }
    }
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

(async () => {
  await test('openai', 'https://text.pollinations.ai/openai');
  await test('llama', 'https://text.pollinations.ai/openai');
  await test('mistral', 'https://text.pollinations.ai/openai');
  await test('openai', 'https://text.pollinations.ai/');
})();
