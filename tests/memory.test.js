'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  createMemoryStore,
  createMemoryBuiltin,
  splitSummaryAndNextStep,
  FILE_NAME,
  MAX_CONTEXT_CHARS,
  MAX_TEXT,
  OFFER_TTL_MS,
  CONTINUATION_GAP_MS,
  PREFERENCE_OFFER_GAP_MS,
} = require('../src/memory/memory-store');
const { createBehaviorDirector } = require('../src/behavior/behavior-director');
const { createChatService } = require('../src/chat/chat-service');
const { createLocalResponder } = require('../src/chat/local-responder');
const { buildSystemPrompt } = require('../src/chat/persona');

const DAY_MS = 24 * 60 * 60 * 1000;

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aemeath-memory-'));
}

function storeIn(dir, nowMs, extra) {
  return createMemoryStore(Object.assign({ dir: dir, now: typeof nowMs === 'function' ? nowMs : () => nowMs }, extra));
}

function readRaw(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, FILE_NAME), 'utf8'));
}

test('memories survive a restart and keep their author and timestamps', () => {
  const dir = tempDir();
  const first = storeIn(dir, 1000);
  const saved = first.remember({
    text: 'Proyek aemeath-ai-agent, sedang mengerjakan modul memori companion.',
    kind: 'project',
    project: 'aemeath-ai-agent',
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.memory.source, 'user');
  assert.equal(saved.memory.kindLabel, 'proyek');

  const second = storeIn(dir, 2000);
  const list = second.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].text, 'Proyek aemeath-ai-agent, sedang mengerjakan modul memori companion.');
  assert.equal(list[0].project, 'aemeath-ai-agent');
  assert.equal(list[0].createdAt, 1000);
  assert.deepEqual(second.status().bySource, { user: 1, assistant: 0, imported: 0 });
  assert.equal(readRaw(dir).version, 1, 'the file is written in the current schema');
});

test('saying the same thing twice refreshes one entry instead of adding a copy', () => {
  const dir = tempDir();
  const first = storeIn(dir, 1000);
  first.remember({ text: 'Suka penjelasan singkat', kind: 'preference' });

  const second = storeIn(dir, 6000);
  const again = second.remember({ text: '  suka   penjelasan singkat ', kind: 'preference' });
  assert.equal(again.ok, true);
  assert.equal(again.merged, true);
  assert.equal(second.list().length, 1);
  assert.equal(second.list()[0].updatedAt, 6000);
});

test('editing, deleting and clearing all reach the file', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  const a = store.remember({ text: 'Pilih SQLite untuk memori', kind: 'decision' }).memory;
  const b = store.remember({ text: 'Tugas: tulis tes memori', kind: 'task' }).memory;
  assert.equal(store.list().length, 2);

  assert.equal(store.update(a.id, { text: 'Pilih JSON dulu, SQLite nanti', kind: 'decision' }).ok, true);
  assert.equal(storeIn(dir, 2000).list().find((m) => m.id === a.id).text, 'Pilih JSON dulu, SQLite nanti');

  assert.equal(store.forget(b.id), true);
  assert.equal(store.forget(b.id), false, 'deleting twice is a no-op');
  assert.deepEqual(storeIn(dir, 3000).list().map((m) => m.id), [a.id]);

  assert.equal(store.clear(), 1);
  assert.deepEqual(storeIn(dir, 4000).list(), []);
});

test('keys and passwords are refused and never written in clear text', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  const fakeKey = 'sk-' + 'A1b2C3d4E5f6G7h8'.repeat(2);
  const refused = store.remember({ text: 'kunci cadangan ' + fakeKey });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /API key/);
  assert.equal(store.list().length, 0);
  const file = path.join(dir, FILE_NAME);
  assert.equal(fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes(fakeKey), false);

  assert.equal(store.remember({ text: 'token Bearer ' + 'B'.repeat(14) }).ok, false);
  assert.equal(store.list().length, 0);
});

