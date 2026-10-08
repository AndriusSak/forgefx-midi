// ────────────────────────────────────────────────────────────────────────────────────────────────
// The FIRMWARE-UPDATE function family — and the hard rule about sending it.
//
// MEASURED THE HARD WAY (2026-10-08). `fn=0x7D`, `0x7E`, `0x7F` and `0x79` were probed as if they were
// "read-shaped cab candidates" (they sit next to the cab IR trio 0x7A/0x7B/0x7C). Their answers were
// **image codes**, not cab answers: `0x11` image size incorrect, `0x14` buffer overrun. The device was
// reading them as firmware-image traffic. Later in the same session the unit was found sitting in its
// bootloader — "Updating Firmware / Transfer Error / Please reboot the device and try again" — recovered
// only by a power cycle. The exact triggering frame is NOT established (no frame trace had been captured,
// which is the other half of the lesson), so this is written as a RULE rather than a post-mortem.
//
// HARD RULE: never send a function byte from this family to a unit that holds someone's library. Not to
// "see what it says", not because a reply would be interesting. A sacrificial unit or a simulator only,
// behind an explicit override. Tools that can send arbitrary function bytes must refuse by DEFAULT, and
// the guard belongs in the shared probe path so it covers every probe rather than the one that erred.
// ────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Function bytes in the firmware-update family — the three whose refusals carry IMAGE codes.
 *
 * CORRECTED 2026-10-08: `0x79` was in this list as a precaution ("refused as a read, sits in the same
 * neighbourhood"). It is not firmware: `0x79` is the PRESET-DUMP FOOTER — the device sends it to end a
 * 0x77/0x78/0x79 preset dump, and the driver matches on it as the terminator. Including it would have made
 * the guard refuse a legitimate preset write. Removing it is evidence-driven, not a relaxation: the three
 * that remain are the ones that answered with image codes (`0x11` image size incorrect, `0x14` buffer
 * overrun) and the family that put a unit in its bootloader.
 */
export const FIRMWARE_FAMILY_FNS: readonly number[] = [0x7d, 0x7e, 0x7f];

/** True for a function byte in the firmware-update family (see FIRMWARE_FAMILY_FNS). */
export function isFirmwareFamilyFn(fn: number): boolean {
  return FIRMWARE_FAMILY_FNS.includes(fn);
}

/**
 * The SysEx function byte of a gen-3 frame, or `undefined` when the buffer is not a frame. Callers use it to
 * decide whether a frame is safe to send; it reads and does not judge beyond the frame shape.
 */
export function frameFn(bytes: readonly number[]): number | undefined {
  return bytes.length > 5 && bytes[0] === 0xf0 && bytes[bytes.length - 1] === 0xf7 ? bytes[5] : undefined;
}
