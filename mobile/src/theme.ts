import type { TextStyle, ViewStyle } from 'react-native';

/**
 * Fixyes design tokens.
 *
 * Sofia Sans is the product typeface and is used for every piece of UI.
 * The display face is reserved for short promotional headlines and is kept
 * behind one token so a licensed Avantt file can be dropped in without
 * touching screens. Avantt's downloadable TRIAL build is personal-use only,
 * so it is deliberately not committed to this repository.
 */
export const colors = {
  canvas: '#F8F9FC',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F5FA',
  surfaceSunken: '#EEF1F7',
  ink: '#171A2B',
  inkSoft: '#3C4257',
  muted: '#777D90',
  faint: '#9DA3B4',
  line: '#E9ECF3',
  lineStrong: '#DCE1EC',
  primary: '#2457E6',
  primaryDeep: '#1745C8',
  primarySoft: '#E8EEFF',
  primaryGhost: '#F2F5FF',
  primaryFaint: '#F8FAFF',
  amber: '#F2A93B',
  amberDeep: '#A96606',
  amberSoft: '#FFF4E1',
  success: '#16A36A',
  successDeep: '#0E7A4E',
  successSoft: '#E7F7F0',
  danger: '#DC4545',
  dangerSoft: '#FDECEC',
  star: '#F2A93B',
  white: '#FFFFFF',
  overlay: 'rgba(15,23,42,0.52)',
} as const;

export const fonts = {
  regular: 'SofiaSans-400',
  medium: 'SofiaSans-500',
  semibold: 'SofiaSans-600',
  bold: 'SofiaSans-700',
  extra: 'SofiaSans-800',
  display: 'Schibsted-700',
  displayHeavy: 'Schibsted-800',
} as const;

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 26,
  xxl: 32,
  pill: 999,
} as const;

export const space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
} as const;

export const type: Record<string, TextStyle> = {
  display: {
    fontFamily: fonts.displayHeavy,
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -1.3,
    color: colors.ink,
  },
  h1: {
    fontFamily: fonts.extra,
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.8,
    color: colors.ink,
  },
  h2: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.35,
    color: colors.ink,
  },
  h3: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: -0.1,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  bodyMedium: {
    fontFamily: fonts.medium,
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  small: {
    fontFamily: fonts.medium,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.muted,
  },
  caption: {
    fontFamily: fonts.semibold,
    fontSize: 10.5,
    lineHeight: 15,
    letterSpacing: 0.75,
    color: colors.muted,
  },
  button: {
    fontFamily: fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: colors.white,
  },
  price: {
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: -0.45,
    color: colors.ink,
  },
};

export const shadows = {
  card: {
    shadowColor: '#16224A',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  } satisfies ViewStyle,
  float: {
    shadowColor: '#16224A',
    shadowOpacity: 0.1,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  } satisfies ViewStyle,
};

export const iconSizes = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 30,
} as const;

export const layout = {
  screenPadding: 18,
  cardGap: 12,
  sectionGap: 24,
  tabBarSpace: 98,
} as const;