test('the store can be switched off, and then it neither stores nor speaks', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  store.remember({ text: 'proyek aemeath-ai-agent sedang di fitur memori', kind: 'project', project: 'aemeath-ai-agent' });
  assert.equal(store.setDisabled(true), true);
  assert.equal(store.remember({ text: 'catatan baru' }).ok, false);
  assert.deepEqual(store.context('aemeath-ai-agent memori'), { entries: [], block: '', chars: 0 });
  assert.equal(store.continuation('full'), null);
  // Existing memories are not destroyed by switching storage off.
  assert.equal(store.list().length, 1);
  assert.equal(storeIn(dir, 2000).status().disabled, true);

  const reopened = storeIn(dir, 3000);
  reopened.setDisabled(false);
  assert.equal(reopened.remember({ text: 'catatan baru' }).ok, true);
});

test('a legacy array file is migrated without losing a single entry', () => {
  const dir = tempDir();
  fs.writeFileSync(
    path.join(dir, FILE_NAME),
    JSON.stringify([
      { text: 'catatan lama satu', createdAt: 500 },
      { text: 'catatan lama dua' },
      'catatan lama tiga',
    ]),
  );
  const store = storeIn(dir, 9000);
  const list = store.list();
  assert.equal(list.length, 3);
  assert.equal(list.every((m) => m.source === 'imported'), true, 'unknown authorship is stated honestly');
  assert.equal(list.some((m) => m.text === 'catatan lama satu'), true);
  assert.match(store.status().notice, /format baru/);
  const written = readRaw(dir);
  assert.equal(written.version, 1);
  assert.equal(written.memories.length, 3);
});

test('an unreadable file is moved aside, never overwritten', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, FILE_NAME), '{ this is not json');
  const store = storeIn(dir, 1000);
  assert.deepEqual(store.list(), []);
  assert.match(store.status().notice, /kupindahkan/);
  const quarantined = fs.readdirSync(dir).filter((name) => name.startsWith('memory.corrupt-'));
  assert.equal(quarantined.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, quarantined[0]), 'utf8'), '{ this is not json');
});

test('a file from a newer version is read-only instead of being rewritten', () => {
  const dir = tempDir();
  const newer = JSON.stringify({ version: 99, memories: [{ id: 'mem-1', text: 'dari masa depan' }] });
  fs.writeFileSync(path.join(dir, FILE_NAME), newer);
  const store = storeIn(dir, 1000);
  assert.equal(store.status().readOnly, true);
  assert.match(store.status().notice, /versi Aemeath yang lebih baru/);
  assert.equal(store.remember({ text: 'tidak boleh menimpa' }).ok, false);
  assert.equal(fs.readFileSync(path.join(dir, FILE_NAME), 'utf8'), newer);
});

test('retention only removes old AI summaries, never what Rover wrote', () => {
  const dir = tempDir();
  let clock = 100 * DAY_MS;
  const store = storeIn(dir, clock, { retentionDays: 30 });
  store.remember({ text: 'ringkasan sesi lama dari AI', source: 'assistant' });
  store.remember({ text: 'preferensi yang aku tulis sendiri', source: 'user' });

  clock += 40 * DAY_MS;
  const reopened = storeIn(dir, clock);
  const list = reopened.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].source, 'user');
  assert.equal(reopened.status().prunedAtLoad, 1);
  assert.equal(reopened.status().retentionScope, 'assistant-only');
});

test('the cap refuses new memories instead of deleting old ones', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000, { maxEntries: 2 });
  assert.equal(store.remember({ text: 'satu' }).ok, true);
  assert.equal(store.remember({ text: 'dua' }).ok, true);
  const refused = store.remember({ text: 'tiga' });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /penuh/);
  assert.equal(store.list().length, 2);
});

