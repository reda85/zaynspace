// components/NetworkListener.tsx
import NetInfo from '@react-native-community/netinfo';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { setOnline as setOfflineModuleOnline, startSync } from '../lib/offline';
import { isOnlineAtom } from '../store/atoms';


// Mount once at the root. Renders nothing — just syncs NetInfo → atom.
export function NetworkListener() {
  const setOnline = useSetAtom(isOnlineAtom);

  useEffect(() => {
    // Charge la file d'attente et l'envoie dès que le réseau revient.
    startSync();
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable is null until the first probe resolves;
      // treat only an explicit `false` as offline to avoid a false flash on launch.
      const online =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      setOnline(online);
      setOfflineModuleOnline(online);
    });
    return unsubscribe;
  }, [setOnline]);

  return null;
}