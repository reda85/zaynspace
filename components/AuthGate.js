// components/AuthGate.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, useSegments } from 'expo-router';
import { useAtom, useSetAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useNotifications } from '../hooks/useNotifications';
import { fetchRoleForOrg } from '../lib/fetchRoleForOrg';
import { supabase } from '../lib/supabase';
import {
  categoriesAtom,
  loggedInUserAtom,
  membersAtom,
  pinsAtom,
  plansAtom,
  selectedOrganizationAtom,
  selectedProjectAtom,
  statusesAtom,
} from '../store/atoms';

async function fetchMember(authId, retryOnce = true) {
  const { data: user, error } = await supabase
    .from('members')
    .select('*')
    .eq('auth_id', authId)
    .single();

  if (user) return user;

  if (retryOnce) {
    await new Promise((r) => setTimeout(r, 1000));
    return fetchMember(authId, false);
  }

  if (error) console.error('[AuthGate] Error fetching member:', error);
  return null;
}

export function AuthGate({ children }) {
  const segments = useSegments();
  const router = useRouter();
  const [session, setSession] = useState(undefined);
  const [loggedInUser, setLoggedInUser] = useAtom(loggedInUserAtom);

  const setPlans          = useSetAtom(plansAtom);
  const setPins           = useSetAtom(pinsAtom);
  const setCategories     = useSetAtom(categoriesAtom);
  const setStatuses       = useSetAtom(statusesAtom);
  const setMembers        = useSetAtom(membersAtom);
  const setSelectedProject = useSetAtom(selectedProjectAtom);
  const setSelectedOrg    = useSetAtom(selectedOrganizationAtom);

  const authStateHandled = useRef(false);
  const loggedInUserRef  = useRef(loggedInUser);
  useEffect(() => { loggedInUserRef.current = loggedInUser; }, [loggedInUser]);

  useNotifications(session);

  useEffect(() => {
    let mounted = true;

    async function handleSession(newSession) {
      if (!mounted) return;
      setSession(newSession ?? null);

      if (newSession?.user) {
        if (loggedInUserRef.current) return;

        // 1. Fetch base member row (no role here anymore)
        const user = await fetchMember(newSession.user.id);
        if (!mounted || !user) return;

        // 2. Determine which org to activate
        //    — prefer last used org from AsyncStorage, fall back to user.organization_id
        const lastOrgId = await AsyncStorage.getItem('last_organization_id');
        const activeOrgId = lastOrgId ?? user.organization_id;

        // 3. Fetch role for that org from members_organizations
        const role = await fetchRoleForOrg(user.id, activeOrgId);

        // 4. If we restored a different org, also fetch its name for the atom
        let restoredOrg = null;
        if (lastOrgId && lastOrgId !== user.organization_id) {
          const { data: org } = await supabase
            .from('organizations')
            .select('id, name')
            .eq('id', lastOrgId)
            .single();
          restoredOrg = org ?? null;
        }

        if (mounted) {
          // Patch user with the correct role + active org
          setLoggedInUser({
            ...user,
            organization_id: activeOrgId,
            role: role ?? user.role, // graceful fallback while you migrate
          });
          if (restoredOrg) setSelectedOrg(restoredOrg);
        }
      } else {
        setLoggedInUser(null);
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      authStateHandled.current = true;

      if (event === 'SIGNED_OUT') {
        setSession(null);
        setLoggedInUser(null);
        setPlans([]);
        setPins([]);
        setCategories([]);
        setStatuses([]);
        setMembers([]);
        setSelectedProject(null);
        setSelectedOrg(null);
        return;
      }

      if (event === 'TOKEN_REFRESHED') {
        setSession(newSession ?? null);
        return;
      }

      await handleSession(newSession);
    });

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('[AuthGate] getSession error:', error);
      if (!authStateHandled.current) {
        await handleSession(data.session ?? null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const inAuthGroup = segments[0] === '(auth)';
  useEffect(() => {
    if (session === undefined) return;
    if (!session && !inAuthGroup) router.replace('/(auth)/sign-in');
    else if (session && loggedInUser && inAuthGroup) router.replace('/(tabs)/acceuil');
  }, [session, loggedInUser, segments]);

  if (session === undefined || (session && !loggedInUser)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}