test('context returns only what overlaps with the message, and is capped', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  store.remember({
    text: 'aemeath-ai-agent: modul memori selesai, lanjut Focus Companion 2.0',
    kind: 'next-step',
    project: 'aemeath-ai-agent',
  });
  store.remember({ text: 'suka dijelaskan singkat dan langsung', kind: 'preference' });

  const hit = store.context('besok lanjut kerja di aemeath-ai-agent?');
  assert.equal(hit.entries.length, 1);
  assert.match(hit.block, /langkah berikutnya/);
  assert.match(hit.block, /Focus Companion/);
  assert.equal(hit.entries[0].project, 'aemeath-ai-agent');

  // An unrelated question gets nothing: the whole store is never attached.
  assert.deepEqual(store.context('resep nasi goreng'), { entries: [], block: '', chars: 0 });

  // A greeting with no keywords may bring one recent unfinished thing.
  const greeting = store.context('apa itu');
  assert.equal(greeting.entries.length, 1);
  assert.ok(greeting.chars > 0);
});

test('the context block stops at the character budget', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  const long = 'proyek memori '.repeat(16).slice(0, MAX_TEXT);
  for (let i = 0; i < 5; i += 1) {
    store.remember({ text: long + ' nomor ' + i, kind: 'project', project: 'proyek-memori-' + i });
  }
  const hit = store.context('proyek memori');
  assert.ok(hit.entries.length > 0 && hit.entries.length < 5);
  assert.ok(hit.chars <= MAX_CONTEXT_CHARS + MAX_TEXT);
});

test('a used memory is stamped, so the manager can show when it was last read', () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  const saved = store.remember({ text: 'proyek aemeath-ai-agent: memori', kind: 'project' }).memory;
  assert.equal(saved.usedAt, null);
  assert.equal(store.used([saved.id]), 1);
  assert.equal(store.list()[0].usedAt, 1000);
  assert.equal(storeIn(dir, 2000).list()[0].usedAt, 1000, 'the stamp survives a restart');
});

test('a session summary is only stored after Rover accepts the offer', () => {
  const dir = tempDir();
  const store = storeIn(dir, 5000);
  assert.equal(store.proposeSession({ project: 'aemeath-ai-agent', summary: 'pendek' }), null);

  const offer = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Menambahkan modul memori companion beserta tesnya; semua tes lulus.',
  });
  assert.equal(offer.actionable, true);
  assert.match(offer.text, /Mau kusimpan/);
  assert.equal(store.list().length, 0, 'nothing is written before the answer');

  const accepted = store.acceptOffer(offer.id);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.memory.source, 'assistant');
  assert.match(accepted.text, /Sudah kusimpan/);
  assert.equal(store.list().length, 1);
  assert.equal(store.acceptOffer(offer.id).ok, false, 'the same offer cannot be stored twice');
});

