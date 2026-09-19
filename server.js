// import express from 'express';
// import multer from 'multer';
// import dotenv from 'dotenv';
// import path from 'path';
// import fs from 'fs';
// import { fileURLToPath } from 'url';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// const MODEL_NAME = 'gemini-3.6-flash';

// const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
//   .split(',')
//   .map(k => k.trim())
//   .filter(Boolean);

// let keyIndex = 0;

// app.use(express.json());
// app.use(express.static(__dirname));
// app.use(express.static(path.join(__dirname, 'public')));

// app.get('/', (req, res) => {
//   const rootPath = path.join(__dirname, 'index.html');
//   const publicPath = path.join(__dirname, 'public', 'index.html');

//   if (fs.existsSync(rootPath)) {
//     return res.sendFile(rootPath);
//   } else if (fs.existsSync(publicPath)) {
//     return res.sendFile(publicPath);
//   } else {
//     res.status(404).send('index.html not found.');
//   }
// });

// function parseCleanJson(text) {
//   let cleaned = text.trim();
//   const start = cleaned.indexOf('[');
//   const end = cleaned.lastIndexOf(']');
//   if (start === -1 || end === -1) throw new Error('AI output missing JSON array');
//   return JSON.parse(cleaned.substring(start, end + 1));
// }

// // SMART KEY SWITCHING (Catches 503, 500, 429 & Overload)
// async function callGeminiWithKeyRotation(prompt, parts) {
//   if (rawKeys.length === 0) throw new Error('No API Keys configured');

//   let attempts = 0;
//   const maxAttempts = rawKeys.length * 3;

//   while (attempts < maxAttempts) {
//     const currentKey = rawKeys[keyIndex % rawKeys.length];
//     keyIndex++;

//     try {
//       const genAI = new GoogleGenerativeAI(currentKey);
//       const model = genAI.getGenerativeModel({
//         model: MODEL_NAME,
//         generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
//       });

//       const result = await model.generateContent([prompt, ...parts]);
//       return result.response.text();
//     } catch (err) {
//       attempts++;
//       console.warn(`[Key Switch] Key #${(keyIndex - 1) % rawKeys.length + 1} failed: ${err.message}. Rotating...`);
//       // 503 (Overload) ya 429 (Rate limit) ya general network glitch hone par 500ms ruk ke switch karega
//       await new Promise(r => setTimeout(r, 600));
//     }
//   }
//   throw new Error('All API keys hit quota or Gemini service is overloaded. Please retry in 10 seconds.');
// }

// // 1. Master Lobby Extract
// app.post('/api/extract-lobby', upload.array('lobbyImages', 5), async (req, res) => {
//   try {
//     if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload lobby screenshots' });

//     const prompt = `
//       Extract slot numbers (1-12) and player IGNs from Free Fire custom lobby screenshot.
//       RULES:
//       1. Slots must be integer 1 to 12.
//       2. For each slot, list all visible players' names.
//       3. Clean complex clan special symbols if possible, but keep plain letters/numbers readable.

//       OUTPUT FORMAT (JSON ONLY):
//       [
//         { "slot": 1, "players": ["IGN1", "IGN2", "IGN3", "IGN4"] }
//       ]
//     `;

//     const parts = req.files.map(f => ({
//       inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
//     }));

//     const raw = await callGeminiWithKeyRotation(prompt, parts);
//     res.json({ success: true, data: parseCleanJson(raw) });
//   } catch (err) {
//     console.error('LOBBY_ERR:', err.message);
//     res.status(500).json({ error: err.message });
//   }
// });

// // 2. Scoreboard Extract (Strict Integer Rank Deduplication)
// app.post('/api/extract-result', upload.array('resultImages', 5), async (req, res) => {
//   try {
//     if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload match result screenshots' });

