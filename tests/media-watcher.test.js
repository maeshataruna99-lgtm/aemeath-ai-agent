'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const { createMediaWatcher } = require('../src/media-watcher');

function fakeSpawn() {
  const children = [];
  const spawn = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stdout.setEncoding = () => {};
    child.killed = false;
    child.kill = () => {
      child.killed = true;
    };
    children.push(child);
    return child;
  };
  spawn.children = children;
  return spawn;
}

test('turning music detection off and on again starts the watcher again', () => {
  const spawn = fakeSpawn();
  const statuses = [];
  const watcher = createMediaWatcher({ spawn, onStatus: (status) => statuses.push(status) });

  watcher.start();
  assert.equal(spawn.children.length, 1);
  spawn.children[0].stdout.emit('data', JSON.stringify([{ status: 'Playing', title: 'Song', artist: 'A', app: 'x' }]) + '\n');
  assert.equal(statuses[statuses.length - 1].playing, true);

  watcher.stop();
  assert.equal(spawn.children[0].killed, true);

  watcher.start();
  assert.equal(spawn.children.length, 2, 'a second start must launch a new child; it used to do nothing');
  spawn.children[1].stdout.emit('data', JSON.stringify([]) + '\n');
  assert.equal(statuses[statuses.length - 1].playing, false);
  watcher.stop();
});
