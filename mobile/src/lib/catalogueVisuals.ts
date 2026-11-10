import type { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export const CATEGORY_ICON: Record<string, IconName> = {
  'ac-cooling': 'snow-outline',
  electrical: 'flash-outline',
  plumbing: 'water-outline',
  'appliance-repair': 'hardware-chip-outline',
  carpentry: 'hammer-outline',
  'deep-cleaning': 'sparkles-outline',
  painting: 'color-palette-outline',
  'pest-control': 'bug-outline',
};

export const CATEGORY_TINT: Record<string, { bg: string; fg: string }> = {
  'ac-cooling': { bg: '#EAF0FF', fg: '#2457E6' },
  electrical: { bg: '#FFF5E4', fg: '#B06D08' },
  plumbing: { bg: '#E8F4FF', fg: '#1D6FB8' },
  'appliance-repair': { bg: '#EFF0FF', fg: '#4652C7' },
  carpentry: { bg: '#FFF1E8', fg: '#A86224' },
  'deep-cleaning': { bg: '#E9F7F1', fg: '#16805A' },
  painting: { bg: '#FDEEF1', fg: '#B44C61' },
  'pest-control': { bg: '#F0F6E8', fg: '#5A7D2E' },
};

export const categoryTint = (code: string | null | undefined) =>
  (code && CATEGORY_TINT[code]) || { bg: colors.primarySoft, fg: colors.primary };
