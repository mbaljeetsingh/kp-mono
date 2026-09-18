/**
 * Sign in or create an account.
 *
 * Listening never needs an account — the whole catalogue is readable to anon.
 * The only thing this changes is where saved things live, and it says so rather
 * than implying a gate.
 */
import { signInWithPassword, signUp } from '@kp/api';
import { colors } from '@kp/tokens/colors';
import { useRouter } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { Screen } from '~/components/Screen';
import { supabase } from '~/lib/supabase';

export default function SignInScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setMessage('');
    if (!email.trim() || !password) {
      setMessage('Enter your email and a password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signin') {
        const { error } = await signInWithPassword(supabase, email.trim(), password);
        if (error) setMessage(error.message);
        else router.back();
      } else {
        const result = await signUp(supabase, email.trim(), password);
        if (result.error) setMessage(result.error);
        // Confirmations off locally signs you straight in; where they are on the
        // account exists with no session, and saying nothing looks like a button
        // that did nothing.
        else if (result.confirm) setMessage('Check your email to confirm the account.');
        else router.back();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen className="flex-1 bg-background">
      {/* The same way out the full player has — a modal with no visible
          dismiss leaves the drag gesture as the only exit, which is not
          obvious and is unreachable to anyone who cannot make it. */}
      <View className="flex-row px-2 pt-2">
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Close"
          className="size-10 items-center justify-center"
        >
          <ChevronDown size={22} color={colors.foreground} />
        </Pressable>
      </View>

      <View className="gap-4 p-6 pt-2">
        <Text className="text-2xl font-semibold text-foreground">
          {mode === 'signin' ? 'Sign in' : 'Create an account'}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Listening never needs an account. This is only so your saves follow you.
        </Text>

        <View className="gap-2">
          <Text className="text-sm text-foreground">Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholderTextColor={colors.mutedForeground}
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm text-foreground">Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            placeholderTextColor={colors.mutedForeground}
            className="rounded-lg border border-border bg-card px-4 py-3 text-foreground"
          />
        </View>

        {message ? (
          <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
            {message}
          </Text>
        ) : null}

        <Pressable
          onPress={submit}
          disabled={busy}
          className="items-center rounded-lg bg-primary py-3 active:opacity-80"
        >
          <Text className="font-medium text-primary-foreground">
            {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setMessage('');
          }}
        >
          <Text className="text-center text-xs text-muted-foreground">
            {mode === 'signin'
              ? 'No account yet? Create one.'
              : 'Already have an account? Sign in.'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
