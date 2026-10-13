# test/gen3/fm3/fixtures — provenance and oracle status

Captured from a REAL FM3 through the pre-migration ForgeFX server (migration Phase 0) by
`../../../../scripts/capture-fm3-goldens.ts`:

| file | what it is |
| --- | --- |
| `preset-<n>.syx` | the raw `0x77/0x78/0x79` preset dump (10 presets) |
| `preset-<n>.params.expected.json` | the decode the LIVE server produced (`readBlockParams` golden) |
| `preset-<n>.summary.expected.json` | `GET /presets/<n>/summary?full=1` from the same live server |
| `telemetry.expected.json`, `roster.expected.json` | other live captures |

## The `params` goldens are no longer a PURELY independent oracle

`preset-<n>.params.expected.json` were RE-EMITTED OFFLINE from the decoder itself on 2026-10-13
(`scripts/refresh-fm3-blockparams-goldens.ts`) so the `valueMap:'identity'` decode (defect A) could be
corrected — the live path cannot be re-run here (the serial port is held). On the row the refresh moved the
suite now checks the decoder against its own output. The independent check that remains is the identity
assertion in `../blockparams.test.ts` (it reads the range TABLE, not the fixture). See that file's header for
the 2-line (decoder fix) / 8-line (unit relabel) split and the exact rows.

## The `summary` goldens are RETIRED as an oracle — stale by construction

`preset-<n>.summary.expected.json` are the ORIGINAL live capture and were NOT part of the refresh. **Nothing
reads them** (`grep -rn 'summary.expected' test/ src/` finds only the capture script, which WRITES them). Their
`REVERB_TONETYPE` entry still holds the OLD live decode of the identity row — the position-mapped value
(`4.5778e-05` where `raw == 1`) and `unit: "db"` — which the corrected decoder reads as `value: 1`,
`unit: "numeric"`.

DECISION (2026-10-13): **retired as an oracle — not wired, not hand-edited, but pinned.**
- NOT wired: the offline package has no summary builder (`GET /presets/:n/summary` is a server-endpoint shape),
  so wiring it into this suite needs server-side work outside the codec.
- NOT hand-normalised: editing a live-captured value would turn the last non-decoder reference into decoder
  self-reference — the exact hazard the params refresh introduced.
- NOT deleted: git preserves it either way, and the raw capture is useful provenance.
- PINNED: a guard in `../blockparams.test.ts` (`assertSummaryGoldensAreDocumentedStale`) fails if a summary's
  `REVERB_TONETYPE` is ever normalised or otherwise changed, so the staleness cannot drift silently. If the
  summary is ever regenerated from a real capture, update the guard and this file.
