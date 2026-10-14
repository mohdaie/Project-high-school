import { CLIPS, segLen } from './brawler.js';

// Sword techniques, kept for later: the Universal Animation Library 2 sword
// and shield clips (still in fighter.glb) as moves for a stick in the right
// hand (kayu) and a bin lid on the left arm (tong). Not played in the street
// fight; brawler.js has the same shape, so they can be dropped back in.
const seg = (clip, o = {}) => ({ clip, from: 0, to: CLIPS[clip], speed: 1, hold: 0, ...o });
export const SWORD_MOVES = {
  slashA: { name: 'Tetak', cost: 6, prop: 'kayu', play: [seg('Sword_Regular_A'), seg('Sword_Regular_A_Rec')], dur: .9, rm: .6, chain: 'slashB', chainAt: .433, reach: 1.1,
    hits: [{ t: [.19, .3], part: 'kayu', dmg: 5, knock: .15 }] },
  slashB: { name: 'Tetak balik', cost: 7, prop: 'kayu', play: [seg('Sword_Regular_B'), seg('Sword_Regular_B_Rec')], dur: 1, rm: .6, chain: 'slashC', chainAt: .533, reach: 1.1,
    hits: [{ t: [.22, .32], part: 'kayu', dmg: 6, knock: .2 }] },
  slashC: { name: 'Tetak penamat', cost: 12, prop: 'kayu', play: [seg('Sword_Regular_C')], dur: 1.45, rm: .5, reach: 1.1,
    hits: [{ t: [.1, .22], part: 'kayu', dmg: 5, knock: .1 }, { t: [.6, .74], part: 'kayu', dmg: 10, knock: .9, heavy: true }] },
  dash: { name: 'Terkam', cost: 14, prop: 'kayu', play: [seg('Sword_Dash')], dur: 1.3, rm: .5, reach: 1.3,
    hits: [{ t: [.24, .38], part: 'kayu', dmg: 10, knock: .6 }] },
  combo: { name: 'Combo kayu', cost: 22, prop: 'kayu', play: [seg('Sword_Regular_Combo')], dur: 2.6, rm: .5, reach: 1.1,
    hits: [{ t: [.19, .3], part: 'kayu', dmg: 5, knock: .1 }, { t: [.68, .8], part: 'kayu', dmg: 6, knock: .1 }, { t: [1.1, 1.27], part: 'kayu', dmg: 7, knock: .2 }, { t: [1.5, 1.65], part: 'kayu', dmg: 10, knock: .9, heavy: true }] },
  heavy: { name: 'Combo berat', cost: 30, prop: 'kayu', play: [seg('Sword_Heavy_Combo')], dur: 3.7, rm: .3, reach: 1.2,
    hits: [{ t: [.4, .54], part: 'kayu', dmg: 8, knock: .2 }, { t: [1.74, 1.9], part: 'kayu', dmg: 9, knock: .3 }, { t: [2.52, 2.7], part: 'kayu', dmg: 15, knock: 1, heavy: true }] },
  block: { name: 'Tangkis', cost: 4, prop: 'kayu', play: [seg('Sword_Block')], dur: 1.1, hits: [] },
  bash: { name: 'Hentak tong', cost: 8, prop: 'tong', play: [seg('Shield_OneShot')], dur: .75, reach: .75,
    hits: [{ t: [.04, .22], part: 'tong', dmg: 6, knock: .6 }] },
  shieldDash: { name: 'Rempuh tong', cost: 14, prop: 'tong', play: [seg('Shield_Dash')], dur: 1.05, rm: .9, reach: .7,
    hits: [{ t: [.06, .55], part: 'tong', dmg: 9, knock: 1.2, heavy: true }] },
  guard: { name: 'Tahan tong', cost: 0, prop: 'tong', play: [seg('Idle_Shield_Loop')], hits: [] },
  guardBreak: { name: 'Pecah tahan', cost: 0, prop: 'tong', play: [seg('Idle_Shield_Break')], hits: [] }
};
// Strike parts for the props, in the hand's space: the kayu runs out of the
// fist along the thumb side (hand +z); the tong faces out of the left hand.
export const SWORD_PARTS = {
  kayu: { bone: 'hand_r', a: [0, .08, .12], b: [0, .08, .84], r: .04 },
  tong: { bone: 'hand_l', a: [-.09, .07, 0], r: .24 }
};
for (const m of Object.values(SWORD_MOVES)) { m.rm ??= 1; m.dur ??= m.play.reduce((s, p) => s + segLen(p), 0); }
