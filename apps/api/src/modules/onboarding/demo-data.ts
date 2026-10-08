import type { Industry } from "@stockflow/schemas";

/** [name, category index from the industry preset, unit code, cost, sell, reorder level, opening qty, batch-tracked] */
type DemoItem = [string, number, string, number, number, number, number, boolean?];

const GENERIC: DemoItem[] = [
  ["Sample item A", 0, "pcs", 450, 650, 20, 120],
  ["Sample item B", 0, "pcs", 1200, 1650, 10, 40],
  ["Sample item C", 0, "kg", 300, 420, 25, 15],
  ["Sample item D", 0, "pcs", 75, 120, 50, 300],
];

export const DEMO_CATALOGUE: Partial<Record<Industry, DemoItem[]>> = {
  retail: [
    ["Basmati rice 5kg", 0, "pack", 2100, 2450, 10, 40],
    ["Dhal (Mysore) 1kg", 0, "kg", 330, 390, 20, 60],
    ["Coconut oil 1L", 0, "l", 780, 920, 12, 8],
    ["Dish wash liquid 500ml", 1, "pcs", 290, 360, 15, 45],
    ["Toothpaste 120g", 2, "pcs", 260, 320, 20, 70],
    ["CR exercise book 120pg", 3, "pcs", 140, 190, 30, 200],
  ],
  pharmacy: [
    ["Paracetamol 500mg (strip of 10)", 1, "strip", 28, 40, 100, 600, true],
    ["Amoxicillin 250mg capsules", 0, "strip", 95, 135, 40, 120, true],
    ["Vitamin C 500mg tablets", 3, "bottle", 680, 890, 10, 25, true],
    ["Surgical face masks (box of 50)", 2, "box", 750, 990, 8, 30],
    ["Oral rehydration salts", 1, "pcs", 45, 70, 50, 20, true],
    ["Digital thermometer", 2, "pcs", 1250, 1750, 5, 12],
  ],
  hardware: [
    ["Claw hammer 16oz", 0, "pcs", 1450, 1950, 5, 18],
    ["PVC pipe 1/2 inch (6m)", 2, "pcs", 640, 820, 20, 75],
    ["Copper wire 1.5mm (100m)", 1, "pcs", 9800, 12500, 3, 6],
    ["Emulsion paint white 4L", 3, "pcs", 5200, 6400, 6, 14],
    ["Cement 50kg", 4, "pcs", 2350, 2600, 30, 120],
    ["Wood screws 1 inch (box)", 0, "box", 380, 520, 15, 9],
  ],
  electronics: [
    ["USB-C charger 25W", 1, "pcs", 2900, 4200, 10, 35],
    ["Bluetooth earbuds", 1, "pcs", 5400, 7900, 8, 22],
    ["32GB microSD card", 1, "pcs", 1350, 2100, 15, 60],
    ["Smartphone 6.5 inch 128GB", 0, "pcs", 48500, 56900, 4, 9],
    ["Laptop 14 inch i5", 2, "pcs", 189000, 219000, 2, 3],
    ["LED bulb 12W", 3, "pcs", 390, 560, 40, 150],
  ],
};

export function demoItemsFor(industry: Industry): DemoItem[] {
  return DEMO_CATALOGUE[industry] ?? GENERIC;
}
