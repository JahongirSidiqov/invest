/**
 * Design tokens from the brief, section 10. Components read colours from a theme
 * object, never hex literals, so dark mode is a second `Theme` later.
 */
export const light = {
  primary: '#0B6E4F',
  primaryDark: '#0B3D2E',
  primarySoft: '#E3F1EA',
  background: '#F4F6F3',
  surface: '#FFFFFF',
  border: '#E2E8E4',
  text: '#10201A',
  textSecondary: '#4F5F58',
  muted: '#5B6B64',
  onPrimary: '#FFFFFF',
  warningText: '#8A4B0B',
  warningBg: '#FDF0DC',
  danger: '#B42318',
  dangerText: '#8C1D14',
  dangerBg: '#FBEAE8',
  infoText: '#1F4E8C',
  infoBg: '#E7EEF9',
} as const;

export type Theme = { [K in keyof typeof light]: string };

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
export const radius = { sm: 12, md: 16, lg: 20, pill: 999 } as const;
export const size = { button: 56, touch: 44, input: 56 } as const;

export const font = {
  heading: 'Manrope_700Bold',
  headingHeavy: 'Manrope_800ExtraBold',
  headingSemi: 'Manrope_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
} as const;

export const text = {
  display: { fontFamily: font.headingHeavy, fontSize: 32, lineHeight: 38 },
  title: { fontFamily: font.heading, fontSize: 26, lineHeight: 32 },
  subtitle: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 18 },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  button: { fontFamily: font.bodySemi, fontSize: 17, lineHeight: 22 },
} as const;

export const theme: Theme = light;
