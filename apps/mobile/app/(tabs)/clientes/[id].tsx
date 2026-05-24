import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { CustomerDetailContent } from '../../../src/components';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return <CustomerDetailContent id={id || ''} showBackButton={true} />;
}
