import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, layout, radius, shadows, space, type } from '../theme';

export const TAB_BAR_SPACE = layout.tabBarSpace;

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function AppText({
  children,
  variant = 'body',
  style,
  numberOfLines,
  onPress,
}: {
  children: ReactNode;
  variant?: keyof typeof type;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  onPress?: () => void;
}) {
  return (
    <Text style={[type[variant], style]} numberOfLines={numberOfLines} onPress={onPress}>
      {children}
    </Text>
  );
}

export function IconButton({
  icon,
  onPress,
  variant = 'light',
  size = 42,
  badge,
  accessibilityLabel,
  style,
}: {
  icon: IconName;
  onPress?: () => void;
  variant?: 'light' | 'dark' | 'ghost' | 'violet';
  size?: number;
  badge?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    light: { bg: colors.surface, fg: colors.ink, border: colors.line },
    dark: { bg: colors.ink, fg: colors.white, border: colors.ink },
    ghost: { bg: 'transparent', fg: colors.ink, border: 'transparent' },
    violet: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.iconButton,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={palette.fg} />
      {badge ? <View style={styles.badgeDot} /> : null}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  full = true,
  size = 'md',
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'amber' | 'ghost' | 'dark' | 'soft' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    amber: { bg: colors.amber, fg: colors.ink, border: colors.amber },
    dark: { bg: colors.ink, fg: colors.white, border: colors.ink },
    soft: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    ghost: { bg: colors.surface, fg: colors.ink, border: colors.line },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];
  const heights = { sm: 40, md: 50, lg: 56 }[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        {
          height: heights,
          width: full ? '100%' : undefined,
          paddingHorizontal: full ? 14 : 18,
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : 1,
        },
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={18} color={palette.fg} /> : null}
          <Text
            numberOfLines={1}
            style={[styles.buttonLabel, { color: palette.fg, fontSize: size === 'sm' ? 13 : 14.5 }]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function SectionHeader({
  title,
  action,
  onAction,
  style,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <AppText variant="h2">{title}</AppText>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={10} style={styles.sectionAction}>
          <Text style={styles.sectionActionText}>{action}</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.primary} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function Pill({
  label,
  tone = 'neutral',
  icon,
  style,
}: {
  label: string;
  tone?: 'neutral' | 'violet' | 'amber' | 'success' | 'danger' | 'dark';
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = {
    neutral: { bg: colors.surfaceAlt, fg: colors.muted, border: colors.line },
    violet: { bg: colors.primarySoft, fg: colors.primary, border: colors.primarySoft },
    amber: { bg: colors.amberSoft, fg: colors.amberDeep, border: colors.amberSoft },
    success: { bg: colors.successSoft, fg: colors.success, border: colors.successSoft },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
    dark: { bg: colors.ink, fg: colors.white, border: colors.ink },
  }[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg, borderColor: palette.border }, style]}>
      {icon ? <Ionicons name={icon} size={11} color={palette.fg} /> : null}
      <Text style={[styles.pillLabel, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

export function ChoiceChip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        selected ? styles.choiceChipSelected : null,
        pressed && styles.pressed,
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={15} color={selected ? colors.primary : colors.inkSoft} />
      ) : null}
      <Text style={[styles.choiceChipLabel, selected ? styles.choiceChipLabelSelected : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
  autoCapitalize,
  error,
  right,
  maxLength,
  style,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
  multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  error?: string;
  right?: ReactNode;
  maxLength?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputWrap, multiline && styles.inputWrapMultiline, error && styles.inputWrapError]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.faint}
          keyboardType={keyboardType}
          multiline={multiline}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          maxLength={maxLength}
          style={[styles.input, multiline && styles.inputMultiline]}
        />
        {right}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export function SearchBar({
  value,
  onChangeText,
  onPress,
  placeholder = 'Search for a service',
  autoFocus,
  right,
  onSubmitEditing,
}: {
  value?: string;
  onChangeText?: (value: string) => void;
  onPress?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  right?: ReactNode;
  onSubmitEditing?: () => void;
}) {
  const content = (
    <>
      <Ionicons name="search-outline" size={19} color={colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={styles.searchInput}
        autoFocus={autoFocus}
        editable={Boolean(onChangeText)}
        pointerEvents={onPress ? 'none' : 'auto'}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
      />
      {right}
    </>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="search" onPress={onPress} style={({ pressed }) => [styles.search, pressed && styles.pressed]}>
        {content}
      </Pressable>
    );
  }
  return <View style={styles.search}>{content}</View>;
}

export function EmptyState({
  icon = 'receipt-outline',
  title,
  body,
  action,
  onAction,
}: {
  icon?: IconName;
  title: string;
  body: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={25} color={colors.primary} />
      </View>
      <AppText variant="h3" style={styles.emptyTitle}>
        {title}
      </AppText>
      <AppText variant="small" style={styles.emptyBody}>
        {body}
      </AppText>
      {action ? (
        <Button label={action} onPress={onAction} variant="soft" full={false} size="sm" style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={24} color={colors.danger} />
      </View>
      <AppText variant="h3" style={styles.emptyTitle}>
        Could not load this
      </AppText>
      <AppText variant="small" style={styles.emptyBody}>
        {message}
      </AppText>
      {onRetry ? (
        <Button label="Try again" onPress={onRetry} variant="soft" full={false} size="sm" style={styles.emptyAction} />
      ) : null}
    </View>
  );
}

export function Skeleton({ height = 16, width = '100%', radius: corner = radius.sm }: { height?: number; width?: number | `${number}%`; radius?: number }) {
  return <View style={[styles.skeleton, { height, width, borderRadius: corner }]} />;
}

export function ListRow({
  icon,
  label,
  detail,
  onPress,
  right,
  danger,
  last,
}: {
  icon?: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.listRow, !last && styles.listRowBorder, pressed && { opacity: 0.65 }]}
    >
      {icon ? (
        <View style={[styles.listIcon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Ionicons name={icon} size={18} color={danger ? colors.danger : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <AppText variant="h3" style={[styles.listLabel, danger && { color: colors.danger }]}>
          {label}
        </AppText>
        {detail ? (
          <AppText variant="small" style={styles.listDetail} numberOfLines={1}>
            {detail}
          </AppText>
        ) : null}
      </View>
      {right ?? (onPress && !danger ? <Ionicons name="chevron-forward" size={16} color={colors.faint} /> : null)}
    </Pressable>
  );
}

export function ProgressBar({ value, tone = 'violet' }: { value: number; tone?: 'violet' | 'amber' }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressValue,
          { width: `${Math.max(4, Math.min(100, value * 100))}%`, backgroundColor: tone === 'amber' ? colors.amber : colors.primary },
        ]}
      />
    </View>
  );
}

export function useBottomInset(): number {
  return useSafeAreaInsets().bottom;
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.primary,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  button: {
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  buttonLabel: { fontFamily: fonts.bold, letterSpacing: -0.1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  sectionActionText: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.primary },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  pillLabel: { fontFamily: fonts.semibold, fontSize: 10, letterSpacing: 0.15 },
  choiceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  choiceChipSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  choiceChipLabel: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.inkSoft },
  choiceChipLabelSelected: { color: colors.primary },
  field: { marginBottom: 16 },
  fieldLabel: { ...type.caption, color: colors.muted, marginBottom: 7 },
  inputWrap: {
    minHeight: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapMultiline: { minHeight: 94, alignItems: 'flex-start' },
  inputWrapError: { borderColor: colors.danger },
  input: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14.5,
    color: colors.ink,
    paddingVertical: 12,
  },
  inputMultiline: { height: 90, textAlignVertical: 'top', paddingTop: 12 },
  fieldError: { fontFamily: fonts.medium, fontSize: 11.5, color: colors.danger, marginTop: 6 },
  search: {
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 9,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.regular,
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 10,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 38,
    paddingHorizontal: 28,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { textAlign: 'center', marginBottom: 5 },
  emptyBody: { textAlign: 'center', lineHeight: 18 },
  emptyAction: { marginTop: 16 },
  skeleton: { backgroundColor: colors.surfaceAlt },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 62,
  },
  listRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  listIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryGhost,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listLabel: { fontSize: 13.5 },
  listDetail: { fontSize: 10.5, marginTop: 1 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.primarySoft, overflow: 'hidden' },
  progressValue: { height: 6, borderRadius: 3 },
});

export { shadows, space, type };
