/** Millbrook page content. Orders and numbers are examples from the design, not final balance. */
import type { Variety } from './koi';

export type Food = 'flea' | 'shrimp' | 'seed';
export const foods: Record<Food, { one: string; many: string }> = {
  flea: { one: 'water flea', many: 'water fleas' },
  shrimp: { one: 'river shrimp', many: 'river shrimp' },
  seed: { one: 'lily seed', many: 'lily seeds' },
};

export interface Order { id: string; name: string; variety: Variety; seed: number; line: string; wants: Partial<Record<Food, number>>; coins: number }
export const orders: Order[] = [
  { id: 'mochi', name: 'Mochi', variety: 'chagoi', seed: 1203, line: 'First to the surface, as always.', wants: { flea: 3, seed: 1 }, coins: 40 },
  { id: 'hana', name: 'Hana', variety: 'tancho', seed: 7731, line: 'Waits under the big lily pad.', wants: { shrimp: 2 }, coins: 35 },
  { id: 'kumo', name: 'Kumo', variety: 'showa', seed: 4411, line: 'Only comes up at dusk.', wants: { flea: 2, shrimp: 1, seed: 1 }, coins: 60 },
];

export const guide: Array<{ variety: Variety; seed: number; label: string; note: string }> = [
  { variety: 'kohaku', seed: 2021, label: 'Kohaku', note: 'White skin with red markings. The classic koi, and where most keepers start.' },
  { variety: 'tancho', seed: 3301, label: 'Tanchō', note: 'One round red spot on the head, named after the red-crowned crane.' },
  { variety: 'sanke', seed: 5150, label: 'Taishō Sanke', note: 'A kohaku pattern with small black accents on the back.' },
  { variety: 'showa', seed: 8086, label: 'Shōwa', note: 'Black base with red and white, and the black reaches the head.' },
  { variety: 'ogon', seed: 9917, label: 'Ōgon', note: 'One metallic colour, gold from nose to tail.' },
  { variety: 'chagoi', seed: 6402, label: 'Chagoi', note: 'Tea-brown and known for being friendly. Usually first to the food.' },
];

export const exists = [
  { title: 'The live pond', text: 'Water, ripples, light that follows your clock, and koi that swim, startle and come to food. It is running at the top of this page.' },
  { title: 'Dredging', text: 'The sand-and-water effect for opening a new stretch of the pond.' },
  { title: 'A sketch of the stream puzzle', text: 'The one on this page. The real one will have more tiles and more kinds of food.' },
];
export const planned = [
  { title: 'A long pond to explore', text: 'Drag along a winding pond. Each stretch under the sand opens as you level up.' },
  { title: 'Orders and the order board', text: 'Koi ask for food. Play the stream to gather it, then feed them for coins and experience.' },
  { title: 'Breeding', text: 'Pair two adult koi. The eggs hatch the next day, and each baby has its own pattern.' },
  { title: 'Decorating', text: 'Lilies, lotus, reeds, stones, lanterns and a bridge, placed wherever you like.' },
  { title: 'Visitors and seasons', text: 'Frogs at dusk, dragonflies in summer, a kingfisher at dawn, and a pond that changes with the calendar.' },
];
