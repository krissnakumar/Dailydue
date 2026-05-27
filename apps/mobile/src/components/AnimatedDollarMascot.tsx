import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Easing } from 'react-native';
import { theme } from '../theme';

export function AnimatedDollarMascot({ size = 48, triggerCount = 0 }: { size?: number; triggerCount?: number }) {
  // Body squash & stretch / bounce animations
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const scaleXAnim = useRef(new Animated.Value(1)).current;
  const scaleYAnim = useRef(new Animated.Value(1)).current;

  // Arm folding animation (0: idle, 1: fully folded in the center)
  const foldAnim = useRef(new Animated.Value(0)).current;

  // Sparkle effects (fades, scales, and floats upward)
  const sparkleAnim = useRef(new Animated.Value(0)).current;
  const sparkleTranslateY = useRef(new Animated.Value(0)).current;
  const sparkleScale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    if (triggerCount === 0) {
      // Perfect reset to idle pose
      bounceAnim.setValue(0);
      scaleXAnim.setValue(1);
      scaleYAnim.setValue(1);
      foldAnim.setValue(0);
      sparkleAnim.setValue(0);
      sparkleTranslateY.setValue(0);
      sparkleScale.setValue(0.5);
      return;
    }

    // Reset animations cleanly before starting the liquid sequence
    bounceAnim.setValue(0);
    scaleXAnim.setValue(1);
    scaleYAnim.setValue(1);
    foldAnim.setValue(0);
    sparkleAnim.setValue(0);
    sparkleTranslateY.setValue(0);
    sparkleScale.setValue(0.5);

    // Dynamic, physical liquid animation sequence using springs
    
    // 1. Squash Down (Anticipation / fluid compression of a heavy droplet)
    const fluidSquash = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: 4, duration: 110, useNativeDriver: true, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
      Animated.timing(scaleXAnim, { toValue: 1.28, duration: 110, useNativeDriver: true, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
      Animated.timing(scaleYAnim, { toValue: 0.72, duration: 110, useNativeDriver: true, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
    ]);

    // 2. Liquid Snap & Fold (Release / smooth viscous flow)
    const liquidSnap = Animated.parallel([
      // Spring for body translation (springy, low friction, heavy mass)
      Animated.spring(bounceAnim, {
        toValue: 0,
        stiffness: 90,
        damping: 10,
        mass: 1.4,
        useNativeDriver: true,
      }),
      // Springs for scale to produce an organic jelly-like wobble/jiggle
      Animated.spring(scaleXAnim, {
        toValue: 1,
        stiffness: 70,
        damping: 7,
        mass: 1.2,
        useNativeDriver: true,
      }),
      Animated.spring(scaleYAnim, {
        toValue: 1,
        stiffness: 70,
        damping: 7,
        mass: 1.2,
        useNativeDriver: true,
      }),
      // Smooth, highly viscous spring for arms folding
      Animated.spring(foldAnim, {
        toValue: 1,
        stiffness: 85,
        damping: 9,
        mass: 1.1,
        useNativeDriver: true,
      }),
    ]);

    // 3. Sparkle Bubble Release (Floats up with organic fluid wave)
    const sparkleRelease = Animated.sequence([
      Animated.delay(80),
      Animated.parallel([
        Animated.timing(sparkleAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(sparkleTranslateY, { toValue: -18, duration: 450, useNativeDriver: true, easing: Easing.bezier(0.25, 1, 0.5, 1) }),
        Animated.spring(sparkleScale, {
          toValue: 1.35,
          stiffness: 100,
          damping: 8,
          useNativeDriver: true,
        }),
      ]),
    ]);

    // 4. Return to Idle (Viscous release, dissolving back to rest)
    const viscousReturn = Animated.parallel([
      Animated.spring(foldAnim, {
        toValue: 0,
        stiffness: 45,
        damping: 14,
        mass: 1.3,
        useNativeDriver: true,
      }),
      Animated.timing(sparkleAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(sparkleTranslateY, { toValue: 0, duration: 250, useNativeDriver: true, easing: Easing.in(Easing.ease) }),
      Animated.timing(sparkleScale, { toValue: 0.5, duration: 250, useNativeDriver: true }),
    ]);

    // Run the full beautiful liquid lifecycle
    Animated.sequence([
      fluidSquash,
      liquidSnap,
      sparkleRelease,
      Animated.delay(1200), // Hold in full liquid admiration
      viscousReturn,
    ]).start();

  }, [triggerCount, bounceAnim, scaleXAnim, scaleYAnim, foldAnim, sparkleAnim, sparkleTranslateY, sparkleScale]);

  // Arm translation and rotation interpolations (perfected for smooth meeting curves)
  // Left arm: swings clockwise inwards, translates right and up
  const leftArmRotate = foldAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-12deg', '125deg'],
  });
  const leftArmTranslateX = foldAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 7.5],
  });
  const leftArmTranslateY = foldAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6.5],
  });

  // Right arm: swings counter-clockwise inwards, translates left and up
  const rightArmRotate = foldAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['12deg', '-125deg'],
  });
  const rightArmTranslateX = foldAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -7.5],
  });
  const rightArmTranslateY = foldAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6.5],
  });

  // Wiggle / horizontal sine wave interpolation for the rising sparkle
  // As the sparkle floats up (translateY: 0 to -18), it sways beautifully side-to-side
  const sparkleTranslateX = sparkleTranslateY.interpolate({
    inputRange: [-18, -13.5, -9, -4.5, 0],
    outputRange: [0, -2.5, 2.5, -1.5, 0],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Rising Sparkle of Trust/Gratitude with liquid floating wiggle */}
      <Animated.View style={[
        styles.sparkleContainer,
        {
          opacity: sparkleAnim,
          transform: [
            { translateY: sparkleTranslateY },
            { translateX: sparkleTranslateX },
            { scale: sparkleScale },
          ],
        },
      ]}>
        <Text style={styles.sparkleText}>✨</Text>
      </Animated.View>

      {/* Left Arm */}
      <Animated.View style={[
        styles.arm, 
        styles.leftArm, 
        { 
          transform: [
            { translateX: leftArmTranslateX },
            { translateY: leftArmTranslateY },
            { rotate: leftArmRotate },
          ],
        },
      ]}>
        <View style={[styles.hand, { left: -1.5 }]} />
      </Animated.View>

      {/* Right Arm */}
      <Animated.View style={[
        styles.arm, 
        styles.rightArm, 
        { 
          transform: [
            { translateX: rightArmTranslateX },
            { translateY: rightArmTranslateY },
            { rotate: rightArmRotate },
          ],
        },
      ]}>
        <View style={[styles.hand, { right: -1.5 }]} />
      </Animated.View>

      {/* Left Leg */}
      <Animated.View style={[
        styles.leg, 
        styles.leftLeg, 
        { 
          transform: [
            { translateY: bounceAnim.interpolate({
                inputRange: [-8, 0, 4],
                outputRange: [2, 0, -1],
              }) 
            },
          ],
        },
      ]}>
        <View style={styles.foot} />
      </Animated.View>

      {/* Right Leg */}
      <Animated.View style={[
        styles.leg, 
        styles.rightLeg, 
        { 
          transform: [
            { translateY: bounceAnim.interpolate({
                inputRange: [-8, 0, 4],
                outputRange: [2, 0, -1],
              }) 
            },
          ],
        },
      ]}>
        <View style={styles.foot} />
      </Animated.View>

      {/* Mascot Center Dollar Symbol Body with dynamic liquid squash-and-stretch */}
      <Animated.View style={[
        styles.body, 
        { 
          transform: [
            { translateY: bounceAnim },
            { scaleX: scaleXAnim },
            { scaleY: scaleYAnim },
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
  },
  sparkleContainer: {
    position: 'absolute',
    top: 5,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkleText: {
    fontSize: 14,
    color: '#fbbf24', // Golden sparkle
    textShadowColor: 'rgba(251, 191, 36, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
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
    marginTop: -8,
  },
  arm: {
    position: 'absolute',
    width: 12,
    height: 3,
    backgroundColor: '#ffedd5', // peach cartoon skin
    borderRadius: 1.5,
    top: 21,
    borderWidth: 0.8,
    borderColor: '#475569',
  },
  leftArm: {
    left: 3.5,
  },
  rightArm: {
    right: 3.5,
  },
  hand: {
    width: 4.5,
    height: 4.5,
    borderRadius: 2.25,
    backgroundColor: '#ffffff', // white gloves
    position: 'absolute',
    top: -1.5,
    borderWidth: 0.6,
    borderColor: '#475569',
  },
  leg: {
    position: 'absolute',
    width: 3.5,
    height: 9,
    backgroundColor: '#334155',
    borderRadius: 1.5,
    bottom: 4,
  },
  leftLeg: {
    left: 15,
  },
  rightLeg: {
    right: 15,
  },
  foot: {
    width: 6,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#fbbf24',
    position: 'absolute',
    bottom: 0,
    left: -1,
  },
});
