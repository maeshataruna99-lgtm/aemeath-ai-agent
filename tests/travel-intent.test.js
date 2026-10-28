'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveTravelIntent,
  getTravelDialogue,
  getTravelChecklist,
  createTravelEvent,
  INTENTS,
  SUB_INTENTS,
  EMOTIONS,
} = require('../src/chat/travel-intent');

const { createBehaviorDirector, PRIORITY } = require('../src/behavior/behavior-director');
const { createChatService } = require('../src/chat/chat-service');
const { createLocalResponder } = require('../src/chat/local-responder');

test('Travel Intent: identifies casual trips, vacation, and general travel plans', () => {
  const casual = resolveTravelIntent('Aku mau ke kafe sebentar beli kopi');
  assert.equal(casual.intent, INTENTS.TRAVEL_PLAN);
  assert.equal(casual.subIntent, SUB_INTENTS.CASUAL_TRIP);
  assert.equal(casual.emotion, EMOTIONS.WARM_CONCERN);
  assert.equal(casual.animation, 'waving');

  const vacation = resolveTravelIntent('Besok mau liburan ke Bali bareng keluarga');
  assert.equal(vacation.intent, INTENTS.TRAVEL_PLAN);
  assert.equal(vacation.subIntent, SUB_INTENTS.VACATION);

  const commute = resolveTravelIntent('Minggu depan ada perjalanan dinas ke luar kota');
  assert.equal(commute.intent, INTENTS.TRAVEL_PLAN);
  assert.equal(commute.subIntent, SUB_INTENTS.GENERAL_TRIP);
});

test('Travel Intent: identifies adventure and expedition contexts', () => {
  const hike = resolveTravelIntent('Aku mau mendaki gunung Semeru minggu depan');
  assert.equal(hike.intent, INTENTS.ADVENTURE);
  assert.equal(hike.subIntent, SUB_INTENTS.EXPEDITION);
  assert.equal(hike.emotion, EMOTIONS.WARM_CONCERN);
  assert.equal(hike.animation, 'waving');

  const camp = resolveTravelIntent('Rencana mau berkemah dan camping di hutan pinus');
  assert.equal(camp.intent, INTENTS.ADVENTURE);
});

test('Travel Intent: separates normal travel from explicit travel-risk situations', () => {
  // Safe travel plan: bare mention of travel is NEVER risky
  const safeTrip = resolveTravelIntent('Aku mau naik kereta ke Yogyakarta besok');
  assert.equal(safeTrip.intent, INTENTS.TRAVEL_PLAN);

  // Risky trip 1: Night travel alone
  const nightRisk = resolveTravelIntent('Aku mau jalan kaki sendirian lewat lorong gelap tengah malam');
  assert.equal(nightRisk.intent, INTENTS.TRAVEL_RISK);
  assert.equal(nightRisk.subIntent, SUB_INTENTS.RISKY_TRAVEL);
  assert.equal(nightRisk.emotion, EMOTIONS.SERIOUS_SUPPORT);
  assert.equal(nightRisk.animation, 'waiting');

  // Risky trip 2: Solo hiking in blizzard/storm
  const stormRisk = resolveTravelIntent('Aku mau mendaki gunung sendirian saat badai salju');
  assert.equal(stormRisk.intent, INTENTS.TRAVEL_RISK);
  assert.equal(stormRisk.subIntent, SUB_INTENTS.RISKY_TRAVEL);

  // Risky trip 3: Extreme hazard departure
  const hazardDeparture = resolveTravelIntent('Aku berangkat sekarang sendirian di tengah badai');
  assert.equal(hazardDeparture.intent, INTENTS.TRAVEL_RISK);
  assert.equal(hazardDeparture.subIntent, SUB_INTENTS.RISKY_DEPARTURE);
});

test('Travel Intent: detects departure and safe return', () => {
  const departure = resolveTravelIntent('Aku berangkat sekarang ya, Aemeath!');
  assert.equal(departure.intent, INTENTS.DEPARTURE);
  assert.equal(departure.emotion, EMOTIONS.WARM_CONCERN);
  assert.equal(departure.animation, 'waving');

  const pamit = resolveTravelIntent('Aku pamit dulu ya');
  assert.equal(pamit.intent, INTENTS.DEPARTURE);

  const arrived = resolveTravelIntent('Aku sudah sampai di rumah dengan selamat');
  assert.equal(arrived.intent, INTENTS.RETURN);
  assert.equal(arrived.emotion, EMOTIONS.EXCITED);
  assert.equal(arrived.animation, 'jumping');

  const gotBack = resolveTravelIntent('Baru saja sampai di hotel, aman!');
  assert.equal(gotBack.intent, INTENTS.RETURN);
});

