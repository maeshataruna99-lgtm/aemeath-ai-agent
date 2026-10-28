'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectJourneyWell,
  getJourneyWellReply,
  createJourneyWellEvent,
  EMOTIONS,
  ATLAS_ANIMATIONS,
} = require('../src/chat/journey-well');

const { createBehaviorDirector, PRIORITY } = require('../src/behavior/behavior-director');
const { createChatService } = require('../src/chat/chat-service');
const { createLocalResponder } = require('../src/chat/local-responder');

test('Journey Well: detects exact phrase, case variants, and extra punctuation/spaces', () => {
  const exact = detectJourneyWell('Journey well');
  assert.equal(exact.matched, true);
  assert.equal(exact.isSignature, true);
  assert.equal(exact.isDirectFarewell, true);
  assert.equal(exact.emotion, EMOTIONS.WISTFUL_CONCERN);
  assert.equal(exact.animation, 'waving');

  const cases = [
    'journey well',
    'JOURNEY WELL',
    'jOuRnEy WeLl!',
    '  journey    well...   ',
    'Journey well~',
    '“Journey well”',
    '"Journey well!"',
    '«Journey well»',
    'Journey well, Aemeath!',
    'Aemeath, journey well.',
    'Journey well Rover',
    'Journey well ya Aemeath',
  ];

  for (const c of cases) {
    const res = detectJourneyWell(c);
    assert.equal(res.isDirectFarewell, true, `Expected direct farewell for: ${c}`);
    assert.equal(res.animation, 'waving', `Expected waving animation for: ${c}`);
  }
});

test('Journey Well: avoids false positives when quoted or discussed analytically', () => {
  const quoteCases = [
    'Aemeath says "Journey well"',
    'Dia bilang "journey well"',
    'I saw the phrase Journey Well in a wiki',
    'What does journey well mean?',
    'Apa maksud ucapan Journey Well?',
    'Kenapa kamu menyebut Journey Well?',
    'Aku baca soal Journey Well di internet',
    'The quote "journey well" appears in the story',
  ];

  for (const c of quoteCases) {
    const res = detectJourneyWell(c);
    assert.equal(res.isDirectFarewell, false, `Expected NOT direct farewell for: ${c}`);
    assert.equal(res.type, 'discussion', `Expected discussion type for: ${c}`);
    assert.equal(res.emotion, EMOTIONS.NEUTRAL_HELPFUL);
  }
});

test('Journey Well: ignores unrelated sentences or non-signature journey phrases', () => {
  const unrelated = [
    'Have a good journey',
    'Have a safe trip',
    'journey',
    'well',
    'wellness journey',
    'well journey',
    'today is a good day',
    'halo aemeath',
  ];

  for (const c of unrelated) {
    const res = detectJourneyWell(c);
    assert.equal(res.isDirectFarewell, false, `Expected false for: ${c}`);
    assert.equal(res.isSignature, false, `Expected not signature for: ${c}`);
  }
});

test('Journey Well: reply generator selects character-consistent dialogue', () => {
  const idReply = getJourneyWellReply({ text: 'Journey well ya', rng: () => 0 });
  assert.match(idReply, /Journey well|Perjalanan yang baik/);
  assert.match(idReply, /Rover/);

  const enReply = getJourneyWellReply({ text: 'Journey well, take care and stay safe', language: 'en', rng: () => 0 });
  assert.match(enReply, /Journey well, Rover/);
});

test('Journey Well: BehaviorDirector prioritizes farewell as direct (priority 3)', () => {
  let now = 1000;
  const director = createBehaviorDirector({ now: () => now });

  // 1. Submit a routine chatter (priority 6)
  director.submit({ kind: 'chatter', text: 'Melayang-layang...' }, now);
  assert.equal(director.state().active.text, 'Melayang-layang...');

  // 2. Submit Journey Well farewell (priority 3 - direct) -> preempts chatter
  const event = createJourneyWellEvent('Journey well, Aemeath!');
  assert.equal(event.priority, PRIORITY.direct);
  assert.equal(event.anim, 'waving');

  const decision = director.submit(event, now + 100);
  assert.equal(decision.action, 'preempt');
  assert.equal(director.state().active.kind, 'journey-well-farewell');
  assert.equal(director.state().active.anim, 'waving');

  // 3. A pending decision (priority 1) still takes precedence over direct
  const decisionRequest = director.submit(
    { kind: 'decision-request', text: 'Izin eksekusi kode?' },
    now + 200,
  );
  assert.equal(decisionRequest.action, 'preempt');
  assert.equal(director.state().active.kind, 'decision-request');
});

test('Journey Well: online / offline parity in ChatService', async () => {
  let modelCalls = 0;
  const providers = {
    get: () => ({
      id: 'fake',
      name: 'Fake',
      defaultModel: 'fake-1',
      send: async () => {
        modelCalls += 1;
        return { text: 'Model response' };
      },
    }),
  };

  // 1. Online with API key: signature phrase triggers locally without model call
  const onlineService = createChatService({
    providers,
    getKey: () => 'sk-valid-key',
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
  });

  const onlineReply = await onlineService.send('Journey well!');
  assert.equal(onlineReply.mode, 'local');
  assert.equal(onlineReply.anim, 'waving');
  assert.equal(onlineReply.event, 'journey-well-farewell');
  assert.equal(modelCalls, 0, 'Should not have called external model');

  // 2. Offline / no API key: signature phrase triggers locally without error
  const offlineService = createChatService({
    providers,
    getKey: () => null,
    getConfig: () => ({ provider: 'fake', model: 'fake-1' }),
  });

  const offlineReply = await offlineService.send('Journey well');
  assert.equal(offlineReply.mode, 'local');
  assert.equal(offlineReply.anim, 'waving');
  assert.equal(offlineReply.event, 'journey-well-farewell');

  // 3. Discussion message online: does NOT intercept, continues to model
  const discussionReply = await onlineService.send('Aemeath says "Journey well" in the story');
  assert.equal(discussionReply.mode, 'ai');
  assert.equal(modelCalls, 1, 'Discussion should be forwarded to model');
});

test('Journey Well: localResponder answers direct farewell with matched=true and waving animation', () => {
  const responder = createLocalResponder({
    getEntries: () => [],
    rng: () => 0,
  });

  const res = responder.respond('Journey well, Rover!', 'no-key');
  assert.equal(res.matched, true);
  assert.equal(res.anim, 'waving');
  assert.equal(res.event, 'journey-well-farewell');
  assert.match(res.text, /Journey well|Rover/);
});
