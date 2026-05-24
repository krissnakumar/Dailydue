import React from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFiadoStore } from '../../src/store';

export default function TabsLayout() {
  const router = useRouter();
  const { user, authChecked } = useFiadoStore();

  if (authChecked && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: styles.label,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="home-details"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="clientes"
          options={{
            title: 'Clientes',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'people' : 'people-outline'} size={21} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="relatorios"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="novo-fiado"
          options={{
            title: 'Fiado',
            tabBarLabel: ({ focused }) => (
              <Text style={[styles.centerLabel, focused && { color: theme.colors.accent }]}>
                Fiado
              </Text>
            ),
            tabBarButton: ({ delayLongPress, onPress, href, ...props }: any) => (
              <TouchableOpacity
                {...props}
                activeOpacity={0.8}
                onPress={(e: any) => {
                  if (e && e.preventDefault) e.preventDefault();
                  router.push('/novo-fiado');
                }}
                style={styles.centerButtonWrapper}
              >
                <View style={styles.centerButton}>
                  <Ionicons name="add" size={24} color={theme.colors.accent} style={{ marginTop: 1 }} />
                </View>
                <Text style={styles.centerText}>Fiado</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <Tabs.Screen
          name="cobrancas"
          options={{
            title: 'Cobranças',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={20} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="pagamentos"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="subscription"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="config"
          options={{
            title: 'Config',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'settings' : 'settings-outline'} size={20} color={color} />
            ),
          }}
        />
      </Tabs>
    </>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: theme.colors.card,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    height: 70,
    paddingBottom: 8,
    paddingTop: 8,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  icon: {
    fontSize: 20,
  },
  centerButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -15,
  },
  centerButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ffedd5',
    borderWidth: 2,
    borderColor: theme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: theme.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  centerIcon: {
    fontSize: 22,
    color: theme.colors.accent,
  },
  centerText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.accent,
    marginTop: 4,
  },
  centerLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
});
