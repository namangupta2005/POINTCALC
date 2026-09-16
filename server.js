import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const MODEL_NAME = 'gemini-3.6-flash';

const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean);

let keyIndex = 0;

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const rootPath = path.join(__dirname, 'index.html');
  const publicPath = path.join(__dirname, 'public', 'index.html');

  if (fs.existsSync(rootPath)) {
    return res.sendFile(rootPath);
  } else if (fs.existsSync(publicPath)) {
    return res.sendFile(publicPath);
  } else {
    res.status(404).send('index.html not found.');
  }
});

function parseCleanJson(text) {
  let cleaned = text.trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('AI output missing JSON array');
  return JSON.parse(cleaned.substring(start, end + 1));
}

async function callGeminiWithKeyRotation(prompt, parts) {
  if (rawKeys.length === 0) throw new Error('No API Keys configured');

  let attempts = 0;
  const maxAttempts = rawKeys.length * 2;

  while (attempts < maxAttempts) {
    const currentKey = rawKeys[keyIndex % rawKeys.length];
    keyIndex++;

    try {
      const genAI = new GoogleGenerativeAI(currentKey);
      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
      });

      const result = await model.generateContent([prompt, ...parts]);
      return result.response.text();
    } catch (err) {
      console.warn(`[Key Switch] Key index ${(keyIndex - 1) % rawKeys.length + 1} hit error:`, err.message);
      if (err.message && err.message.includes('429')) {
        attempts++;
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('All API keys exhausted or rate limited.');
}

// 1. Master Lobby Extract
app.post('/api/extract-lobby', upload.array('lobbyImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload lobby screenshots' });

    const prompt = `
      Extract slot numbers (1-12) and player IGNs from Free Fire custom lobby screenshot.
      RULES:
      1. Slots must be integer 1 to 12.
      2. For each slot, list all visible players' names.
      3. Clean complex clan special symbols if possible, but keep plain letters/numbers readable.

      OUTPUT FORMAT (JSON ONLY):
      [
        { "slot": 1, "players": ["IGN1", "IGN2", "IGN3", "IGN4"] }
      ]
    `;

    const parts = req.files.map(f => ({
      inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
    }));

    const raw = await callGeminiWithKeyRotation(prompt, parts);
    res.json({ success: true, data: parseCleanJson(raw) });
  } catch (err) {
    console.error('LOBBY_ERR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Scoreboard Extract with Explicit Player-Wise Kill Breakdown
app.post('/api/extract-result', upload.array('resultImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload match result screenshots' });

    const prompt = `
      Extract Free Fire match scoreboard end-screen.
      CRITICAL INSTRUCTIONS:
      1. Find each placed rank (#1 to #12). Each rank must only appear ONCE in the JSON.
      2. Extract EVERY individual player visible in that squad row:
         - "ign": exact name of the player
         - "kills": eliminations scored by this player (integer)
      3. Provide:
         - "rank": integer (1-12)
         - "identifier": team name / clan tag or captain IGN
         - "playerStats": array of { "ign": string, "kills": number }
         - "kills": sum of playerStats kills (DO NOT MULTIPLY)
      
      OUTPUT FORMAT (Strict JSON Array):
      [
        {
          "rank": 1,
          "identifier": "VGL ESPORTS",
          "kills": 13,
          "playerStats": [
            { "ign": "VGLSHINIGAMI", "kills": 6 },
            { "ign": "WTF RUSHER", "kills": 4 },
            { "ign": "VGL-RODX", "kills": 3 }
          ]
        }
      ]
    `;

    const parts = req.files.map(f => ({
      inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
    }));

    const raw = await callGeminiWithKeyRotation(prompt, parts);
    res.json({ success: true, data: parseCleanJson(raw) });
  } catch (err) {
    console.error('RESULT_ERR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running at port ${PORT}`));
