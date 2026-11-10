import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as AuthSession from 'expo-auth-session';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../auth';
import { isConfigured } from '../api';
import { GOOGLE_ANDROID_CLIENT_ID, GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID } from '../config';
import { AppText, Button } from '../ui/core';
import { AppHeader } from '../components/AppHeader';
import { BrandLogoImage } from '../components/Brand';
import { colors, fonts, radius } from '../theme';

const GOOGLE_DISCOVERY = 'https://accounts.google.com';

export default function SignInScreen() {
  const router = useRouter();
  const { beginGoogleSignIn, signInWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const googleClientId =
    Platform.select({
      ios: GOOGLE_IOS_CLIENT_ID || GOOGLE_CLIENT_ID,
      android: GOOGLE_ANDROID_CLIENT_ID || GOOGLE_CLIENT_ID,
      default: GOOGLE_CLIENT_ID,
    }) ?? '';

  const signIn = async () => {
    setError('');
    setBusy(true);
    try {
      if (!isConfigured || !googleClientId) {
        setError('Sign-in is not configured for this build. Add the Fixyes API URL and Google client ID.');
        return;
      }

      const nonce = await beginGoogleSignIn();
      const discovery = await AuthSession.fetchDiscoveryAsync(GOOGLE_DISCOVERY);
      const redirectUri = AuthSession.makeRedirectUri({ scheme: 'fixyes', path: 'oauth' });
      const request = new AuthSession.AuthRequest({
        clientId: googleClientId,
        redirectUri,
        responseType: AuthSession.ResponseType.IdToken,
        scopes: ['openid', 'email', 'profile'],
        extraParams: { nonce, prompt: 'select_account' },
        usePKCE: false,
      });

      const result = await request.promptAsync(discovery);
      if (result.type !== 'success') {
        setBusy(false);
        return;
      }
      const idToken = result.params?.id_token;
      if (!idToken) throw new Error('Google did not return an ID token.');
      await signInWithGoogle(idToken, nonce);
      router.replace('/');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <AppHeader onBack={() => router.back()} />
      <View style={styles.body}>
        <View style={styles.mark}>
          <BrandLogoImage size={44} />
        </View>
        <AppText variant="h1" style={styles.title}>
          Welcome to Fixyes
        </AppText>
        <AppText variant="body" style={styles.subtitle}>
          Sign in with Google to book verified home pros, track visits and manage your partner
          dashboard.
        </AppText>

        <View style={styles.points}>
          {[
            'One account for customer and partner',
            'No passwords to remember',
            'Your bookings stay in sync',
          ].map((point) => (
            <View key={point} style={styles.point}>
              <View style={styles.pointIcon}>
                <Ionicons name="checkmark" size={12} color={colors.primary} />
              </View>
              <AppText variant="body" style={styles.pointText}>
                {point}
              </AppText>
            </View>
          ))}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={16} color={colors.danger} />
            <AppText variant="small" style={styles.errorText}>
              {error}
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={styles.footer}>
        <Button
          label="Continue with Google"
          icon="logo-google"
          onPress={signIn}
          loading={busy}
          size="lg"
        />
        <AppText variant="small" style={styles.note}>
          Google sign-in uses a secure browser session. Fixyes never sees your password.
        </AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.canvas },
  body: { flex: 1, paddingHorizontal: 24, paddingTop: 22 },
  mark: {
    alignSelf: 'flex-start',
    marginBottom: 22,
  },
  title: { fontSize: 28, letterSpacing: -0.9 },
  subtitle: { marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 20 },
  points: { marginTop: 26, gap: 13 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pointIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pointText: { fontSize: 12.5, color: colors.inkSoft },
  errorBox: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.dangerSoft,
    borderRadius: radius.md,
    padding: 12,
  },
  errorText: { color: colors.danger, flex: 1, fontFamily: fonts.medium, fontSize: 11 },
  footer: { paddingHorizontal: 24, paddingBottom: 8 },
  note: {
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 12,
    color: colors.faint,
  },
});