test('accepting a session offer with a next step creates two distinct entries that can be forgotten separately', () => {
  const dir = tempDir();
  const store = storeIn(dir, 5000);

  // 1. Next step parsed from summary marker
  const offerWithMarker = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Menyelesaikan modul auth dan token. Langkah berikutnya: tambahkan verifikasi email.',
  });
  assert.ok(offerWithMarker);
  const acceptedWithMarker = store.acceptOffer(offerWithMarker.id);
  assert.equal(acceptedWithMarker.ok, true);
  assert.equal(acceptedWithMarker.memories.length, 2);

  const list = store.list();
  assert.equal(list.length, 2);
  const contextMem = list.find((m) => m.kind === 'context');
  const nextStepMem = list.find((m) => m.kind === 'next-step');

  assert.ok(contextMem, 'context entry exists');
  assert.ok(nextStepMem, 'next-step entry exists');
  assert.equal(contextMem.source, 'assistant');
  assert.equal(nextStepMem.source, 'assistant');
  assert.equal(contextMem.project, 'aemeath-ai-agent');
  assert.equal(nextStepMem.project, 'aemeath-ai-agent');
  assert.match(contextMem.text, /Menyelesaikan modul auth/);
  assert.match(nextStepMem.text, /tambahkan verifikasi email/);

  // Both can be deleted separately
  assert.equal(store.forget(contextMem.id), true);
  assert.equal(store.list().length, 1);
  assert.equal(store.list()[0].id, nextStepMem.id);
  assert.equal(store.forget(nextStepMem.id), true);
  assert.equal(store.list().length, 0);

  // 2. Explicit nextStep provided in input
  const offerExplicit = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Sesi refactor arsitektur selesai.',
    nextStep: 'Tulis unit test tambahan.',
  });
  assert.ok(offerExplicit);
  const acceptedExplicit = store.acceptOffer(offerExplicit.id);
  assert.equal(acceptedExplicit.ok, true);
  assert.equal(acceptedExplicit.memories.length, 2);
  assert.equal(store.list().length, 2);
  assert.equal(store.list().filter((m) => m.kind === 'context').length, 1);
  assert.equal(store.list().filter((m) => m.kind === 'next-step').length, 1);
  assert.ok(store.list().every((m) => m.source === 'assistant'));
  assert.ok(store.list().every((m) => m.project === 'aemeath-ai-agent'));

  // 3. Summary without next step creates only one entry and does not invent anything
  const offerPlain = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Pekerjaan selesai dan semua commit sudah rapi.',
  });
  const acceptedPlain = store.acceptOffer(offerPlain.id);
  assert.equal(acceptedPlain.ok, true);
  assert.equal(acceptedPlain.memories.length, 1);
  assert.equal(acceptedPlain.memories[0].kind, 'context');
});

test('splitSummaryAndNextStep correctly separates next steps or leaves plain summaries intact', () => {
  // Various Indonesian markers
  const id1 = splitSummaryAndNextStep('Pekerjaan selesai. Langkah berikutnya: jalankan migrasi database.');
  assert.equal(id1.summary, 'Pekerjaan selesai');
  assert.equal(id1.nextStep, 'jalankan migrasi database.');

  const id2 = splitSummaryAndNextStep('Fitur login beres; langkah selanjutnya: buat form registrasi.');
  assert.equal(id2.summary, 'Fitur login beres');
  assert.equal(id2.nextStep, 'buat form registrasi.');

  const id3 = splitSummaryAndNextStep('Refactor selesai - rencana berikutnya: audit performa');
  assert.equal(id3.summary, 'Refactor selesai');
  assert.equal(id3.nextStep, 'audit performa');

  // English markers
  const en1 = splitSummaryAndNextStep('Refactored router module. Next step: write integration tests.');
  assert.equal(en1.summary, 'Refactored router module');
  assert.equal(en1.nextStep, 'write integration tests.');

  const en2 = splitSummaryAndNextStep('Cleaned up dependencies; TODO: update lockfile.');
  assert.equal(en2.summary, 'Cleaned up dependencies');
  assert.equal(en2.nextStep, 'update lockfile.');

  // Plain summary without marker
  const plain = splitSummaryAndNextStep('Menambahkan modul memori companion beserta tesnya; semua tes lulus.');
  assert.equal(plain.summary, 'Menambahkan modul memori companion beserta tesnya; semua tes lulus.');
  assert.equal(plain.nextStep, null);

  // Short prefix does not get butchered
  const shortPrefix = splitSummaryAndNextStep('Langkah berikutnya: lakukan hal ini');
  assert.equal(shortPrefix.nextStep, null);

  // Non-string or empty input
  assert.equal(splitSummaryAndNextStep(null).summary, '');
  assert.equal(splitSummaryAndNextStep(null).nextStep, null);
});

