'use strict';
const fetch = require('node-fetch');

async function seedDemoNotes() {
  const loginRes = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@neurovault.app', password: 'demo1234' })
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) { console.error('Login failed:', loginData); return; }
  const { token, user } = loginData;
  console.log('Logged in as:', user.username);

  const notes = [
    {
      title: 'Welcome to NeuroVault',
      content: 'NeuroVault is your AI-powered personal knowledge base. It can write and organize notes with tags like idea, research, todo, and general. You can upload PDF documents and have them indexed automatically. Use the Ask AI feature to chat with your notes using semantic search. The AI uses RAG (Retrieval-Augmented Generation) to find relevant context from your vault. Try asking: What can NeuroVault do?',
      tag: 'general'
    },
    {
      title: 'How the AI Works - RAG Technology',
      content: 'NeuroVault uses a technique called RAG which stands for Retrieval-Augmented Generation. Here is how it works step by step. First, when you save a note, the text runs through a local embedding model called Xenova all-MiniLM-L6-v2. This converts your text into a 384-dimensional mathematical vector. When you ask the AI a question, your question is also embedded into a vector. We use cosine similarity to find your most relevant notes. The top notes are sent to the AI as context. The AI answers ONLY using your notes, so there are no hallucinations. This means the AI truly understands and retrieves from YOUR knowledge vault.',
      tag: 'research'
    },
    {
      title: 'Getting Started Checklist',
      content: 'Steps to get the most out of NeuroVault. Create your first note with the plus button. Try different tags: idea, research, todo, general. Upload a PDF document using the Upload PDF button. Switch to Ask AI view and ask a question about your notes. Use Ctrl+K to open the command palette for quick actions. Try the Summarize and Simplify buttons on AI responses. Pro tip: The more notes you add, the smarter your AI vault becomes!',
      tag: 'todo'
    },
    {
      title: 'Semantic Search vs Keyword Search',
      content: 'Traditional keyword search requires exact word matches while semantic search understands meaning. For example, searching for vehicle will find notes about cars, automobiles, and transportation, even if those exact words do not appear together. NeuroVault uses semantic search powered by local ML models. This means your queries are understood conceptually, not just literally. Related ideas are surfaced even with different wording. The AI finds the most relevant context for accurate answers. This is powered entirely locally, so no data leaves your machine.',
      tag: 'research'
    },
    {
      title: 'Project Ideas for Q2 2026',
      content: 'Creative project ideas I am considering. Build a multi-modal semantic search engine that supports images and text. Create a Chrome extension that adds notes from any webpage directly to NeuroVault. Add voice-to-note functionality using the Web Speech API. Implement collaborative notes with real-time sync using WebSockets. Add a graph view showing connections between related notes. Build an automatic daily digest of your knowledge vault sent via email. The most promising idea is the Chrome extension because it would drive the most daily active usage.',
      tag: 'idea'
    }
  ];

  console.log('Seeding', notes.length, 'notes for demo user...');
  let server_log_shown = false;
  
  for (const note of notes) {
    const res = await fetch('http://localhost:3000/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(note)
    });
    const data = await res.json();
    if (res.ok) {
      console.log('Created:', data.title, '| embedding dims:', data.embedding ? data.embedding.length : 'none');
    } else {
      console.log('Failed:', JSON.stringify(data));
    }
  }
  console.log('Done seeding demo notes!');
}

seedDemoNotes().catch(console.error);