//     const prompt = `
//       Extract Free Fire match scoreboard end-screen.
//       CRITICAL DEDUPLICATION RULES:
//       1. Ranks must be pure integers 1 to 12 only.
//       2. If multiple screenshots overlap, IGNORE duplicate ranks.
//       3. For each rank (#1 to #12):
//          - "rank": integer (1 to 12)
//          - "identifier": team name / captain IGN
//          - "playerStats": array of { "ign": string, "kills": integer }
//          - "kills": total kills for this squad (sum of playerStats)
      
//       OUTPUT STRICT JSON ARRAY ONLY:
//       [
//         {
//           "rank": 1,
//           "identifier": "TEAM NAME",
//           "kills": 4,
//           "playerStats": [{ "ign": "PLAYER1", "kills": 4 }]
//         }
//       ]
//     `;

//     const parts = req.files.map(f => ({
//       inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
//     }));

//     const raw = await callGeminiWithKeyRotation(prompt, parts);
//     const parsed = parseCleanJson(raw);

//     const uniqueMap = new Map();
//     parsed.forEach(item => {
//       const cleanRank = parseInt(String(item.rank).replace(/[^0-9]/g, ''), 10);
//       if (cleanRank >= 1 && cleanRank <= 12 && !uniqueMap.has(cleanRank)) {
//         item.rank = cleanRank;
//         uniqueMap.set(cleanRank, item);
//       }
//     });

//     const cleanList = Array.from(uniqueMap.values()).sort((a, b) => a.rank - b.rank);
//     res.json({ success: true, data: cleanList });
//   } catch (err) {
//     console.error('RESULT_ERR:', err.message);
//     res.status(500).json({ error: err.message });
//   }
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, '0.0.0.0', () => console.log(`Server running at port ${PORT}`));

// import express from 'express';
// import multer from 'multer';
// import dotenv from 'dotenv';
// import path from 'path';
// import fs from 'fs';
// import { fileURLToPath } from 'url';
// import { GoogleGenerativeAI } from '@google/generative-ai';

// dotenv.config();

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// const app = express();
// const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// const MODEL_NAME = 'gemini-3.6-flash';

// const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '')
//   .split(',')
//   .map(k => k.trim())
//   .filter(Boolean);

// let keyIndex = 0;

// app.use(express.json());
// app.use(express.static(__dirname));
// app.use(express.static(path.join(__dirname, 'public')));

// app.get('/', (req, res) => {
//   const rootPath = path.join(__dirname, 'index.html');
//   const publicPath = path.join(__dirname, 'public', 'index.html');

//   if (fs.existsSync(rootPath)) {
//     return res.sendFile(rootPath);
//   } else if (fs.existsSync(publicPath)) {
//     return res.sendFile(publicPath);
//   } else {
//     res.status(404).send('index.html not found.');
//   }
// });

// // Dedicated Multi-Template Route (Serves directly from root or public folder)
// app.get('/api/template-image', (req, res) => {
//   const requested = req.query.template || 'fse_official';

//   let targetFiles = [];
//   if (requested === 'monsoon_clash_s2') {
//     targetFiles = [
//       'monsoon_clash_s2.jpeg',
//       'monsoon_clash_s2.jpg',
//       'monsoon_clash_s2.png'
//     ];
//   } else {
//     targetFiles = [
//       'FSE OS.jpeg',
//       'FSE OS.jpg',
//       'template.jpeg',
//       'template.jpg',
//       'template.png',
//       'pt.jpeg'
//     ];
//   }

//   for (const name of targetFiles) {
//     const rootPath = path.join(__dirname, name);
//     const publicPath = path.join(__dirname, 'public', name);
//     if (fs.existsSync(rootPath)) return res.sendFile(rootPath);
//     if (fs.existsSync(publicPath)) return res.sendFile(publicPath);
//   }

//   res.status(404).send(`Template image for ${requested} not found.`);
// });

