import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const apiKey = process.env.GEMINI_API_KEY || '';
const genAI = new GoogleGenerativeAI(apiKey);
const MODEL_NAME = 'gemini-3.6-flash';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function parseCleanJson(text) {
  let cleaned = text.trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('AI output missing JSON array');
  return JSON.parse(cleaned.substring(start, end + 1));
}

// Retry wrapper for 429 Rate Limit
async function callGeminiWithRetry(prompt, parts, retries = 2) {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
  });

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await model.generateContent([prompt, ...parts]);
      return result.response.text();
    } catch (err) {
      if (err.message && err.message.includes('429') && attempt < retries) {
        console.log(`429 Rate limit hit. Waiting 15s before retry ${attempt + 1}...`);
        await new Promise(res => setTimeout(res, 15000));
      } else {
        throw err;
      }
    }
  }
}

// 1. Lobby Parse
app.post('/api/extract-lobby', upload.array('lobbyImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Please upload lobby screenshots' });

    const prompt = `
      Extract slots (1 to 12) and player IGNs from Free Fire custom room lobby images.
      Output ONLY a JSON array:
      [ { "slot": 1, "players": ["IGN1", "IGN2"] } ]
    `;

    const parts = req.files.map(f => ({
      inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
    }));

    const raw = await callGeminiWithRetry(prompt, parts);
    res.json({ success: true, data: parseCleanJson(raw) });
  } catch (err) {
    console.error('LOBBY_ERR:', err.message);
    const friendlyMsg = err.message.includes('429') 
      ? 'Google AI rate limit reached. Please wait ~30-40 seconds and try again.'
      : err.message;
    res.status(500).json({ error: friendlyMsg });
  }
});

// 2. Scoreboard Extraction
app.post('/api/extract-result', upload.array('resultImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Please upload match end screenshots' });

    const prompt = `
      Fast extract Free Fire match scoreboard:
      Find each placement (#1 to #12).
      Get:
      - rank (int 1-12)
      - identifier (team tag or player IGN)
      - kills (total kills or eliminations for this rank)
      - playerStats (array of { "ign": string, "kills": number })
      
      Deduplicate overlapping screenshots.
      Output ONLY valid JSON array:
      [
        {
          "rank": 1,
          "identifier": "TEAM NAME",
          "kills": 12,
          "playerStats": [ { "ign": "P1", "kills": 6 } ]
        }
      ]
    `;

    const parts = req.files.map(f => ({
      inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
    }));

    const raw = await callGeminiWithRetry(prompt, parts);
    res.json({ success: true, data: parseCleanJson(raw) });
  } catch (err) {
    console.error('RESULT_ERR:', err.message);
    const friendlyMsg = err.message.includes('429') 
      ? 'Google AI rate limit reached. Please wait ~30-40 seconds and try again.'
      : err.message;
    res.status(500).json({ error: friendlyMsg });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});