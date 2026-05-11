const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_KEY });

async function ask(system, user, maxTokens = 300) {
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }]
  });
  return response.content[0].text.trim();
}

async function askJSON(system, user) {
  const text = await ask(system, user, 200);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found');
  const clean = text.slice(start, end+1).replace(/[\u0000-\u001F]/g,' ');
  return JSON.parse(clean);
}

const domainFeedback = {};

app.post('/feedback', (req, res) => {
  const { domain, feedback } = req.body;
  domainFeedback[domain] = domainFeedback[domain] || { up: 0, down: 0 };
  domainFeedback[domain][feedback]++;
  res.json({ ok: true });
});

app.post('/run', async (req, res) => {
  const { task, domain } = req.body;
  const start = Date.now();

  try {
    // Stage 1 — Planner (JSON, short)
    const planner = await askJSON(
      `You are a ${domain} strategist. Output ONLY this exact JSON with no extra text: {"subtasks":["one short phrase","one short phrase","one short phrase"],"strategy":"one sentence"}`,
      task
    );
    console.log('Planner done');

    // Stage 2 — Researcher (plain text, no JSON)
    const researchText = await ask(
      `You are a ${domain} researcher. Write 3 short bullet points of key facts relevant to this task. Each bullet point must be under 15 words. Plain text only.`,
      `Task: "${task}" Focus areas: ${(planner.subtasks||[]).join(', ')}`
    );
    const researcher = {
      findings: [
        { subtask: planner.subtasks?.[0] || 'Point 1', facts: researchText.split('\n')[0]?.replace(/^[-•*]\s*/,'').slice(0,100) || '' },
        { subtask: planner.subtasks?.[1] || 'Point 2', facts: researchText.split('\n')[1]?.replace(/^[-•*]\s*/,'').slice(0,100) || '' },
        { subtask: planner.subtasks?.[2] || 'Point 3', facts: researchText.split('\n')[2]?.replace(/^[-•*]\s*/,'').slice(0,100) || '' },
      ]
    };
    console.log('Researcher done');

    // Stage 3 — Writer (plain text, no JSON)
    const badCount = domainFeedback[domain]?.down || 0;
    const hint = badCount > 0 ? `Previous answers were rated unhelpful ${badCount} times. Be more specific.` : '';
    
    let writerText = await ask(
      `You are a ${domain} expert. ${hint} Write a clear 4-5 sentence answer in plain text. No bullet points, no markdown, no headers.`,
      `Task: "${task}" Key facts: ${researchText.slice(0,300)}`,
      400
    );
    writerText = writerText.replace(/\n/g,' ').replace(/\*\*/g,'').replace(/#+/g,'').trim().slice(0,450);
    let writer = { answer: writerText };
    console.log('Writer done');

    // Stage 4 — Critic (JSON, short)
    let critic = await askJSON(
      `Rate this answer 1-10. Output ONLY JSON: {"completeness":8,"correctness":7,"clarity":9,"hallucination_risk":2,"summary":"max 15 words"}`,
      `Task: "${task}" Answer: "${writerText.slice(0,200)}"`
    );
    console.log('Critic done:', JSON.stringify(critic));

    // Auto retry up to 2 times if below 7
    let attempts = 1;
    let avg = (critic.completeness + critic.correctness + critic.clarity + (10 - critic.hallucination_risk)) / 4;

    while (avg < 7 && attempts < 3) {
      console.log(`Retry ${attempts} — score was ${avg.toFixed(1)}, critic said: ${critic.summary}`);
      writerText = await ask(
        `You are a ${domain} expert. Previous answer scored ${avg.toFixed(1)}/10. Critic said: "${critic.summary}". Fix these issues. Write 4-5 plain sentences with specific numbers and timeframes. No markdown.`,
        `Task: "${task}" Facts: ${researchText.slice(0,300)}`,
        400
      );
      writerText = writerText.replace(/\n/g,' ').replace(/\*\*/g,'').replace(/#+/g,'').trim().slice(0,450);
      writer = { answer: writerText };
      critic = await askJSON(
        `Rate this answer 1-10. Output ONLY JSON: {"completeness":8,"correctness":7,"clarity":9,"hallucination_risk":2,"summary":"max 15 words"}`,
        `Task: "${task}" Answer: "${writerText.slice(0,200)}"`
      );
      avg = (critic.completeness + critic.correctness + critic.clarity + (10 - critic.hallucination_risk)) / 4;
      console.log(`Retry ${attempts} score: ${avg.toFixed(1)}`);
      attempts++;
    }

    res.json({
      planner,
      researcher,
      writer,
      critic,
      retried: attempts > 1,
      attempts,
      latency: ((Date.now()-start)/1000).toFixed(1),
      tokens: 900
    });

  } catch(err) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3001, () => console.log('Backend running on port 3001'));