// function parseCleanJson(text) {
//   let cleaned = text.trim();
//   const start = cleaned.indexOf('[');
//   const end = cleaned.lastIndexOf(']');
//   if (start === -1 || end === -1) throw new Error('AI output missing JSON array');
//   return JSON.parse(cleaned.substring(start, end + 1));
// }

// // SMART KEY SWITCHING (Catches 503, 500, 429 & Overload)
// async function callGeminiWithKeyRotation(prompt, parts) {
//   if (rawKeys.length === 0) throw new Error('No API Keys configured');

//   let attempts = 0;
//   const maxAttempts = rawKeys.length * 3;

//   while (attempts < maxAttempts) {
//     const currentKey = rawKeys[keyIndex % rawKeys.length];
//     keyIndex++;

//     try {
//       const genAI = new GoogleGenerativeAI(currentKey);
//       const model = genAI.getGenerativeModel({
//         model: MODEL_NAME,
//         generationConfig: { responseMimeType: "application/json", temperature: 0.0 }
//       });

//       const result = await model.generateContent([prompt, ...parts]);
//       return result.response.text();
//     } catch (err) {
//       attempts++;
//       console.warn(`[Key Switch] Key #${(keyIndex - 1) % rawKeys.length + 1} failed: ${err.message}. Rotating...`);
//       await new Promise(r => setTimeout(r, 600));
//     }
//   }
//   throw new Error('All API keys hit quota or Gemini service is overloaded. Please retry in 10 seconds.');
// }

// // 1. Master Lobby Extract
// app.post('/api/extract-lobby', upload.array('lobbyImages', 5), async (req, res) => {
//   try {
//     if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload lobby screenshots' });

//     const prompt = `
//       Extract slot numbers (1-12) and player IGNs from Free Fire custom lobby screenshot.
//       RULES:
//       1. Slots must be integer 1 to 12.
//       2. For each slot, list all visible players' names.
//       3. Clean complex clan special symbols if possible, but keep plain letters/numbers readable.

//       OUTPUT FORMAT (JSON ONLY):
//       [
//         { "slot": 1, "players": ["IGN1", "IGN2", "IGN3", "IGN4"] }
//       ]
//     `;

//     const parts = req.files.map(f => ({
//       inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
//     }));

//     const raw = await callGeminiWithKeyRotation(prompt, parts);
//     res.json({ success: true, data: parseCleanJson(raw) });
//   } catch (err) {
//     console.error('LOBBY_ERR:', err.message);
//     res.status(500).json({ error: err.message });
//   }
// });

// // 2. Scoreboard Extract (Strict Integer Rank Deduplication)
// app.post('/api/extract-result', upload.array('resultImages', 5), async (req, res) => {
//   try {
//     if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload match result screenshots' });

//     const prompt = `
//       Extract Free Fire match scoreboard end-screen.
//       CRITICAL DEDUPLICATION RULES:
//       1. Ranks must be pure integers 1 to 12 only.
//       2. If multiple screenshots overlap, IGNORE duplicate ranks.
//       3. For each rank (#1 to #12):
//          - "rank": integer (1 to 12)
//          - "identifier": team name / captain IGN
//          - "playerStats": array of { "ign": string, "kills": integer }
//          - "kills": total kills for this squad (sum of playerStats)
      
//       OUTPUT STRICT JSON ARRAY ONLY:
//       [
//         {
//           "rank": 1,
//           "identifier": "TEAM NAME",
//           "kills": 4,
//           "playerStats": [{ "ign": "PLAYER1", "kills": 4 }]
//         }
//       ]
//     `;

//     const parts = req.files.map(f => ({
//       inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
//     }));

//     const raw = await callGeminiWithKeyRotation(prompt, parts);
//     const parsed = parseCleanJson(raw);

//     const uniqueMap = new Map();
//     parsed.forEach(item => {
//       const cleanRank = parseInt(String(item.rank).replace(/[^0-9]/g, ''), 10);
//       if (cleanRank >= 1 && cleanRank <= 12 && !uniqueMap.has(cleanRank)) {
//         item.rank = cleanRank;
//         uniqueMap.set(cleanRank, item);
//       }
//     });