test('an unanswered offer expires and can be dismissed', () => {
  const dir = tempDir();
  let nowMs = 5000;
  const store = createMemoryStore({ dir: dir, now: () => nowMs });
  const offer = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Sesi selesai dengan tiga berkas berubah dan dua tes baru.',
  });
  assert.equal(store.dismissOffer(offer.id), true);
  assert.equal(store.acceptOffer(offer.id).ok, false);
  assert.equal(store.list().length, 0);

  const stale = store.proposeSession({
    project: 'aemeath-ai-agent',
    summary: 'Sesi lain selesai dan menunggu jawabanmu yang belum datang.',
  });
  nowMs += OFFER_TTL_MS + 1;
  assert.equal(store.acceptOffer(stale.id).ok, false, 'a stale offer is not stored late');
  assert.equal(store.list().length, 0);
});

test('the continuation offer waits for Medium or Full and respects its cooldown', () => {
  const dir = tempDir();
  let clock = 1000;
  const store = storeIn(dir, clock);
  store.remember({ text: 'menyelesaikan modul memori', kind: 'next-step', project: 'aemeath-ai-agent' });

  assert.equal(store.continuation('low'), null, 'Low never starts a conversation from memory');
  const offer = store.continuation('medium');
  assert.match(offer.text, /langkah berikutnya/);
  assert.match(offer.text, /aemeath-ai-agent/);
  assert.equal(store.continuation('medium'), null, 'not twice in the same window');

  clock += CONTINUATION_GAP_MS + 1;
  const again = storeIn(dir, clock);
  assert.ok(again.continuation('full'), 'and it comes back after the window');
});

test('chat attaches the memory block to the system prompt and reports the count', async () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  store.remember({
    text: 'aemeath-ai-agent: lanjut ke Focus Companion setelah modul memori',
    kind: 'next-step',
    project: 'aemeath-ai-agent',
  });
  const sent = [];
  const chat = createChatService({
    providers: {
      get: () => ({
        id: 'fake',
        name: 'Fake',
        defaultModel: 'fake-1',
        send: async (request) => {
          sent.push(request);
          return { text: 'Siap, Rover!' };
        },
      }),
    },
    getKey: () => 'k'.repeat(24),
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
    memory: {
      context: (text) => store.context(text),
      used: (ids) => store.used(ids),
    },
  });

  const reply = await chat.send('besok lanjut aemeath-ai-agent ya?');
  assert.equal(reply.memoryUsed, 1);
  const system = sent[0].messages[0];
  assert.equal(system.role, 'system');
  assert.match(system.content, /Memori companion/);
  assert.match(system.content, /Focus Companion/);
  assert.equal(system.content.startsWith(buildSystemPrompt()), true, 'the persona still comes first');
  assert.equal(store.list()[0].usedAt, 1000, 'attaching it counts as using it');

  const cold = await chat.send('apa kabar?');
  assert.equal(cold.memoryUsed, undefined, 'a message with no overlap carries no memory');
});

test('without a memory store the chat prompt is unchanged', async () => {
  const sent = [];
  const chat = createChatService({
    providers: {
      get: () => ({
        id: 'fake',
        name: 'Fake',
        defaultModel: 'fake-1',
        send: async (request) => {
          sent.push(request);
          return { text: 'ok' };
        },
      }),
    },
    getKey: () => 'k'.repeat(24),
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
  });
  assert.deepEqual(await chat.send('halo'), { text: 'ok', mode: 'ai', sources: [] });
  assert.equal(sent[0].messages[0].content, buildSystemPrompt());
});

test('a broken memory store never breaks the chat', async () => {
  const chat = createChatService({
    providers: {
      get: () => ({ id: 'fake', name: 'Fake', defaultModel: 'fake-1', send: async () => ({ text: 'ok' }) }),
    },
    getKey: () => 'k'.repeat(24),
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
    memory: {
      context: () => {
        throw new Error('disk on fire');
      },
      used: () => {
        throw new Error('disk on fire');
      },
    },
  });
  assert.deepEqual(await chat.send('halo'), { text: 'ok', mode: 'ai', sources: [] });
});

