// Global Performance Page decoder — fixture is REAL unit data.
//
// The array below is a verbatim slice (body offset 8285..8984) of the eid-1 GLOBAL bulk body dumped from a
// live FM3 on 2026-10-30, when the owner's Global Perform page held eight Amp controls. Keeping the capture
// rather than a synthesised table means the decoder is tested against the shape the device actually sends.
import {
  findGlobalPerformPage,
  globalPerformSlotRecords,
  encodeLabel16,
  readText16v,
  GLOBAL_PERFORM_LABEL_CHARS,
  GLOBAL_PERFORM_SLOTS
} from '../../../src/devices/gen3/globalPerform.js';

const BODY: readonly number[] = [
1, 1, 1, 1, 1, 1, 1, 128, 0, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 0, 58, 58, 58, 58, 58, 0, 58, 58, 58, 0, 8, 9, 10,
22, 26, 0, 7, 11, 1, 0, 65, 77, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 77, 80, 0, 0, 0, 0, 0, 0, 0, 0,
0, 0, 0, 0, 0, 65, 77, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 77, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
0, 0, 65, 77, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65,
77, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 77, 80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 65, 77, 80,
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 66, 97, 115, 115, 0, 0,
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 77, 105, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 84, 114, 101, 98, 108, 101,
0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 68, 101, 112, 116, 104, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 80, 114, 101, 115, 101,
110, 99, 101, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 110, 112, 117, 116,
32, 68, 114, 105, 118, 101, 0, 0, 0, 0, 0, 77, 97, 115, 116, 101, 114, 32, 86, 111, 108, 0, 0, 0, 0, 0, 0, 76,
101, 118, 101, 108, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1,
1, 32767, 28421, 34996, 41572, 39455, 27833, 27833, 27833, 27833, 27833, 32767, 32767, 32767, 32767, 32767,
32767, 28421, 34996, 41572, 39455, 27833, 27833, 27833, 27833, 27833, 32767, 32767, 32767, 32767, 32767, 0, 0,
1, 1, 0, 0, 0, 1, 1, 1, 1, 28499, 26478, 12320, 12592, 0, 28499, 26478, 12320, 12848, 0, 28499, 26478, 12320,
13104, 0, 28499, 26478, 12320, 13360, 0, 28499, 26478, 12320, 13616, 0, 28499, 26478, 12320, 13872, 0, 28499,
26478, 12320, 14128, 0, 28499, 26478, 12320, 14384, 0, 28499, 26478, 12320, 14640, 0, 28499, 26478, 12320,
12337, 0, 28499, 26478, 12320, 12593, 0, 28499, 26478, 12320, 12849, 0, 28499, 26478, 12320, 13105, 0, 28499,
26478, 12320, 13361, 0, 28499, 26478, 12320, 13617, 0, 28499, 26478, 12320, 13873, 0, 28499, 26478, 12320,
14129, 0, 28499, 26478, 12320, 14385, 0, 28499, 26478, 12320, 14641, 0, 28499, 26478, 12320, 12338, 0, 28499,
26478, 12320, 12594, 0, 28499, 26478, 12320, 12850, 0, 28499, 26478, 12320, 13106, 0, 28499, 26478, 12320,
13362, 0, 28499, 26478, 12320, 13618, 0, 28499, 26478, 12320, 13874, 0, 28499, 26478, 12320, 14130, 0, 28499,
26478, 12320, 14386, 0, 28499, 26478, 12320, 14642, 0, 28499, 26478, 12320, 12339, 0, 28499, 26478, 12320,
12595, 0, 28499, 26478, 12320, 12851, 0, 28499, 26478, 12320, 13107, 0, 28499, 26478, 12320, 13363, 0, 28499,
26478, 12320, 13619, 0, 28499, 26478, 12320, 13875, 0, 28499, 26478, 12320, 14131, 0, 28499, 26478, 12320,
14387, 0, 28499, 26478, 12320, 14643, 0, 28499, 26478, 12320, 12340, 0, 28499, 26478, 12320, 12596, 0, 28499,
26478, 12320, 12852, 0, 28499, 26478, 12320, 13108, 0, 28499, 26478, 12320, 13364, 0, 28499, 26478, 12320,
13620, 0, 28499, 26478, 12320, 13876, 0, 28499, 26478, 12320, 14132, 0, 28499, 26478, 12320, 14388, 0, 28499,
26478, 12320, 14644, 0, 28499, 26478, 12320, 12341, 0, 28499, 26478, 12320, 12597, 0, 28499, 26478, 12320,
12853, 0, 28499, 26478, 12320, 13109, 0, 28499, 26478, 12320, 13365, 0, 28499, 26478, 12320, 13621, 0, 28499,
26478, 12320, 13877, 0, 28499, 26478, 12320, 14133, 0, 28499, 26478, 12320, 14389, 0, 28499, 26478, 12320,
14645, 0
];

