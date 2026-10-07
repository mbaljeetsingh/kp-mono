/**
 * The account, behind one button in Library's header — the web's AccountButton.
 *
 * Signed out it is a way to sign in; signed in it says which account this is
 * (the web's menu does, and nothing here did), and holds sign out and the
 * delete both stores require. The links out live here too: privacy, the
 * tagging workbench, the source.
 */
import { deleteOwnAccount, signOut } from '@kp/api';
import { useRouter } from 'expo-router';
import { ExternalLink, UserRound, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Linking, Modal, Pressable, Text, View } from 'react-native';

import { CONTRIBUTE_URL, GITHUB_URL, PRIVACY_URL } from '~/lib/links';
import { useSession } from '~/lib/session';
import { supabase } from '~/lib/supabase';
import { useColors } from '~/lib/theme';

/**
 * Both stores require account deletion inside any app that offers sign-up.
 * Asked twice over — an alert, not an undo — because nothing brings it back.
 */
function confirmDeleteAccount() {
  Alert.alert(
    'Delete your account?',
    'Your favorites and playlists are deleted with it. Shabads you tagged stay in the archive without your name. This cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: async () => {
          const { error } = await deleteOwnAccount(supabase);
          if (error) Alert.alert('Could not delete the account', error);
        },
      },
    ]
  );
}

/** Long enough for the sheet's slide-out to finish before an alert is raised. */
const ALERT_AFTER_MODAL_MS = 400;

function Row({
  label,
  onPress,
  external,
}: {
  label: string;
  onPress: () => void;
  external?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 px-4 py-3 active:bg-accent">
      <Text className="flex-1 text-foreground">{label}</Text>
      {external ? <ExternalLink size={14} color={colors.subtleForeground} /> : null}
    </Pressable>
  );
}

export function AccountButton() {
  const colors = useColors();
  const router = useRouter();
  const { session, userId } = useSession();
  const [open, setOpen] = useState(false);

  const email = session?.user.email;
  const close = () => setOpen(false);
  const visit = (url: string) => {
    close();
    void Linking.openURL(url);
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel={userId ? 'Account' : 'Sign in and settings'}
        className="size-8 items-center justify-center rounded-full bg-muted active:bg-accent"
      >
        {email ? (
          <Text className="text-sm font-semibold text-primary">{email[0]?.toUpperCase()}</Text>
        ) : (
          <UserRound size={16} color={colors.foreground} />
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable className="flex-1 justify-end bg-black/50" onPress={close}>
          {/* Stops a tap inside the sheet from dismissing it. */}
          <Pressable className="rounded-t-2xl bg-popover pb-8 pt-2" onPress={() => {}}>
            <View className="flex-row items-center gap-2 px-4 pb-2">
              <View className="min-w-0 flex-1">
                <Text className="font-display-medium text-lg text-foreground">
                  {userId ? 'Account' : 'Not signed in'}
                </Text>
                <Text numberOfLines={1} className="text-sm text-muted-foreground">
                  {email ?? 'Listening never needs an account.'}
                </Text>
              </View>
              <Pressable
                onPress={close}
                accessibilityLabel="Close"
                className="size-9 items-center justify-center"
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>

            {userId ? (
              <>
                <Row
                  label="Sign out"
                  onPress={() => {
                    close();
                    void signOut(supabase);
                  }}
                />
                <Row
                  label="Delete account"
                  onPress={() => {
                    close();
                    // After the sheet has gone: iOS drops an alert presented
                    // while a modal is still animating away, and this one is
                    // the delete both stores require to work.
                    setTimeout(confirmDeleteAccount, ALERT_AFTER_MODAL_MS);
                  }}
                />
              </>
            ) : (
              <Row
                label="Sign in"
                onPress={() => {
                  close();
                  router.push('/sign-in');
                }}
              />
            )}

            <View className="mx-4 my-2 h-px bg-border" />
            <Row label="Contribute shabads" onPress={() => visit(CONTRIBUTE_URL)} external />
            <Row label="Source code" onPress={() => visit(GITHUB_URL)} external />
            <Row label="Privacy" onPress={() => visit(PRIVACY_URL)} external />
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
