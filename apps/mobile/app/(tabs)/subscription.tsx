import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';

export default function SubscriptionScreen() {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrap}>
        <Text style={styles.webTitle}>Assinatura</Text>
        <Text style={styles.webDesc}>
          Assinaturas via Google Play estão disponíveis apenas no app Android.
        </Text>
      </View>
    );
  }

  // Avoid bundling native-only modules on web.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NativeScreen = require('./subscription.native').default as React.ComponentType;
  return <NativeScreen />;
}

const styles = StyleSheet.create({
  webWrap: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  webTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6,
  },
  webDesc: {
    fontSize: 14,
    opacity: 0.75,
  },
});

