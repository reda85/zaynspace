import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

export function DeepLinkHandler() {
  const router = useRouter();

  useEffect(() => {
    // Handle initial URL when app is opened from a link
    const handleInitialURL = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleDeepLink(initialUrl);
      }
    };

    // Handle URLs when app is already open
    const subscription = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    handleInitialURL();

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (url) => {
    const { hostname, path, queryParams } = Linking.parse(url);

    console.log('Deep link received:', { url, hostname, path, queryParams });

    // Extract the path parts
    const mainPath = hostname;
  const id = queryParams?.id || path;

    // Handle task/pin links
    if (mainPath === 'task' && id) {
      router.push({
        pathname: '/PinMetadataScreen',
        params: {
          pinId: id,
          from: 'DeepLink',
        },
      });
    } else if (mainPath === 'pin' && id) {
      router.push({
        pathname: '/PinMetadataScreen',
        params: {
          pinId: id,
          from: 'DeepLink',
        },
      });
    } else if (mainPath === 'project' && id) {
      router.push({
        pathname: '/acceuil',
        params: { projectId: id },
      });
    }
  };

  return null;
}