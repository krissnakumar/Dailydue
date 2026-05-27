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
  durationMs = 200,
}: AnimatedFillIoniconProps) {
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    progress.stopAnimation();
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: durationMs,
      easing: focused ? Easing.out(Easing.quad) : Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [durationMs, focused, progress]);

  useEffect(() => {
    progress.stopAnimation();
    if (focused) {
      Animated.spring(progress, {
        toValue: 1,
        mass: 0.7,
        damping: 15,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(progress, {
      toValue: 0,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focused, pressCount, progress]);

  const fillTranslateY = useMemo(() => {
    return progress.interpolate({
      inputRange: [0, 1],
      outputRange: [size * 0.65, 0],
    });
  }, [progress, size]);

  const fillOpacity = useMemo(() => {
    return progress.interpolate({
      inputRange: [0, 0.12, 1],
      outputRange: [0, 0.35, 1],
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
        <Animated.View style={{ transform: [{ translateY: fillTranslateY }], opacity: fillOpacity }}>
          <Ionicons name={filledName} size={size} color={fillColor ?? color} />
        </Animated.View>
      </View>
    </View>
  );
}
