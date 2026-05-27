import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleProp, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AnimatedFillIoniconProps = {
  focused: boolean;
  pressCount?: number;
  outlineName: React.ComponentProps<typeof Ionicons>['name'];
  filledName: React.ComponentProps<typeof Ionicons>['name'];
  size: number;
  color: string;
  fillColor?: string;
  style?: StyleProp<ViewStyle>;
  durationMs?: number;
};

export function AnimatedFillIonicon({
  focused,
  pressCount = 0,
  outlineName,
  filledName,
  size,
  color,
  fillColor,
  style,
  durationMs = 420,
}: AnimatedFillIoniconProps) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: durationMs,
      easing: focused ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true, // translateY
    }).start();
  }, [durationMs, focused, progress]);

  useEffect(() => {
    // Click-driven "liquid fill" even when the tab isn't selected yet.
    if (focused) {
      Animated.sequence([
        Animated.timing(progress, { toValue: 0.88, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      return;
    }

    Animated.sequence([
      Animated.timing(progress, { toValue: 1, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration: 450, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [focused, pressCount, progress]);

  const fillTranslateY = useMemo(() => {
    return progress.interpolate({
      inputRange: [0, 1],
      outputRange: [size, 0],
    });
  }, [progress, size]);

  return (
    <View style={[{ width: size, height: size, position: 'relative', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Ionicons name={outlineName} size={size} color={color} />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: size,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View style={{ transform: [{ translateY: fillTranslateY }] }}>
          <Ionicons name={filledName} size={size} color={fillColor ?? color} />
        </Animated.View>
      </View>
    </View>
  );
}