test('Travel Intent: resolves short follow-up messages using recent conversation context', () => {
  const history = [
    { role: 'user', content: 'Besok aku ada rencana liburan ke Bandung' },
    { role: 'assistant', content: 'Wah seru! Mau naik apa ke sana?' },
  ];

  // Follow-up: "besok jadi berangkat" by itself is short
  const res = resolveTravelIntent('besok jadi berangkat', history);
  assert.equal(res.intent, INTENTS.TRAVEL_PLAN);
  assert.ok(res.signals.includes('context_resolved_travel_plan'));

  const hikeHistory = [
    { role: 'user', content: 'Minggu depan mau mendaki gunung Prau' },
    { role: 'assistant', content: 'Gunung Prau pemandangannya indah!' },
  ];
  const hikeFollowup = resolveTravelIntent('semua sudah siap', hikeHistory);
  assert.equal(hikeFollowup.intent, INTENTS.ADVENTURE);
  assert.ok(hikeFollowup.signals.includes('context_resolved_adventure'));
});

test('Travel Intent: handles technical mentions without false positives', () => {
  const technical = [
    'How do I configure the route in Express.js?',
    'Customer journey mapping is essential for UI UX designers',
    'The band Journey produced classic rock songs',
    'Data packet travel time is delayed by routing table',
  ];

  for (const t of technical) {
    const res = resolveTravelIntent(t);
    assert.equal(res.intent, INTENTS.NONE, `Expected NONE for technical query: ${t}`);
  }
});

test('Travel Intent: provides checklists only for adventure and risk, not casual', () => {
  const casual = resolveTravelIntent('Mau jalan ke minimarket beli snack');
  assert.equal(getTravelChecklist(casual), null);

  const adventure = resolveTravelIntent('Aku mau mendaki gunung Rinjani');
  const advChecklist = getTravelChecklist(adventure);
  assert.ok(Array.isArray(advChecklist));
  assert.ok(advChecklist.some((item) => /minum|logistik/i.test(item)));

  const risk = resolveTravelIntent('Mau jalan kaki sendirian lewat lorong sepi tengah malam');
  const riskChecklist = getTravelChecklist(risk);
  assert.ok(Array.isArray(riskChecklist));
  assert.ok(riskChecklist.some((item) => /baterai|ponsel/i.test(item)));

  // Dialogue generation with checklist
  const dialogue = getTravelDialogue(risk, { includeChecklist: true });
  assert.match(dialogue, /Catatan kecil dari Aemeath/);
  assert.match(dialogue, /baterai/i);
});

test('Travel Intent: creates BehaviorDirector event with direct priority (3)', () => {
  const event = createTravelEvent('Aku pamit dulu ya, Aemeath!');
  assert.equal(event.kind, 'travel-farewell');
  assert.equal(event.priority, PRIORITY.direct);
  assert.equal(event.anim, 'waving');
  assert.match(event.text, /Rover/);

  let now = 1000;
  const director = createBehaviorDirector({ now: () => now });
  const decision = director.submit(event, now);
  assert.equal(decision.action, 'show');
  assert.equal(director.state().active.kind, 'travel-farewell');
});

test('Travel Intent: localResponder answers departure and safe return', () => {
  const responder = createLocalResponder({
    getEntries: () => [],
    rng: () => 0,
  });

  // Departure offline
  const depReply = responder.respond('Aku berangkat sekarang ya, Aemeath!', 'no-key');
  assert.equal(depReply.matched, true);
  assert.equal(depReply.anim, 'waving');
  assert.equal(depReply.travelIntent, INTENTS.DEPARTURE);
  assert.match(depReply.text, /Rover/);

  // Return offline
  const retReply = responder.respond('Aku sudah sampai di rumah dengan selamat', 'offline');
  assert.equal(retReply.matched, true);
  assert.equal(retReply.anim, 'jumping');
  assert.equal(retReply.travelIntent, INTENTS.RETURN);
  assert.match(retReply.text, /selamat|pulang|Rover/i);
});

test('Travel Intent: chatService handles departure locally and annotates online trips', async () => {
  let receivedMessages = [];
  const providers = {
    get: () => ({
      id: 'fake',
      name: 'Fake',
      defaultModel: 'fake-1',
      send: async (req) => {
        receivedMessages = req.messages;
        return { text: 'Semoga pendakianmu menyenangkan dan lancar, Rover!' };
      },
    }),
  };

  const service = createChatService({
    providers,
    getKey: () => 'sk-valid',
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
  });

  // 1. Direct departure is handled locally without invoking provider
  const depReply = await service.send('Aku berangkat dulu ya!');
  assert.equal(depReply.mode, 'local');
  assert.equal(depReply.anim, 'waving');
  assert.equal(depReply.travelIntent, INTENTS.DEPARTURE);

  // 2. Adventure plan online invokes provider with travel context annotation
  const advReply = await service.send('Minggu depan aku mau mendaki gunung Semeru');
  assert.equal(advReply.mode, 'ai');
  assert.equal(advReply.anim, 'waving');
  assert.equal(advReply.travelIntent, INTENTS.ADVENTURE);

  const lastUserMsg = receivedMessages[receivedMessages.length - 1].content;
  assert.match(lastUserMsg, /\[Konteks perjalanan: intent=adventure/);
});
