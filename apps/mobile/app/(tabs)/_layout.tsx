import React from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Platform, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { theme } from '../../src/theme';
import { Ionicons } from '@expo/vector-icons';
import { useFiadoStore } from '../../src/store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const router = useRouter();
  const { user, authChecked } = useFiadoStore();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const isSmall = width < 360;
  const isTablet = width >= 768;
  const iconSize = isSmall ? 19 : isTablet ? 23 : 21;
  const tabBarHeight = (isSmall ? 62 : isTablet ? 78 : 70) + Math.max(insets.bottom, 0);
  const tabBarPaddingBottom = Math.max(insets.bottom, isSmall ? 6 : 8);

  if (authChecked && !user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarStyle: [
            styles.tabBar,
            {
              height: tabBarHeight,
              paddingBottom: tabBarPaddingBottom,
              paddingTop: isSmall ? 6 : 8,
            },
            Platform.OS === 'web' && styles.webTabBar,
          ],
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: [styles.label, isSmall && styles.labelSmall, isTablet && styles.labelTablet],
          tabBarItemStyle: styles.tabItem,
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'home' : 'home-outline'} size={iconSize} color={color} />
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
              <Ionicons name={focused ? 'people' : 'people-outline'} size={iconSize} color={color} />
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
                style={[styles.centerButtonWrapper, isSmall && styles.centerButtonWrapperSmall]}
              >
                <View style={[styles.centerButton, isSmall && styles.centerButtonSmall, isTablet && styles.centerButtonTablet]}>
                  <Ionicons name="add" size={isSmall ? 22 : isTablet ? 28 : 24} color={theme.colors.accent} style={{ marginTop: 1 }} />
                </View>
                <Text style={[styles.centerText, isSmall && styles.labelSmall]}>Fiado</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <Tabs.Screen
          name="cobrancas"
          options={{
            title: 'Cobranças',
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline'} size={iconSize} color={color} />
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
              <Ionicons name={focused ? 'settings' : 'settings-outline'} size={iconSize} color={color} />
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
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
  },
  webTabBar: {
    maxWidth: 760,
    alignSelf: 'center',
    left: 0,
    right: 0,
    borderTopLeftRadius: theme.borderRadius.lg,
    borderTopRightRadius: theme.borderRadius.lg,
  },
  tabItem: {
    minHeight: 44,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Inter',
  },
  labelSmall: {
    fontSize: 10,
  },
  labelTablet: {
    fontSize: 12,
  },
  icon: {
    fontSize: 20,
  },
  centerButtonWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: -14,
  },
  centerButtonWrapperSmall: {
    marginTop: -10,
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
  centerButtonSmall: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  centerButtonTablet: {
    width: 56,
    height: 56,
    borderRadius: 28,
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
