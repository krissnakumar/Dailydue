import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Redirect, Tabs, useRouter } from 'expo-router';
import { Platform, View, Text, StyleSheet, TouchableOpacity, useWindowDimensions, Animated, Easing, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../src/theme';
import { useDailyDueStore } from '../../src/store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

function DailyDueRunningLight({ triggerCount }: { triggerCount: number }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (triggerCount === 0) return;
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 320,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [triggerCount, pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.35],
  });

  return (
    <Animated.View style={[{ position: 'absolute', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'flex-start', transform: [{ scale }] }]}>
      <Animated.View style={[{ width: '100%', height: '100%', borderRadius: 999, backgroundColor: '#fdba74', opacity: glowOpacity }]} />
    </Animated.View>
  );
}

function DailyDueAnimatedCircle({
  triggerCount,
  children,
  style,
}: {
  triggerCount: number;
  children: React.ReactNode;
  style: StyleProp<ViewStyle>;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (triggerCount === 0) return;
    pulse.setValue(0);
    Animated.sequence([
      Animated.timing(pulse, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pulse, {
        toValue: 0,
        duration: 280,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [triggerCount, pulse]);

  const scale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.06],
  });

  const rotate = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '8deg'],
  });

  return (
    <Animated.View
      style={[
        style,
        { transform: [{ scale }, { rotate }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

function OutlineGlowIcon({
  focused,
  pressCount,
  outlineName,
  size,
  color,
  glowColor,
}: {
  focused: boolean;
  pressCount: number;
  outlineName: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: string;
  glowColor: string;
}) {
  const glow = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(glow, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [focused, glow]);

  useEffect(() => {
    if (pressCount === 0) return;
    glow.setValue(0.35);
    Animated.timing(glow, {
      toValue: focused ? 1 : 0.75,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pressCount, focused, glow]);

  const scale = glow.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const opacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1] });

  return (
    <Animated.View
      style={[
        { alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 0 }, shadowRadius: 14 },
        { transform: [{ scale }], opacity, shadowColor: glowColor, shadowOpacity: focused ? 0.75 : 0.35, elevation: focused ? 12 : 4 },
      ]}
    >
      <Ionicons name={outlineName} size={size} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, authChecked } = useDailyDueStore();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [pressBump, setPressBump] = useState<Record<string, number>>({});

  const isSmall = width < 360;
  const isTablet = width >= 768;
  const iconSize = isSmall ? 19 : isTablet ? 23 : 21;
  const tabBarHeight = (isSmall ? 62 : isTablet ? 78 : 70) + Math.max(insets.bottom, 0);
  const tabBarPaddingBottom = Math.max(insets.bottom, isSmall ? 6 : 8);

  const pressCountFor = useMemo(() => {
    return (key: string) => pressBump[key] ?? 0;
  }, [pressBump]);

  const bump = (key: string) => {
    setPressBump((prev) => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  };

  const computedStyles = useMemo(() => StyleSheet.create({
    tabBar: {
      backgroundColor: theme.colors.tabBarBg,
      borderTopWidth: 1,
      borderTopColor: theme.colors.tabBarBorder,
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
    label: {
      fontSize: 11,
      fontWeight: '600' as const,
      fontFamily: 'Inter',
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
      backgroundColor: theme.colors.centerButtonBg,
      borderWidth: 2,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
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
      fontWeight: '700' as const,
      color: theme.colors.accent,
      marginTop: 4,
    },
    centerLabel: {
      fontSize: 11,
      fontWeight: '700' as const,
      color: theme.colors.textMuted,
    },
  }), [theme]);

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
            computedStyles.tabBar,
            {
              height: tabBarHeight,
              paddingBottom: tabBarPaddingBottom,
              paddingTop: isSmall ? 6 : 8,
            },
            Platform.OS === 'web' && computedStyles.webTabBar,
          ],
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.textMuted,
          tabBarLabelStyle: [computedStyles.label, isSmall && { fontSize: 10 }, isTablet && { fontSize: 12 }],
          tabBarItemStyle: { minHeight: 44 },
        }}
      >
        <Tabs.Screen
          name="home"
          options={{
            title: t('tabs.home'),
            tabBarIcon: ({ color, focused }) => (
              <OutlineGlowIcon
                focused={focused}
                pressCount={pressCountFor('home')}
                outlineName="home-outline"
                size={iconSize}
                color={color}
                glowColor={theme.colors.primary}
              />
            ),
          }}
          listeners={{
            tabPress: () => bump('home'),
          }}
        />
        <Tabs.Screen
          name="home-details"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="clientes"
          options={{
            title: t('tabs.clients'),
            tabBarIcon: ({ color, focused }) => (
              <OutlineGlowIcon
                focused={focused}
                pressCount={pressCountFor('clientes')}
                outlineName="people-outline"
                size={iconSize}
                color={color}
                glowColor={theme.colors.primary}
              />
            ),
          }}
          listeners={{
            tabPress: (e) => {
              e.preventDefault();
              bump('clientes');
              router.navigate('/clientes');
            },
          }}
        />
        <Tabs.Screen
          name="relatorios"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="novo-fiado"
          options={{
            title: t('tabs.sell'),
            tabBarLabel: ({ focused }) => (
              <Text style={[computedStyles.centerLabel, focused && { color: theme.colors.accent }]}>
                {t('tabs.sell')}
              </Text>
            ),
            tabBarButton: ({ ...props }: any) => (
              <TouchableOpacity
                {...props}
                activeOpacity={0.8}
                onPress={(e: any) => {
                  if (e && e.preventDefault) e.preventDefault();
                  bump('novo-fiado');
                  router.push('/novo-fiado');
                }}
                style={[computedStyles.centerButtonWrapper, isSmall && computedStyles.centerButtonWrapperSmall]}
              >
                <DailyDueAnimatedCircle
                  triggerCount={pressCountFor('novo-fiado')}
                  style={[computedStyles.centerButton, isSmall && computedStyles.centerButtonSmall, isTablet && computedStyles.centerButtonTablet]}
                >
                  <DailyDueRunningLight triggerCount={pressCountFor('novo-fiado')} />
                  <Text style={computedStyles.centerIcon}>₹</Text>
                </DailyDueAnimatedCircle>
                <Text style={[computedStyles.centerText, isSmall && { fontSize: 10 }]}>{t('tabs.sell')}</Text>
              </TouchableOpacity>
            ),
          }}
        />
        <Tabs.Screen
          name="cobrancas"
          options={{
            title: t('tabs.collections'),
            tabBarIcon: ({ color, focused }) => (
              <OutlineGlowIcon
                focused={focused}
                pressCount={pressCountFor('cobrancas')}
                outlineName="chatbubble-ellipses-outline"
                size={iconSize}
                color={color}
                glowColor={theme.colors.primary}
              />
            ),
          }}
          listeners={{
            tabPress: () => bump('cobrancas'),
          }}
        />
        <Tabs.Screen
          name="pagamentos"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="subscription"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="config"
          options={{
            title: t('tabs.settings'),
            tabBarIcon: ({ color, focused }) => (
              <OutlineGlowIcon
                focused={focused}
                pressCount={pressCountFor('config')}
                outlineName="settings-outline"
                size={iconSize}
                color={color}
                glowColor={theme.colors.primary}
              />
            ),
          }}
          listeners={{
            tabPress: () => bump('config'),
          }}
        />
      </Tabs>
    </>
  );
}
