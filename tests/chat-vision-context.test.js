'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createChatService } = require('../src/chat/chat-service');
const { buildSystemPrompt, VISION_RULES } = require('../src/chat/persona');

const KEY = 'sk-test-vision-0123456789';
const SAMPLE_PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13,
  0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 10,
  0, 0, 0, 10,
  8, 2, 0, 0, 0,
  0, 0, 0, 0,
]);

function createMockChat(overrides) {
  const sent = [];
  const providers = {
    get: (id) => ({
      id: id || 'mock-vision',
      name: 'Mock Vision Provider',
      defaultModel: 'vision-model',
      supportsVision: () => true,
      send: async (req) => {
        sent.push(req);
        if (overrides && overrides.reply) return overrides.reply(req);
        return { text: 'Respon pengamatan visual untuk Rover.' };
      },
    }),
  };

  const chat = createChatService({
    providers,
    getKey: () => KEY,
    getConfig: () => ({ provider: 'mock-vision', model: 'vision-model' }),
  });

  return { chat, sent };
}

test('buildSystemPrompt includes VISION_RULES when vision is enabled and omits when not', () => {
  const normalPrompt = buildSystemPrompt([], { companion: false });
  assert.ok(!normalPrompt.includes('Panduan analisis visual dan gambar'));

  const visionPrompt = buildSystemPrompt([], { companion: false, vision: true });
  assert.ok(visionPrompt.includes('Panduan analisis visual dan gambar'));
  assert.ok(visionPrompt.includes('Transkripsi Teks (OCR)'));
  assert.ok(visionPrompt.includes('Identifikasi Visual & Karakter'));
  assert.ok(visionPrompt.includes('Analisis Screenshot & Error'));
  assert.ok(visionPrompt.includes('Perbandingan Multi-Gambar'));
});

test('IMG-13: OCR request receives vision guidance and extracts text without invented content', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => {
      // Simulate honest OCR output following the policy
      return { text: 'Teks yang terbaca pada gambar:\n"SYSTEM ERROR 404"\n[bagian bawah tidak terbaca]' };
    },
  });

  const res = await chat.send({
    text: 'Bisa tolong transkripsikan teks di gambar ini?',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'terminal-error.png' }],
  });

  assert.equal(sent.length, 1);
  const sysMsg = sent[0].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Transkripsi Teks (OCR)'));
  assert.ok(sysMsg.content.includes('[tidak terbaca]'));
  assert.ok(res.text.includes('SYSTEM ERROR 404'));
  assert.ok(res.text.includes('[bagian bawah tidak terbaca]'));
});

test('IMG-14: Image translation combines extraction and translation guidance', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => ({
      text: 'Teks asli: "起動完了"\nTerjemahan: "Inisialisasi selesai", Rover!',
    }),
  });

  const res = await chat.send({
    text: 'Tolong terjemahkan tulisan Jepang di gambar ini ke bahasa Indonesia.',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'japanese-sign.png' }],
  });

  assert.equal(sent.length, 1);
  const sysMsg = sent[0].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Terjemahan Gambar'));
  assert.ok(res.text.includes('Inisialisasi selesai'));
});

test('IMG-15: Visual identification guides evidence-based candidates and honest uncertainty', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => ({
      text: 'Berdasarkan rambut putih dan pakaian musim dingin di gambar, karakter ini mirip dengan Aemeath dari Lahai-Roi, Rover. Tapi karena sudutnya dari samping, aku tidak bisa memastikan 100%.',
    }),
  });

  const res = await chat.send({
    text: 'Siapa karakter di gambar ini?',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'character.png' }],
  });

  assert.equal(sent.length, 1);
  const sysMsg = sent[0].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Identifikasi Visual & Karakter'));
  assert.ok(sysMsg.content.includes('ketidakpastian secara jujur'));
  assert.ok(res.text.includes('mirip dengan'));
});

test('IMG-16: Screenshot debugging separates observed error from hypotheses', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => ({
      text: 'Fakta di layar: Error menunjukkan `ENOENT: no such file or directory` pada baris 42.\nKemungkinan penyebab: Path file konfigurasi belum dibuat sebelum dibaca.',
    }),
  });

  const res = await chat.send({
    text: 'Kenapa kodinganku error begini di screenshot?',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'code-error.png' }],
  });

  assert.equal(sent.length, 1);
  const sysMsg = sent[0].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Analisis Screenshot & Error'));
  assert.ok(res.text.includes('Fakta di layar'));
});

test('IMG-17: Diagram explanation guides grounding in visible flow and components', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => ({
      text: 'Diagram ini memperlihatkan alur dari Client mengirim request ke API Gateway, lalu diteruskan ke Microservice A.',
    }),
  });

  const res = await chat.send({
    text: 'Jelaskan alur diagram arsitektur ini.',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'architecture.png' }],
  });

  assert.equal(sent.length, 1);
  const sysMsg = sent[0].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Penjelasan Diagram'));
  assert.ok(res.text.includes('API Gateway'));
});

test('IMG-18: Multiple images trigger structured comparison prompt fallback and guidance', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => ({
      text: 'Persamaan: kedua gambar menampilkan lanskap Lahai-Roi.\nPerbedaan: Gambar 1 waktu siang bersalju, sedangkan Gambar 2 waktu malam berkabut.',
    }),
  });

  // Sending multiple attachments without text triggers multi-image comparison default prompt
  const res = await chat.send({
    text: '',
    attachments: [
      { type: 'image', data: SAMPLE_PNG, name: 'scene1.png' },
      { type: 'image', data: SAMPLE_PNG, name: 'scene2.png' },
    ],
  });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].attachments.length, 2);
  const userMsg = sent[0].messages.find((m) => m.role === 'user');
  assert.ok(userMsg.content.includes('Tolong bandingkan gambar-gambar ini'));

  const sysMsg = sent[0].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Perbandingan Multi-Gambar'));
  assert.ok(res.text.includes('Persamaan:'));
  assert.ok(res.text.includes('Perbedaan:'));
});

test('IMG-19: Follow-up question without immediate attachment preserves vision context from prior turns', async () => {
  const { chat, sent } = createMockChat({
    reply: (req) => {
      if (sent.length === 1) {
        return { text: 'Di sebelah kiri ada menara pemancar, di tengah ada pohon kristal.' };
      }
      return { text: 'Menara pemancar di sebelah kiri tadi tingginya sekitar 30 meter dengan antena berputar.' };
    },
  });

  // Turn 1: with attachment
  await chat.send({
    text: 'Ada apa saja di pemandangan ini?',
    attachments: [{ type: 'image', data: SAMPLE_PNG, name: 'landscape.png' }],
  });

  // Turn 2: follow-up question without new attachment
  const followUpRes = await chat.send('Bisa ceritakan lebih banyak tentang menara yang kamu sebut tadi?');

  assert.equal(sent.length, 2);
  // Second request has no new attachments
  assert.deepEqual(sent[1].attachments, []);

  // System prompt in second turn retains vision guidance because history contains an image interaction
  const sysMsg = sent[1].messages.find((m) => m.role === 'system');
  assert.ok(sysMsg.content.includes('Panduan analisis visual dan gambar'));
  assert.ok(sysMsg.content.includes('Pertanyaan Lanjutan'));

  // History contains reference tag, not binary base64
  const historyTurns = sent[1].messages.filter((m) => m.role === 'user');
  assert.ok(historyTurns[0].content.includes('[Lampiran: landscape.png]'));
  assert.ok(!historyTurns[0].content.includes('iVBORw0KGgoAAAANSUhEUg'));
  assert.ok(followUpRes.text.includes('Menara pemancar'));
});