test('offline answers may quote a stored note instead of shrugging', async () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  store.remember({
    text: 'aemeath-ai-agent: modul memori selesai, tesnya hijau',
    kind: 'project',
    project: 'aemeath-ai-agent',
  });
  const chat = createChatService({
    providers: {
      get: () => ({ id: 'fake', name: 'Fake', defaultModel: 'fake-1', send: async () => ({ text: 'x' }) }),
    },
    getKey: () => null,
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
    getFeatures: () => ({ offlineFallback: true }),
    localResponder: createLocalResponder({ getEntries: () => [] }),
    memory: {
      context: (text) => store.context(text),
      used: (ids) => store.used(ids),
    },
  });

  const reply = await chat.send('gimana progres aemeath-ai-agent?');
  assert.equal(reply.mode, 'local');
  assert.match(reply.text, /Dari catatanku/);
  assert.match(reply.text, /modul memori selesai/);
  assert.equal(reply.memoryUsed, 1);
});

test('memory offers obey the interactive mode, the pause switch and Focus Mode', () => {
  const offer = { kind: 'memory-offer', text: 'Rover, mau kusimpan ringkasannya?', category: 'memory:offer' };

  assert.equal(createBehaviorDirector({ mode: 'low' }).submit(offer, 1000).action, 'drop');
  assert.equal(createBehaviorDirector({ mode: 'medium' }).submit(offer, 1000).action, 'show');
  assert.equal(createBehaviorDirector({ mode: 'full' }).submit(offer, 1000).action, 'show');

  const paused = createBehaviorDirector({ mode: 'medium' });
  paused.setPaused(true);
  assert.equal(paused.submit(offer, 1000).action, 'drop');

  const focused = createBehaviorDirector({ mode: 'full' });
  focused.setFocus(true);
  assert.equal(focused.submit(offer, 1000).action, 'drop');

  // The answer to her own question is a direct reply, so even Low mode hears it.
  const low = createBehaviorDirector({ mode: 'low' });
  assert.equal(low.submit({ kind: 'memory-saved', text: 'Sudah kusimpan.' }, 1000).action, 'show');
});

test('the director keeps the buttons a memory offer carries', () => {
  const director = createBehaviorDirector({ mode: 'medium' });
  const decision = director.submit(
    { kind: 'memory-offer', text: 'Rover, mau kusimpan?', action: { id: 'offer-1', label: 'Simpan' } },
    1000,
  );
  assert.equal(decision.action, 'show');
  assert.deepEqual(decision.item.action, { id: 'offer-1', label: 'Simpan' });

  // A line without an action still has the field, so the renderer can test it.
  const plain = createBehaviorDirector({ mode: 'medium' }).submit({ kind: 'chatter', text: 'halo' }, 1000);
  assert.equal(plain.item.action, null);
});

