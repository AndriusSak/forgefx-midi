# forgefx-midi

Pure-TypeScript codec and parameter catalogs for Fractal Audio devices, used by
ForgeFX. Builds and parses the SysEx wire bytes for each device family —
transport-agnostic (no MIDI I/O dependency; bring your own transport).

Covered devices: Axe-Fx Standard/Ultra (gen1), Axe-Fx II (gen2),
Axe-Fx III / FM3 / FM9 / VP4 (gen3), and AM4.

## Install

Local package for now — not published.

```sh
npm install
npm run build   # tsc → dist/, plus runtime JSON assets
npm test        # tsx test/run-all.ts (golden test suites)
```

## Subpath exports

| Import | Contents |
|---|---|
| `forgefx-midi` | root index (VERSION, top-level re-exports) |
| `forgefx-midi/shared` | cross-device helpers (checksums, value packing, lineage lookup) |
| `forgefx-midi/am4` | AM4 codec + param maps |
| `forgefx-midi/gen1` | Axe-Fx Standard/Ultra codec |
| `forgefx-midi/gen2/axe-fx-ii` | Axe-Fx II codec |
| `forgefx-midi/gen3/axe-fx-iii` | Axe-Fx III codec |
| `forgefx-midi/gen3/fm3` | FM3 codec (params, meters, FC, modifiers) |
| `forgefx-midi/gen3/fm9` | FM9 codec |
| `forgefx-midi/gen3/vp4` | VP4 codec |
| `forgefx-midi/core` | descriptor-layer core (descriptor/dispatch types, param-kind + concept-key registries, loudness corpus, buffer-dirty, safe-edit, connection registry, audibility) |
| `forgefx-midi/core/midi` | MIDI transports (node-midi + serial USB-CDC, both lazy-loaded; SysEx assembler/framer) |
| `forgefx-midi/devices/gen1` | Axe-Fx Standard/Ultra descriptor (`AXEFXGEN1_DESCRIPTOR`) |
| `forgefx-midi/devices/gen2` | Axe-Fx II descriptor (`AXEFX2_DESCRIPTOR`) |
| `forgefx-midi/devices/gen3` | Axe-Fx III / FM3 / FM9 / VP4 descriptors (`AXEFX3_DESCRIPTOR`, `FM3_DESCRIPTOR`, `FM9_DESCRIPTOR`, `VP4_DESCRIPTOR`) |
| `forgefx-midi/devices/am4` | AM4 descriptor (`AM4_DESCRIPTOR`) |
| `forgefx-midi/catalog/*.json` | device catalogs (7 devices + index) |

## Firmware-true tables (FM3)

The shipped catalog is a snapshot; Fractal's editor cache is the live truth. `gen3/fm3` carries two
generated tables that the ForgeFX server overlays on the catalog, so block type lists and sub-type
enums match the firmware:

- `FM3_TYPE_TABLES_FW13` — the type selector per family (`{ paramId, labels }`, index = device ordinal)
- `FM3_ENUM_ROWS_FW13` — every other changed enum row, including the per-parameter enums of blocks that
  have no type selector at all (formant vowels, multiplexer input select/mode)

Regenerate them from an `effectDefinitions_<model>_<major>p<minor>.cache` with
`ForgeFX/server/scripts/gen-fw13-types.ts`. Indexing is by ORDINAL, so a grown list must also widen the
matching `RANGE` row — the server does that on the profile it serves.

## Catalogs

`catalog/` ships one JSON per device (`am4`, `axe-fx-gen1`, `axe-fx-ii`,
`axe-fx-iii`, `fm3`, `fm9`, `vp4`) plus `index.json`. Schema is documented in
`docs/CATALOG-SCHEMA.md`.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.

This repository is a fork of [sKuhLight/forgefx-midi](https://github.com/sKuhLight/forgefx-midi).
