import React from 'react';
import { Redirect } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { useDailyDueStore } from '../src/store';

export default function IndexRoute() {
  const { user, authChecked } = useDailyDueStore();

  // Never decide auth from local persisted state; wait for Supabase session check.
  if (!authChecked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#064e3b' }}>
        <ActivityIndicator size="large" color="#ffffff" />
        <Text style={{ marginTop: 12, color: '#ffffff', fontSize: 16, fontWeight: '600' }}>DailyDue</Text>
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return <Redirect href="/(tabs)/home" />;
}
