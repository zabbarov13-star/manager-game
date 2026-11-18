'use strict';

// Presentation metadata only. IDs, character data and entitlements stay in catalog.cjs.
const ids = ['mira', 'timur', 'luna', 'felix', 'asya', 'oscar', 'bella', 'marcel', 'akira', 'hana', 'ren', 'yuki'];
const states = ['idle', 'joy', 'failure', 'win', 'loss'];

module.exports = Object.fromEntries(ids.map(id => [id, {
  artVersion: 2,
  portraitLarge: `/assets/premium-v2/${id}-portrait-large.webp`,
  poses: Object.fromEntries(states.map(state => [state,
    state === 'idle' ? `/assets/${id}.webp` : `/assets/premium-v2/${id}-${state}.webp`
  ])),
}]));
