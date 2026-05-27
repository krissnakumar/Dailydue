import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Easing } from 'react-native';
import { theme } from '../theme';

export function AnimatedDollarMascot({ size = 48, triggerCount = 0 }: { size?: number; triggerCount?: number }) {
  // Body jump + squash/stretch animations
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const scaleXAnim = useRef(new Animated.Value(1)).current;
  const scaleYAnim = useRef(new Animated.Value(1)).current;
  const sitAnim = useRef(new Animated.Value(0)).current;
  const hammockAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (triggerCount === 0) {
      // Perfect reset to idle pose
      bounceAnim.setValue(0);
      scaleXAnim.setValue(1);
      scaleYAnim.setValue(1);
      sitAnim.setValue(0);
      hammockAnim.setValue(0);
      return;
    }

    // Reset animations cleanly before starting the liquid sequence
    bounceAnim.setValue(0);
    scaleXAnim.setValue(1);
    scaleYAnim.setValue(1);
    sitAnim.setValue(0);
    hammockAnim.setValue(0);

    // 1) Squash before jump
    const preJump = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: 5, duration: 90, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleXAnim, { toValue: 1.2, duration: 90, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 0.8, duration: 90, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]);

    // 2) Jump up
    const jumpUp = Animated.parallel([
      Animated.timing(bounceAnim, {
        toValue: -18,
        duration: 180,
        useNativeDriver: true,
        easing: Easing.out(Easing.cubic),
      }),
      Animated.timing(scaleXAnim, { toValue: 0.9, duration: 150, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 1.12, duration: 150, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]);

    // 3) Sit on hammock briefly
    const sitOnHammock = Animated.parallel([
      Animated.timing(hammockAnim, { toValue: 1, duration: 110, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(sitAnim, { toValue: 1, duration: 110, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(bounceAnim, { toValue: -12, duration: 110, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleXAnim, { toValue: 1.08, duration: 110, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 0.9, duration: 110, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]);

    const hammockPause = Animated.delay(320);

    // 4) Drop from hammock + rebound
    const leaveHammock = Animated.parallel([
      Animated.timing(hammockAnim, { toValue: 0, duration: 120, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      Animated.timing(sitAnim, { toValue: 0, duration: 120, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
    ]);

    const land = Animated.parallel([
      Animated.timing(bounceAnim, {
        toValue: 0,
        duration: 170,
        useNativeDriver: true,
        easing: Easing.in(Easing.cubic),
      }),
      Animated.timing(scaleXAnim, { toValue: 1.16, duration: 110, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 0.85, duration: 110, useNativeDriver: true, easing: Easing.in(Easing.quad) }),
    ]);

    const rebound = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: -5, duration: 85, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleXAnim, { toValue: 0.96, duration: 85, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 1.05, duration: 85, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]);

    const settle = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: 0, duration: 90, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      Animated.timing(scaleXAnim, { toValue: 1, duration: 90, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 1, duration: 90, useNativeDriver: true, easing: Easing.inOut(Easing.quad) }),
    ]);

    // Run the full beautiful liquid lifecycle
    Animated.sequence([
      preJump,
      jumpUp,
      sitOnHammock,
      hammockPause,
      leaveHammock,
      land,
      rebound,
      settle,
    ]).start();

  }, [triggerCount, bounceAnim, scaleXAnim, scaleYAnim, sitAnim, hammockAnim]);

  const hammockOpacity = hammockAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.95],
  });
  const bodyRotate = sitAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '-14deg'],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Animated.View style={[styles.hammockWrap, { opacity: hammockOpacity }]}>
        <View style={styles.hammockPoleLeft} />
        <View style={styles.hammockPoleRight} />
        <View style={styles.hammockRopeLeft} />
        <View style={styles.hammockRopeRight} />
        <View style={styles.hammockBed} />
      </Animated.View>

      {/* Mascot Center Dollar Symbol Body with dynamic liquid squash-and-stretch */}
      <Animated.View style={[
        styles.body, 
        { 
          transform: [
            { translateY: bounceAnim },
            { scaleX: scaleXAnim },
            { scaleY: scaleYAnim },
            { rotate: bodyRotate },
          ],
        },
      ]}>
        <Text style={styles.dollarText}>$</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  hammockWrap: {
    position: 'absolute',
    top: 2,
    width: 34,
    height: 20,
    alignItems: 'center',
  },
  hammockPoleLeft: {
    position: 'absolute',
    left: 0,
    top: 2,
    width: 2,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#475569',
  },
  hammockPoleRight: {
    position: 'absolute',
    right: 0,
    top: 2,
    width: 2,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#475569',
  },
  hammockRopeLeft: {
    position: 'absolute',
    left: 4,
    top: 4,
    width: 1.6,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#64748b',
    transform: [{ rotate: '-28deg' }],
  },
  hammockRopeRight: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 1.6,
    height: 9,
    borderRadius: 2,
    backgroundColor: '#64748b',
    transform: [{ rotate: '28deg' }],
  },
  hammockBed: {
    position: 'absolute',
    bottom: 0,
    width: 28,
    height: 8,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    borderWidth: 1.2,
    borderColor: '#0f766e',
    backgroundColor: '#34d399',
  },
  body: {
    width: 32,
    height: 32,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dollarText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#10b981', // Emerald green
    fontFamily: Platform.OS === 'ios' ? 'System' : 'normal',
    marginTop: 1,
  },
});
