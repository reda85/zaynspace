// components/NetworkListener.tsx
import NetInfo from '@react-native-community/netinfo';
import { useSetAtom } from 'jotai';
import { useEffect } from 'react';
import { isOnlineAtom } from '../store/atoms';


// Mount once at the root. Renders nothing — just syncs NetInfo → atom.
export function NetworkListener() {
  const setOnline = useSetAtom(isOnlineAtom);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // isInternetReachable is null until the first probe resolves;
      // treat only an explicit `false` as offline to avoid a false flash on launch.
      const online =
        Boolean(state.isConnected) && state.isInternetReachable !== false;
      setOnline(online);
    });
    return unsubscribe;
  }, [setOnline]);

  return null;
}