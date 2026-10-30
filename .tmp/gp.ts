import { readFileSync } from 'node:fs';
import { findGlobalPerformPage } from '../src/devices/gen3/globalPerform.js';
const body = JSON.parse(readFileSync('/tmp/global-body.json','utf8')).values as number[];
const p = findGlobalPerformPage(body);
console.log(p ? { at: p.at, slots: p.slots.map(s=>[s.effectId,s.paramId,s.effectLabel,s.paramLabel]) } : 'none');
