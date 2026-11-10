import { useEffect, useState } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { SofiaSans_400Regular } from '@expo-google-fonts/sofia-sans/400Regular';
import { SofiaSans_500Medium } from '@expo-google-fonts/sofia-sans/500Medium';
import { SofiaSans_600SemiBold } from '@expo-google-fonts/sofia-sans/600SemiBold';
import { SofiaSans_700Bold } from '@expo-google-fonts/sofia-sans/700Bold';
import { SofiaSans_800ExtraBold } from '@expo-google-fonts/sofia-sans/800ExtraBold';
import { SchibstedGrotesk_700Bold } from '@expo-google-fonts/schibsted-grotesk/700Bold';
import { SchibstedGrotesk_800ExtraBold } from '@expo-google-fonts/schibsted-grotesk/800ExtraBold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Platform, StyleSheet, View } from 'react-native';
import { AuthProvider, useAuth } from '../auth';
import { isConfigured } from '../api';
import { CONFIG_ERROR } from '../config';
import { WorkModeProvider } from '../work-mode';
import { colors, radius } from '../theme';
import { AppText } from '../ui/core';
import { BrandLogoImage } from '../components/Brand';

SplashScreen.preventAutoHideAsync().catch(() => undefined);

const PUBLIC_PATHS = ['/welcome', '/signin'];

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = PUBLIC_PATHS.includes(pathname);

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic) router.replace('/welcome');
    if (user && isPublic) router.replace('/');
  }, [loading, user, isPublic, router]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.canvas }} />;
  }
  return <>{children}</>;
}

function ConfigurationScreen() {
  return (
    <View style={styles.setup}>
      <View style={styles.setupCard}>
        <BrandLogoImage size={30} />
        <AppText variant="h1" style={styles.setupTitle}>
          Connect this build
        </AppText>
        <AppText variant="body" style={styles.setupBody}>
          Fixyes is not connected to its backend in this build. Add the production API URL and
          Google sign-in client ID, then rebuild the app.
        </AppText>
        {CONFIG_ERROR ? (
          <View style={styles.setupError}>
            <AppText variant="small" style={styles.setupErrorText}>
              {CONFIG_ERROR}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    'SofiaSans-400': SofiaSans_400Regular,
    'SofiaSans-500': SofiaSans_500Medium,
    'SofiaSans-600': SofiaSans_600SemiBold,
    'SofiaSans-700': SofiaSans_700Bold,
    'SofiaSans-800': SofiaSans_800ExtraBold,
    'Schibsted-700': SchibstedGrotesk_700Bold,
    'Schibsted-800': SchibstedGrotesk_800ExtraBold,
  });
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: 1, staleTime: 10_000 },
        },
      }),
  );

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WorkModeProvider>
            <StatusBar style="dark" />
            <View style={styles.frame}>
              {!isConfigured ? (
                <ConfigurationScreen />
              ) : (
                <AuthGate>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      contentStyle: { backgroundColor: colors.canvas },
                      animation: 'slide_from_right',
                    }}
                  />
                </AuthGate>
              )}
            </View>
          </WorkModeProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  setup: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.canvas,
    padding: 24,
  },
  setupCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    padding: 24,
    gap: 12,
  },
  setupTitle: { fontSize: 26, marginTop: 6 },
  setupBody: { fontSize: 13, lineHeight: 20 },
  setupError: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.md,
    padding: 12,
  },
  setupErrorText: { color: colors.amberDeep },
  // The native app fills the device. The web build is only a review surface,
  // so keep it in a phone-width frame instead of stretching across a desktop.
  frame: {
    flex: 1,
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? { maxWidth: 480, backgroundColor: colors.canvas, paddingTop: 20 }
      : null),
  },
});
