import React from 'react';
import { Redirect } from 'expo-router';
import { useFiadoStore } from '../src/store';

export default function IndexRoute() {
  const { user } = useFiadoStore();

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
