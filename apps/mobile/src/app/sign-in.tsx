/**
 * Sign in or create an account.
 *
 * Listening never needs an account — the whole catalogue is readable to anon.
 * The only thing this changes is where saved things live, and it says so rather
 * than implying a gate.
 */
import { signInWithPassword, signUp } from '@kp/api';
import { Button } from '@kp/ui-native/button';
import { Text as UIText } from '@kp/ui-native/text';
import { colors } from '@kp/tokens/colors';
import { useRouter } from 'expo-router';
import { ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Input } from '@kp/ui-native/input';

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
        <Text className="font-display text-[28px] leading-8 text-foreground">
          {mode === 'signin' ? 'Sign in' : 'Create an account'}
        </Text>
        <Text className="text-sm text-muted-foreground">
          Listening never needs an account. This is only so your saves follow you.
        </Text>

        <View className="gap-2">
          <Text className="text-sm text-foreground">Email</Text>
          <Input
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholderTextColor={colors.mutedForeground}
            className="h-12"
          />
        </View>

        <View className="gap-2">
          <Text className="text-sm text-foreground">Password</Text>
          <Input
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            placeholderTextColor={colors.mutedForeground}
            className="h-12"
          />
        </View>

        {message ? (
          <Text accessibilityRole="alert" className="text-sm text-muted-foreground">
            {message}
          </Text>
        ) : null}

        {/* The first React Native Reusables component in the app. Same shadcn
            model the web side uses, and it reads the same tokens — which is
            what makes it worth a package rather than another hand-rolled
            Pressable. */}
        <Button onPress={submit} disabled={busy} size="lg">
          {/* Its own Text, not React Native's: Button publishes the right text
              colour and weight through TextClassContext, and only this one
              reads it. */}
          <UIText>{busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}</UIText>
        </Button>

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
