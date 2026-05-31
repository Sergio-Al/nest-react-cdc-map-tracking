/**
 * MOCK / DERIVED customer metadata for the Route Builder add-stop palette.
 *
 * The backend `Customer` only carries `customerType` (`regular` | `premium`).
 * The palette UX needs richer attributes — category, visit cadence, preferred
 * time window, urgency — that no endpoint exposes yet. We derive them here:
 * first from name keywords (so a "Farmacia" reads as Healthcare), then from a
 * stable hash of the id so values never flicker between renders.
 *
 * Replace with real fields when the customer entity grows them.
 */
import { Utensils, ShoppingBag, Stethoscope, Factory } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { hashId } from './driverMock';
import type { Customer } from '@/types/customer.types';

export type CustomerCategory = 'restaurants' | 'retail' | 'healthcare' | 'industrial';
export type VisitWindow = 'anytime' | 'morning' | 'afternoon' | 'evening';
export type Urgency = 'urgent' | 'priority' | null;

export interface CustomerMeta {
  category: CustomerCategory;
  /** Days since last visit (0 = today). */
  lastVisitDays: number;
  /** Visits per month. */
  monthlyFrequency: number;
  preferredWindow: VisitWindow;
  urgency: Urgency;
  /** Visited within the last week — powers the "Recent" chip. */
  recent: boolean;
  /** Visited often — powers the "Frequent" chip. */
  frequent: boolean;
}

export const CATEGORY_META: Record<
  CustomerCategory,
  { label: string; icon: LucideIcon; tint: string }
> = {
  restaurants: { label: 'Restaurants', icon: Utensils, tint: 'oklch(0.72 0.16 50)' },
  retail: { label: 'Retail', icon: ShoppingBag, tint: 'oklch(0.72 0.16 150)' },
  healthcare: { label: 'Healthcare', icon: Stethoscope, tint: 'oklch(0.65 0.15 240)' },
  industrial: { label: 'Industrial', icon: Factory, tint: 'oklch(0.62 0.14 290)' },
};

export const WINDOW_RANGES: Record<
  Exclude<VisitWindow, 'anytime'>,
  { start: string; end: string }
> = {
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '12:00', end: '17:00' },
  evening: { start: '17:00', end: '21:00' },
};

const KEYWORDS: [RegExp, CustomerCategory][] = [
  [/caf[eé]|restaur|comida|pizz|burger|parrilla|pollos|churras/i, 'restaurants'],
  [/farmac|cl[ií]nic|consultor|hospital|dental|salud|m[eé]dic|botica/i, 'healthcare'],
  [/dep[oó]sito|almac[eé]n|distribuidora|industrial|f[aá]brica|planta|log[ií]st/i, 'industrial'],
  [/mercad|tienda|super|market|comercial|boutique|shop|store|hotel|multicine|plaza/i, 'retail'],
];

const CATEGORIES: CustomerCategory[] = ['restaurants', 'retail', 'healthcare', 'industrial'];
const WINDOWS: VisitWindow[] = ['anytime', 'morning', 'afternoon', 'evening'];

export function getCustomerMeta(c: Customer): CustomerMeta {
  const h = hashId(`${c.id}:${c.name}`);

  let category: CustomerCategory | undefined;
  for (const [re, cat] of KEYWORDS) {
    if (re.test(c.name)) {
      category = cat;
      break;
    }
  }
  category ??= CATEGORIES[h % CATEGORIES.length];

  const lastVisitDays = h % 9; // 0..8
  const monthlyFrequency = 2 + ((h >> 3) % 22); // 2..23
  const preferredWindow = WINDOWS[(h >> 5) % WINDOWS.length];

  // ~1 in 9 urgent, ~1 in 6 priority (premium customers skew priority).
  let urgency: Urgency = null;
  if (h % 9 === 0) urgency = 'urgent';
  else if (c.customerType === 'premium' || h % 6 === 0) urgency = 'priority';

  return {
    category,
    lastVisitDays,
    monthlyFrequency,
    preferredWindow,
    urgency,
    recent: lastVisitDays <= 6,
    frequent: monthlyFrequency >= 10,
  };
}

/** "today" · "3d" · "1w" — compact last-visit label. */
export function lastVisitLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days >= 7) return `${Math.round(days / 7)}w`;
  return `${days}d`;
}
