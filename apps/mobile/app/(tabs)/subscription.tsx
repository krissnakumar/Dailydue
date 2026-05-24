import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { AdaptiveContainer, AdaptiveCard, ResponsiveText } from '../../src/components';

export default function SubscriptionScreen() {
  if (Platform.OS === 'web') {
    return (
      <AdaptiveContainer maxWidth={620} contentContainerStyle={styles.webWrap}>
        <AdaptiveCard>
          <ResponsiveText variant="title">Assinatura</ResponsiveText>
          <ResponsiveText muted style={styles.webDesc}>
            Assinaturas via Google Play estão disponíveis apenas no app Android.
          </ResponsiveText>
        </AdaptiveCard>
      </AdaptiveContainer>
    );
  }

  // Avoid bundling native-only modules on web.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const NativeScreen = require('./subscription.native').default as React.ComponentType;
  return <NativeScreen />;
}

const styles = StyleSheet.create({
  webWrap: {
    justifyContent: 'center',
  },
  webDesc: {
    marginTop: 6,
  },
});
