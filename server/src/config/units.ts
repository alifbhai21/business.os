/**
 * Units are GLOBAL predefined units per PRD §8.3:
 * Piece, Box, Packet, Kg, Gram, Liter, Meter, Feet, Dozen, Custom unit.
 * No business-custom unit registry is required for the MVP.
 */
export const UNIT_SLUGS = [
  "piece",
  "box",
  "packet",
  "kg",
  "gram",
  "liter",
  "meter",
  "feet",
  "dozen",
  "custom",
] as const;

export type UnitSlug = (typeof UNIT_SLUGS)[number];

export interface UnitInfo {
  value: string;
  label: string;
  labelBn: string;
}

export const UNITS: UnitInfo[] = [
  { value: "piece", label: "Piece", labelBn: "পিস" },
  { value: "box", label: "Box", labelBn: "বক্স" },
  { value: "packet", label: "Packet", labelBn: "প্যাকেট" },
  { value: "kg", label: "Kg", labelBn: "কেজি" },
  { value: "gram", label: "Gram", labelBn: "গ্রাম" },
  { value: "liter", label: "Liter", labelBn: "লিটার" },
  { value: "meter", label: "Meter", labelBn: "মিটার" },
  { value: "feet", label: "Feet", labelBn: "ফিট" },
  { value: "dozen", label: "Dozen", labelBn: "ডজন" },
  { value: "custom", label: "Custom", labelBn: "কাস্টম" },
];

export function isValidUnit(value: string): boolean {
  return (UNIT_SLUGS as readonly string[]).includes(value);
}
