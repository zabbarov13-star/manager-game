const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const source = readFileSync(require.resolve('./dist/engine.cjs'), 'utf8');
const fixture = { exports: {} };
const marker = 'module.exports={handleRooms,CHARACTERS,COLORS};';
assert.ok(source.includes(marker));
new Function('module', source.replace(marker,
  'module.exports={CHARACTERS,COLORS,createMatch,MatchEngine,validMatch,buildingAvailability,buildingStock,resetRoomClock};'))(fixture);
const engine = fixture.exports;
const players = [0, 1].map(i => ({ name: 'Строитель ' + (i + 1),
  character: engine.CHARACTERS[i].id, color: engine.COLORS[i].id }));

function game(rulesProfile = 'original') {
  const state = engine.createMatch(players, { firstPlayer: 0, rulesProfile });
  state.players[0].balance = 200000;
  return state;
}
function beforeLanding(state, cell) {
  // A deterministic starting position avoids simulating an entire circuit between assertions.
  state.players[0].position = (cell + 37) % 40;
  state.phase = 'ready';
  state.buildVisit = null;
}
function land(state, cell) {
  beforeLanding(state, cell);
  new engine.MatchEngine(state).roll([1, 2]);
  assert.equal(state.players[0].position, cell);
  assert.ok(engine.validMatch(state));
}
module.exports = { ...engine, players, game, beforeLanding, land };
