# The GLOBAL Performance page (FM3, firmware 13.0)

The ten controls FM3-Edit calls *Global Performance Controls* are **not** part of a preset. They are
stored in the unit's GLOBAL settings, which is why they follow the player from preset to preset — and
why a preset-body decoder cannot see them.

Measured on hardware (2026-10-30) by dumping the whole eid-1 GLOBAL body (14 880 16-bit records) and
reading the structure FM3-Edit's Perform view describes.

## Layout

| Body records | Contents |
|---|---|
| 8305 – 8314 | 10 × `uint16` effect id (0 = unassigned) |
| 8315 – 8324 | 10 × `uint16` param id |
| 8325 – 8484 | 10 × 16 **16-bit characters** — effect labels |
| 8485 – 8644 | 10 × 16 16-bit characters — param labels |

The offset is firmware-specific; `findGlobalPerformPage()` locates the page by anchoring on the label
text (a run of ≥4 records of 16-bit characters at a 16-record stride) and reads the id tables from the
20 records immediately before it. A candidate is rejected unless every assigned slot has a label and
every unassigned slot has none — ids and names are separate regions that must agree, and "10 small
uint16 then 10 small uint16" alone also describes other tables in this body.

## Reading

```ts
import { findGlobalPerformPage } from 'forgefx-midi/devices/gen3';

const body = codec.assembleGen3BlockBulkRead(frames).values; // fn 0x1F poll, eid 1
const page = findGlobalPerformPage(body);
// page.at, page.slots[i] = { effectId, paramId, effectLabel, paramLabel }
```

## Writing

The id and label records are ordinary **pid-addressed SETs on eid 1, with pid = body index** — the
same path that carries the brightness parameter (pid 7115). Discrete values (`setParam(eid, pid,
value, false)`) carry the plain integers, including the 16-bit character codes; `globalPerformSlotRecords()`
returns the record offsets for a slot and `encodeLabel16()` builds the padded, NUL-terminated label.

Measured: writing ids 58/11 and the characters of `"AMP"` / `"Master Vol"` into a free slot made the
page decode as `58/11 "AMP" "Master Vol"`; clearing it read back `0/0`.

## Rules that keep this honest

- Verify writes by **re-reading the body** — an independent path from the write. Never treat the
  absence of a refusal as success.
- Labels are 16 characters; longer names truncate.
- The write changes live global state; it does not store to flash. Persistence across a power cycle
  is untested.
- Exercise writes on an **unassigned** slot and restore it, so a failed test cannot break a control
  the owner relies on.
- The unit's own Perform screen was not photographed; what is verified is the body.
