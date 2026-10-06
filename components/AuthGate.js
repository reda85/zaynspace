// components/AuthGate.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { useRouter, useSegments } from 'expo-router';
import { useAtom, useSetAtom } from 'jotai';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useNotifications } from '../hooks/useNotifications';
import { fetchRoleForOrg } from '../lib/fetchRoleForOrg';
import { cachedSelect, clearOfflineData, isNetworkError, isOnline, readCache } from '../lib/offline';
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

const lastOrgKey = (memberId) => `last_organization_id_${memberId}`;

// Compte dont la session est enregistrée sur l'appareil : permet de rouvrir
// l'application sans réseau, quand le jeton a expiré et ne peut pas être renouvelé.
const SESSION_USER_KEY = '@offline/session-user';
// Dernier compte ayant utilisé l'appareil : les données locales d'un autre
// compte sont effacées à la connexion.
const LAST_USER_KEY = '@offline/last-user';

// Compte dont la session est enregistrée sur l'appareil ET dont le profil est
// disponible localement (sans profil, impossible de continuer sans réseau).
async function cachedAccount() {
  const authId = await AsyncStorage.getItem(SESSION_USER_KEY).catch(() => null);
  if (!authId) return null;
  return (await readCache(`member-${authId}`)) ? authId : null;
}

async function deviceIsOffline() {
  const net = await NetInfo.fetch().catch(() => null);
  return net ? !(net.isConnected && net.isInternetReachable !== false) : false;
}

// Délai laissé à Supabase pour rendre la session avant d'ouvrir l'application
// sur le profil local (réseau annoncé mais lent ou inutilisable).
const OFFLINE_START_DELAY_MS = 4000;

async function fetchMember(authId, retryOnce = true, cacheOnly = false) {
  // Hors ligne : uniquement la copie locale, sans attendre un délai réseau.
  if (cacheOnly) return readCache(`member-${authId}`);
  const { data: user, error } = await cachedSelect(`member-${authId}`, () => supabase
    .from('members')
    .select('*')
    .eq('auth_id', authId)
    .single());

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

  const setPlans           = useSetAtom(plansAtom);
  const setPins            = useSetAtom(pinsAtom);
  const setCategories      = useSetAtom(categoriesAtom);
  const setStatuses        = useSetAtom(statusesAtom);
  const setMembers         = useSetAtom(membersAtom);
  const setSelectedProject = useSetAtom(selectedProjectAtom);
  const setSelectedOrg     = useSetAtom(selectedOrganizationAtom);

  const authStateHandled = useRef(false);
  const loggedInUserRef  = useRef(loggedInUser);
  useEffect(() => { loggedInUserRef.current = loggedInUser; }, [loggedInUser]);

  useNotifications(session);

  useEffect(() => {
    let mounted = true;

    // Vrai dès que Supabase a rendu une réponse définitive (session réelle ou
    // déconnexion) : le mode hors ligne ne doit plus la remplacer.
    let resolved = false;

    async function handleSession(newSession) {
      if (!mounted) return;
      if (newSession?.offline) {
        if (resolved) return;
      } else {
        resolved = true;
      }
      setSession(newSession ?? null);

      if (newSession?.user) {
        if (!newSession.offline) {
          const authId = newSession.user.id;
          const lastUser = await AsyncStorage.getItem(LAST_USER_KEY).catch(() => null);
          if (lastUser && lastUser !== authId) {
            // Autre compte sur le même appareil : rien de l'ancien ne doit rester.
            await clearOfflineData({ includePending: true }).catch(() => {});
          }
          await AsyncStorage.multiSet([[LAST_USER_KEY, authId], [SESSION_USER_KEY, authId]]).catch(() => {});
        }
        if (loggedInUserRef.current) return;

        // 1. Fetch base member row
        const cacheOnly = Boolean(newSession.offline);
        const user = await fetchMember(newSession.user.id, true, cacheOnly);
        if (!mounted || !user) return;

        // 2. Determine which org to activate, scoped to THIS member
        const lastOrgId = await AsyncStorage.getItem(lastOrgKey(user.id));
        const activeOrgId = lastOrgId ?? user.organization_id;

        // 3. Fetch role for that org
        const role = await fetchRoleForOrg(user.id, activeOrgId, { cacheOnly });

        // 4. If role is null the stored org is invalid for this user — fall back
        //    to their default org and clear the stale key
        const verifiedOrgId = role ? activeOrgId : user.organization_id;
        const verifiedRole  = role ?? user.role;

        if (!role && lastOrgId && !cacheOnly && isOnline()) {
          await AsyncStorage.removeItem(lastOrgKey(user.id));
        }

        // 5. Always fetch and set the active org so the org picker is never empty
        const { data: activeOrg } = cacheOnly
          ? { data: await readCache(`org-${verifiedOrgId}`) }
          : await cachedSelect(`org-${verifiedOrgId}`, () => supabase
          .from('organizations')
          .select('id, name')
          .eq('id', verifiedOrgId)
          .single());

        if (mounted) {
          setLoggedInUser({
            ...user,
            organization_id: verifiedOrgId,
            role: verifiedRole,
          });
          if (activeOrg) setSelectedOrg(activeOrg);
        }
      } else {
        setLoggedInUser(null);
      }
    }

    const enterOffline = (authId) => handleSession({ user: { id: authId }, offline: true });

    // Pas de session utilisable : vraie déconnexion, ou simple absence de réseau ?
    // Sans réseau, Supabase ne peut pas renouveler un jeton expiré et rend une
    // session vide, alors que le compte est toujours connecté sur l'appareil.
    async function handleNoSession() {
      const authId = await cachedAccount();
      if (!mounted) return;
      if (authId) {
        if (await deviceIsOffline()) { await enterOffline(authId); return; }
        // Réseau annoncé : on redemande la session. Elle peut aboutir cette fois,
        // ou échouer pour cause de réseau (connexion inutilisable).
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (data?.session) { await handleSession(data.session); return; }
        if (error && isNetworkError(error)) { await enterOffline(authId); return; }
      }
      await handleSession(null);
    }

    // Démarrage sans réseau : ne pas attendre les tentatives de renouvellement
    // du jeton (plusieurs dizaines de secondes) pour ouvrir l'application.
    let offlineTimer = null;
    (async () => {
      const authId = await cachedAccount();
      if (!authId || !mounted || resolved) return;
      if (await deviceIsOffline()) { await enterOffline(authId); return; }
      offlineTimer = setTimeout(() => { if (mounted && !resolved) enterOffline(authId); }, OFFLINE_START_DELAY_MS);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!mounted) return;
      authStateHandled.current = true;

      if (event === 'SIGNED_OUT') {
        resolved = true;
        await AsyncStorage.removeItem(SESSION_USER_KEY).catch(() => {});
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

      // Jeton renouvelé pour un utilisateur déjà chargé : seule la session change.
      // (Sinon — retour du réseau après un démarrage difficile — on charge le profil.)
      if (event === 'TOKEN_REFRESHED' && newSession && loggedInUserRef.current) {
        resolved = true;
        setSession(newSession);
        return;
      }

      if (newSession) await handleSession(newSession);
      // Hors du rappel d'authentification : handleNoSession interroge de nouveau la session.
      else setTimeout(() => { handleNoSession(); }, 0);
    });

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!mounted) return;
      if (error) console.error('[AuthGate] getSession error:', error);
      if (!authStateHandled.current) {
        if (data.session) await handleSession(data.session);
        else await handleNoSession();
      }
    });

    return () => {
      mounted = false;
      if (offlineTimer) clearTimeout(offlineTimer);
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