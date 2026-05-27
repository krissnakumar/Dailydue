import React from 'react';
import { Platform, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AdaptiveContainer, AdaptiveCard, ResponsiveText } from '../../src/components';

export default function SubscriptionScreen() {
  const { t } = useTranslation();
  if (Platform.OS === 'web') {
    return (
      <AdaptiveContainer maxWidth={620} contentContainerStyle={styles.webWrap}>
        <AdaptiveCard>
          <ResponsiveText variant="title">{t('subscription.title')}</ResponsiveText>
          <ResponsiveText muted style={styles.webDesc}>
            {t('subscription.androidOnly')}
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
