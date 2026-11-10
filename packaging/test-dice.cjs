const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const html = fs.readFileSync('online/dist/index.html', 'utf8');
const pcm = html.slice(html.indexOf('function randomSource('), html.indexOf('// Complete user-supplied tracks'));
const method = html.match(/ roll\(short=false\)\{\n  const context=this.ctx;[\s\S]+?\n \}/)?.[0];
assert(method);
const Audio = vm.runInNewContext(pcm + 'class Audio {' + method + '}; Audio', {
  PACE: { dice: 780 }, document: { hidden: false },
});
function fixture({ sfxOn = true, baseLatency = .012, outputLatency = .012 } = {}) {
  const player = new Audio();
  const sources = [];
  player.settings = { sfxOn, sfx: .7 };
  player.duck = () => {};
  player.ctx = {
    state: 'running', baseLatency, outputLatency, sampleRate: 48000,
    createBuffer(_channels, length, sampleRate) {
      const data = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start() { sources.push(this); } };
      return source;
    },
  };
  return { player, sources };
}
test('one source per toss, soft tail and silence before the dice settle', () => {
  const { player, sources } = fixture();
  player.roll();
  player.roll();
  assert.equal(sources.length, 1);
  const { buffer } = sources[0];
  assert(buffer.duration + .024 < .775);
  const samples = buffer.getChannelData(0);
  assert(samples.some(sample => Math.abs(sample) > .01));
  assert.equal(Math.abs(samples.at(-1)), 0);
  sources[0].onended();
  player.roll();
  assert.equal(sources.length, 2);
});
test('reduced motion respects the short deadline and muted effects stay silent', () => {
  const short = fixture();
  short.player.roll(true);
  assert(short.sources[0].buffer.duration + .024 < .1);
  const muted = fixture({ sfxOn: false });
  muted.player.roll();
  assert.equal(muted.sources.length, 0);
  const delayed = fixture({ outputLatency: .2 });
  delayed.player.roll(true);
  assert.equal(delayed.sources.length, 0);
});