//     const cleanList = Array.from(uniqueMap.values()).sort((a, b) => a.rank - b.rank);
//     res.json({ success: true, data: cleanList });
//   } catch (err) {
//     console.error('RESULT_ERR:', err.message);
//     res.status(500).json({ error: err.message });
//   }
// });

// const PORT = process.env.PORT || 3000;
// app.listen(PORT, '0.0.0.0', () => console.log(`Server running at port ${PORT}`));

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

// Dedicated Multi-Template Route (Supports fse_official, monsoon_clash_s2, per_match_pt)
app.get('/api/template-image', (req, res) => {
  const requested = req.query.template || 'fse_official';

  let targetFiles = [];
  if (requested === 'per_match_pt') {
    targetFiles = [
      'per_match_pt.jpeg',
      'per_match_pt.jpg',
      'per_match_pt.png'
    ];
  } else if (requested === 'monsoon_clash_s2') {
    targetFiles = [
      'monsoon_clash_s2.jpeg',
      'monsoon_clash_s2.jpg',
      'monsoon_clash_s2.png'
    ];
  } else {
    targetFiles = [
      'FSE OS.jpeg',
      'FSE OS.jpg',
      'template.jpeg',
      'template.jpg',
      'template.png',
      'pt.jpeg'
    ];
  }

  for (const name of targetFiles) {
    const rootPath = path.join(__dirname, name);
    const publicPath = path.join(__dirname, 'public', name);
    if (fs.existsSync(rootPath)) return res.sendFile(rootPath);
    if (fs.existsSync(publicPath)) return res.sendFile(publicPath);
  }

  res.status(404).send(`Template image for ${requested} not found.`);
});

function parseCleanJson(text) {
  let cleaned = text.trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('AI output missing JSON array');
  return JSON.parse(cleaned.substring(start, end + 1));
}

// SMART KEY SWITCHING (Catches 503, 500, 429 & Overload)
async function callGeminiWithKeyRotation(prompt, parts) {
  if (rawKeys.length === 0) throw new Error('No API Keys configured');

  let attempts = 0;
  const maxAttempts = rawKeys.length * 3;

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
      attempts++;
      console.warn(`[Key Switch] Key #${(keyIndex - 1) % rawKeys.length + 1} failed: ${err.message}. Rotating...`);
      await new Promise(r => setTimeout(r, 600));
    }
  }
  throw new Error('All API keys hit quota or Gemini service is overloaded. Please retry in 10 seconds.');
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

// 2. Scoreboard Extract (Strict Integer Rank Deduplication)
app.post('/api/extract-result', upload.array('resultImages', 5), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'Upload match result screenshots' });

    const prompt = `
      Extract Free Fire match scoreboard end-screen.
      CRITICAL DEDUPLICATION RULES:
      1. Ranks must be pure integers 1 to 12 only.
      2. If multiple screenshots overlap, IGNORE duplicate ranks.
      3. For each rank (#1 to #12):
         - "rank": integer (1 to 12)
         - "identifier": team name / captain IGN
         - "playerStats": array of { "ign": string, "kills": integer }
         - "kills": total kills for this squad (sum of playerStats)
      
      OUTPUT STRICT JSON ARRAY ONLY:
      [
        {
          "rank": 1,
          "identifier": "TEAM NAME",
          "kills": 4,
          "playerStats": [{ "ign": "PLAYER1", "kills": 4 }]
        }
      ]
    `;

    const parts = req.files.map(f => ({
      inlineData: { data: f.buffer.toString('base64'), mimeType: f.mimetype }
    }));

    const raw = await callGeminiWithKeyRotation(prompt, parts);
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
app.listen(PORT, '0.0.0.0', () => console.log(`Server running at port ${PORT}`));
