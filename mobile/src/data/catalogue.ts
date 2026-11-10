/**
 * Editorial copy shown beside live catalogue records. Prices, names,
 * descriptions and availability always come from the Fixyes API; nothing in
 * this file is a service, booking or account record.
 */
export const CATEGORY_BLURB: Record<string, string> = {
  'ac-cooling': 'Service, install and repair',
  electrical: 'Switches, fans and wiring',
  plumbing: 'Leaks, drains and fittings',
  'appliance-repair': 'Fridge, washer and more',
  carpentry: 'Locks, doors and furniture',
  'deep-cleaning': 'Homes, kitchens and sofas',
  painting: 'Rooms, walls and polish',
  'pest-control': 'Safe, targeted treatment',
};

export const categoryBlurb = (code: string | null | undefined): string =>
  (code && CATEGORY_BLURB[code]) || 'Verified home services with upfront prices.';
