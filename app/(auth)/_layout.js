// app/(auth)/_layout.js
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // This needs to be false
      }}
    >
      <Stack.Screen 
        name="sign-in" 
        options={{ headerShown: false }} 
      />
    </Stack>
  );
}