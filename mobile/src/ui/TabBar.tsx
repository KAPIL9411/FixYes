import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePartnerProfile } from '../hooks/data';
import { useWorkMode } from '../work-mode';
import { colors, fonts } from '../theme';

type TabConfig = {
  name: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
};

const CUSTOMER_TABS: TabConfig[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', activeIcon: 'home' },
  { name: 'bookings', label: 'Bookings', icon: 'calendar-outline', activeIcon: 'calendar' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

const PARTNER_TABS: TabConfig[] = [
  { name: 'index', label: 'Home', icon: 'grid-outline', activeIcon: 'grid' },
  { name: 'bookings', label: 'Jobs', icon: 'briefcase-outline', activeIcon: 'briefcase' },
  { name: 'partner', label: 'Earnings', icon: 'wallet-outline', activeIcon: 'wallet' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

type TabBarProps = {
  state: { index: number; routes: { key: string; name: string; params?: object }[] };
  navigateToTab: (routeKey: string) => void;
};

export function FloatingTabBar({ state, navigateToTab }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const { mode } = useWorkMode();
  const partner = usePartnerProfile();
  const isPartnerMode = mode === 'partner' && partner.data?.status === 'APPROVED';
  const config = isPartnerMode ? PARTNER_TABS : CUSTOMER_TABS;
  const activeName = state.routes[state.index]?.name;

  return (
    <View style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={styles.bar}>
        {config.map((tab) => {
          const route = state.routes.find((item) => item.name === tab.name);
          if (!route) return null;
          const focused = activeName === tab.name;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (!focused) navigateToTab(route.key);
              }}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
                <Ionicons
                  name={focused ? tab.activeIcon : tab.icon}
                  size={20}
                  color={focused ? colors.primary : colors.muted}
                />
              </View>
              <Text style={[styles.label, focused && styles.labelActive]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 8,
    minHeight: 62,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: 2,
  },
  pressed: { opacity: 0.65 },
  iconWrap: {
    width: 46,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: { backgroundColor: colors.primarySoft },
  label: {
    fontFamily: fonts.medium,
    fontSize: 10.5,
    lineHeight: 14,
    color: colors.muted,
  },
  labelActive: { fontFamily: fonts.bold, color: colors.primary },
});
