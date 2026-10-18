import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Support multiple comma-separated keys or single key from .env
const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
let globalKeyIndex = 0;

app.use(express.json());
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const rootPath = path.join(__dirname, 'index.html');
  const publicPath = path.join(__dirname, 'public', 'index.html');
  if (fs.existsSync(rootPath)) return res.sendFile(rootPath);
  if (fs.existsSync(publicPath)) return res.sendFile(publicPath);
  res.status(404).send('index.html not found.');
});

app.get('/api/template-image', (req, res) => {
  const requested = req.query.template || 'fse_official';
  let targetFiles = requested === 'per_match_pt'
    ? ['per_match_pt_2.jpeg', 'per_match_pt.jpeg', 'per_match_pt.png']
    : (requested === 'monsoon_clash_s2' 
      ? ['monsoon_clash_s2.jpeg', 'monsoon_clash_s2.png'] 
      : (requested === 'iconic_bash_s2' 
        ? ['IB_S2.jpeg', 'ib_s2.jpeg', 'IB_S2.png'] 
        : ['FSE OS.jpeg', 'template.jpeg']));

  for (const name of targetFiles) {
    const p1 = path.join(__dirname, name);
    const p2 = path.join(__dirname, 'public', name);
    if (fs.existsSync(p1)) return res.sendFile(p1);
    if (fs.existsSync(p2)) return res.sendFile(p2);
  }
  res.status(404).send('Template image not found');
});

function parseCleanJson(text) {
  let cleaned = text.trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('AI output missing JSON array: ' + text.substring(0, 80));
  return JSON.parse(cleaned.substring(start, end + 1));
}

// Gemini Vision API: Sirf Error aane par hi key rotate karega
async function callGeminiRestVision(prompt, imageBuffer, mimeType) {
  if (rawKeys.length === 0) throw new Error('GEMINI_API_KEY missing in .env');

  const maxRetries = rawKeys.length * 2;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const currentApiKey = rawKeys[globalKeyIndex % rawKeys.length];
      const base64Image = imageBuffer.toString('base64');

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${currentApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType || 'image/jpeg',
                    data: base64Image
                  }
                }
              ]
            }
          ],
          generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.1
          }
        })
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message || 'Gemini REST API Error');
      }

      const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResult) throw new Error('Empty response from Gemini');
      
      return textResult; // Success! Key ko wahi rehne do, change mat karo.
    } catch (err) {
      lastError = err;
      console.warn(`[Attempt ${attempt}] Key index ${globalKeyIndex % rawKeys.length} failed: ${err.message}. Rotating key...`);
      globalKeyIndex++; // Sirf error aane par hi agli key par shift honge
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  throw new Error(`Google API Error across all rotated keys: ${lastError.message}`);
}

// 1. Master Lobby Extract (Saari uploaded lobby files process honge)
app.post('/api/extract-lobby', upload.array('lobbyImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload lobby screenshots' });

    const allMappedSlots = new Map();

    for (const file of req.files) {
      const prompt = `Extract all visible slot numbers (1-12) and player IGNs from this Free Fire lobby screenshot.
Return ONLY a valid JSON array like:
[
  { "slot": 1, "players": ["PlayerA", "PlayerB"] }
]`;

      const raw = await callGeminiRestVision(prompt, file.buffer, file.mimetype);
      const parsed = parseCleanJson(raw);

      parsed.forEach(item => {
        const cleanSlot = parseInt(String(item.slot).replace(/[^0-9]/g, ''), 10);
        if (cleanSlot >= 1 && cleanSlot <= 12 && item.players && item.players.length > 0) {
          if (!allMappedSlots.has(cleanSlot)) {
            allMappedSlots.set(cleanSlot, item.players);
          } else {
            const existing = allMappedSlots.get(cleanSlot);
            const merged = Array.from(new Set([...existing, ...item.players]));
            allMappedSlots.set(cleanSlot, merged);
          }
        }
      });
    }

    const finalLobbyList = Array.from(allMappedSlots.entries())
      .map(([slot, players]) => ({ slot, players }))
      .sort((a, b) => a.slot - b.slot);

    res.json({ success: true, data: finalLobbyList });
  } catch (err) {
    console.error('LOBBY_ERR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Scoreboard Extract
app.post('/api/extract-result', upload.array('resultImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload result screenshots' });

    const prompt = `Extract Free Fire end match scoreboard. Find ranks (1-12), team name / captain IGN, total kills, and playerStats.
Return ONLY a valid JSON array like:
[
  {
    "rank": 1,
    "identifier": "TEAM NAME",
    "kills": 4,
    "playerStats": [{ "ign": "PLAYER1", "kills": 4 }]
  }
]`;

    const raw = await callGeminiRestVision(prompt, req.files[0].buffer, req.files[0].mimetype);
    const parsed = parseCleanJson(raw);

    const uniqueMap = new Map();
    parsed.forEach(item => {
      const cleanRank = parseInt(String(item.rank).replace(/[^0-9]/g, ''), 10);
      if (cleanRank >= 1 && cleanRank <= 12 && !uniqueMap.has(cleanRank)) {
        item.rank = cleanRank;
        uniqueMap.set(cleanRank, item);
      }
    });

    const cleanList = Array.from(uniqueMap.values()).sort((a, b) => a.rank - b.rank);
    res.json({ success: true, data: cleanList });
  } catch (err) {
    console.error('RESULT_ERR:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Smart Error-Fallback Gemini Server live at port ${PORT}`));
