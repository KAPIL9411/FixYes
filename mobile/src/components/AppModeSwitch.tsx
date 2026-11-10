import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../ui/core';
import { colors, radius, shadows } from '../theme';

export type AppMode = 'customer' | 'partner';

const OPTIONS: {
  mode: AppMode;
  label: string;
  hint: string;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  { mode: 'customer', label: 'Customer', hint: 'Book a service', icon: 'person-outline', activeIcon: 'person' },
  { mode: 'partner', label: 'Partner', hint: 'Manage jobs', icon: 'briefcase-outline', activeIcon: 'briefcase' },
];

/**
 * Full-width two-way app switch, placed at the very top of the customer and
 * partner home screens. Both halves are always visible so the other side of
 * the product is one tap away.
 */
export function AppModeSwitch({
  value,
  onChange,
  tone = 'surface',
}: {
  value: AppMode;
  onChange: (mode: AppMode) => void;
  tone?: 'surface' | 'onPrimary';
}) {
  const onPrimary = tone === 'onPrimary';

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Switch between customer and partner apps"
      style={[styles.track, onPrimary ? styles.trackOnPrimary : styles.trackSurface]}
    >
      {OPTIONS.map((option) => {
        const active = value === option.mode;
        return (
          <Pressable
            key={option.mode}
            accessibilityRole="tab"
            accessibilityLabel={`${option.label} app, ${option.hint}`}
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) onChange(option.mode);
            }}
            style={({ pressed }) => [
              styles.option,
              active && (onPrimary ? styles.optionActiveOnPrimary : styles.optionActiveSurface),
              pressed && !active && styles.pressed,
            ]}
          >
            <Ionicons
              name={active ? option.activeIcon : option.icon}
              size={16}
              color={active ? colors.primary : onPrimary ? 'rgba(255,255,255,0.7)' : colors.muted}
            />
            <View style={styles.copy}>
              <AppText
                variant="h3"
                style={[
                  styles.label,
                  active
                    ? styles.labelActive
                    : onPrimary
                      ? styles.labelOnPrimary
                      : styles.labelSurface,
                ]}
              >
                {option.label}
              </AppText>
              <AppText
                variant="caption"
                numberOfLines={1}
                style={[
                  styles.hint,
                  active
                    ? styles.hintActive
                    : onPrimary
                      ? styles.hintOnPrimary
                      : styles.hintSurface,
                ]}
              >
                {option.hint}
              </AppText>
            </View>
            {active ? <View style={styles.activeDot} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 4,
    borderRadius: radius.lg,
    gap: 4,
  },
  trackSurface: {
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.line,
  },
  trackOnPrimary: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  option: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  optionActiveSurface: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.card,
  },
  optionActiveOnPrimary: {
    backgroundColor: colors.white,
    ...shadows.float,
  },
  pressed: { opacity: 0.72 },
  copy: { alignItems: 'flex-start' },
  label: { fontSize: 13.5, lineHeight: 17 },
  labelActive: { color: colors.primary },
  labelOnPrimary: { color: 'rgba(255,255,255,0.82)' },
  labelSurface: { color: colors.muted },
  hint: { fontSize: 8.5, lineHeight: 11, letterSpacing: 0.35 },
  hintActive: { color: colors.muted },
  hintOnPrimary: { color: 'rgba(255,255,255,0.5)' },
  hintSurface: { color: colors.faint },
  activeDot: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
});
