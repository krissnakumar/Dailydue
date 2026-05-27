import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, ImageSourcePropType, StyleProp, View, ViewStyle } from 'react-native';

type BookWriteLogoProps = {
  source: ImageSourcePropType;
  size?: number;
  width?: number;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Always-on header logo animation:
 * - slow breathing (scale + opacity)
 * - original logo stays as the base (branding)
 */
export function BookWriteLogo({ source, size, width, height, borderRadius = 8, style }: BookWriteLogoProps) {
  const w = width ?? size ?? 32;
  const h = height ?? size ?? 32;
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  const breatheStyle = useMemo(() => {
    const scale = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.08],
    });
    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.92, 1],
    });
    return { transform: [{ scale }], opacity };
  }, [progress]);

  return (
    <Animated.View style={[{ width: w, height: h, borderRadius, overflow: 'hidden' }, style, breatheStyle]}>
      <Image source={source} style={{ width: w, height: h }} resizeMode="contain" />

      {/* Glass overlay so the animation reads on any logo color */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.06)',
        }}
      />
    </Animated.View>
  );
}