const PAGE_AT = 20;

let pass = 0;
let fail = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  if (JSON.stringify(a) === JSON.stringify(b)) pass++;
  else {
    fail++;
    console.log(`  FAIL ${msg}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
  }
};
const ok = (c: boolean, msg: string) => eq(!!c, true, msg);

// ── decode ─────────────────────────────────────────────────────────────────────────────────────
const page = findGlobalPerformPage(BODY);
ok(page != null, 'the page is found in the real body slice');
if (page) {
  eq(page.at, PAGE_AT, 'page starts at the measured offset');
  eq(page.slots.length, GLOBAL_PERFORM_SLOTS, 'ten slots');
  eq(page.slots.map((s) => s.effectId), [58, 58, 58, 58, 58, 0, 58, 58, 58, 0], 'effect ids as measured');
  eq(page.slots.map((s) => s.paramId), [8, 9, 10, 22, 26, 0, 7, 11, 1, 0], 'param ids as measured');
  eq(
    page.slots.map((s) => s.effectLabel),
    ['AMP', 'AMP', 'AMP', 'AMP', 'AMP', '', 'AMP', 'AMP', 'AMP', ''],
    'effect labels'
  );
  eq(
    page.slots.map((s) => s.paramLabel),
    ['Bass', 'Mid', 'Treble', 'Depth', 'Presence', '', 'Input Drive', 'Master Vol', 'Level', ''],
    'param labels'
  );
  eq(page.slots[0]!.paramLabel, 'Bass', 'ids and names agree (58/8 = Amp Bass)');
}

// ── refusals ───────────────────────────────────────────────────────────────────────────────────
eq(findGlobalPerformPage([]), undefined, 'empty body has no page');
eq(findGlobalPerformPage(new Array(4096).fill(0)), undefined, 'a zero body has no page');
const noLabels = [...BODY];
for (let i = PAGE_AT + 20; i < PAGE_AT + 20 + 320; i++) noLabels[i] = 0x0001;
eq(findGlobalPerformPage(noLabels), undefined, 'a page whose labels are not text is refused');

// ── addressing + label encoding ───────────────────────────────────────────────────────────────
if (page) {
  const r = globalPerformSlotRecords(page, 0)!;
  eq(r.effectId, PAGE_AT, 'slot 0 effect id record');
  eq(r.paramId, PAGE_AT + 10, 'slot 0 param id record');
  eq(r.effectLabel, PAGE_AT + 20, 'slot 0 effect label record');
  eq(r.paramLabel, PAGE_AT + 20 + 160, 'slot 0 param label record');
  eq(globalPerformSlotRecords(page, 10), undefined, 'slot 10 is out of range');
}
eq(encodeLabel16('AMP').slice(0, 4), [0x41, 0x4d, 0x50, 0], 'labels are NUL-terminated');
eq(encodeLabel16('AMP').length, GLOBAL_PERFORM_LABEL_CHARS, 'labels are fixed width');
eq(readText16v(BODY, PAGE_AT + 20), 'AMP', 'readText16v reads the measured record');

console.log(`globalPerform: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