test('chatter preference offer respects mode, cooldown, and never modifies settings without user acceptance', () => {
  const dir = tempDir();
  let clock = 1000;
  const store = storeIn(dir, () => clock);

  // 1. Unrelated preference does not trigger a chatter interval offer
  store.remember({ text: 'Suka penjelasan ringkas', kind: 'preference' });
  assert.equal(store.preferenceOffer('medium', 3.5), null);

  // 2. Add greeting frequency preference
  store.remember({ text: 'Jangan terlalu sering menyapa ya, kurangi frekuensi', kind: 'preference' });

  // Low mode and disabled store never propose proactive offers
  assert.equal(store.preferenceOffer('low', 3.5), null, 'Low mode stays quiet');
  store.setDisabled(true);
  assert.equal(store.preferenceOffer('medium', 3.5), null, 'Disabled store stays quiet');
  store.setDisabled(false);

  // If already at maximum interval (15), no further reduction needed
  assert.equal(store.preferenceOffer('medium', 15), null);

  // In Medium or Full with standard interval (3.5), proposes an adjustment
  const offer = store.preferenceOffer('medium', 3.5);
  assert.ok(offer, 'offer should be generated');
  assert.equal(offer.actionable, true);
  assert.equal(offer.actionLabel, 'Ubah');
  assert.equal(typeof offer.suggestedInterval, 'number');
  assert.ok(offer.suggestedInterval > 3.5, 'suggested interval should be larger for rarer greeting preference');
  assert.match(offer.text, /preferensi/i);

  // Cooldown check: within the cooldown window, returns null
  assert.equal(store.preferenceOffer('medium', 3.5), null, 'must respect cooldown window');

  // Cooldown expires: offer can be made again
  clock += PREFERENCE_OFFER_GAP_MS + 10;
  const offer2 = store.preferenceOffer('full', 3.5);
  assert.ok(offer2, 'offer returns after cooldown');

  // Dismissing the offer removes it without any settings patch
  assert.equal(store.dismissOffer(offer2.id), true);

  // Make another offer to test acceptOffer
  clock += PREFERENCE_OFFER_GAP_MS + 10;
  const offer3 = store.preferenceOffer('medium', 3.5);
  assert.ok(offer3);

  // Accepting the offer returns settingsPatch with suggested interval and confirmation text
  const accepted = store.acceptOffer(offer3.id);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.settingsPatch, { chatterIntervalMin: offer3.suggestedInterval });
  assert.match(accepted.text, /interval sapaan/i);

  // Stale/expired offer cannot be accepted
  clock += PREFERENCE_OFFER_GAP_MS + 10;
  const staleOffer = store.preferenceOffer('medium', 3.5);
  assert.ok(staleOffer);
  clock += OFFER_TTL_MS + 10;
  assert.equal(store.acceptOffer(staleOffer.id).ok, false, 'expired offer rejected');
});

test('/memory builtin command lists, disables/enables, and safely deletes with valid numbers only', async () => {
  const dir = tempDir();
  const store = storeIn(dir, 1000);
  const builtin = createMemoryBuiltin(store);

  // 1. Empty list
  const emptyRes = await builtin.run('');
  assert.equal(emptyRes.ok, true);
  assert.match(emptyRes.text, /belum ada memori/i);

  // 2. Add memories
  store.remember({ text: 'proyek aemeath', kind: 'project' });
  store.remember({ text: 'selesaikan p1 roadmap', kind: 'task' });

  // 3. List memories
  const listRes = await builtin.run('');
  assert.equal(listRes.ok, true);
  assert.match(listRes.text, /Daftar memori \(2\)/);
  assert.match(listRes.text, /1\./);
  assert.match(listRes.text, /2\./);

  // 4. Disable and enable
  const disableRes = await builtin.run('nonaktif');
  assert.equal(disableRes.ok, true);
  assert.equal(store.disabled, true);
  const disabledListRes = await builtin.run('');
  assert.match(disabledListRes.text, /nonaktif/i);

  const enableRes = await builtin.run('aktif');
  assert.equal(enableRes.ok, true);
  assert.equal(store.disabled, false);

  // 5. Deleting with invalid numbers does NOT delete anything
  const noNum = await builtin.run('hapus');
  assert.equal(noNum.ok, false);
  assert.equal(store.list().length, 2);

  const invalidNum = await builtin.run('hapus abc');
  assert.equal(invalidNum.ok, false);
  assert.equal(store.list().length, 2);

  const outOfRange = await builtin.run('hapus 99');
  assert.equal(outOfRange.ok, false);
  assert.equal(store.list().length, 2);

  // 6. Deleting with valid number (1) deletes target memory
  const delRes = await builtin.run('hapus 1');
  assert.equal(delRes.ok, true);
  assert.equal(store.list().length, 1);
  assert.match(delRes.text, /sudah kuhapus/i);
});

