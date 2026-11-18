import { z } from 'zod';
import { LOCALES } from './auth';

export const INCOME_RANGES = ['lt3m', '3to6m', '6to10m', 'gt10m', 'undisclosed'] as const;
export const GOALS = ['track', 'cushion', 'purchase', 'invest', 'debt'] as const; // draft, see docs/design/NOTES.md
export const HALAL_PREFS = ['only', 'preferred', 'none'] as const; // draft
export const CONSENT_TYPES = ['privacy', 'mic', 'partners'] as const;

export const updateMeSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    locale: z.enum(LOCALES),
  })
  .partial();

export const onboardingSchema = z.object({
  incomeRange: z.enum(INCOME_RANGES).nullable(),
  goal: z.enum(GOALS).nullable(),
  halalPref: z.enum(HALAL_PREFS).nullable(),
});

export const consentSchema = z.object({
  type: z.enum(CONSENT_TYPES),
  version: z.string().min(1).max(20),
  granted: z.boolean(),
});
