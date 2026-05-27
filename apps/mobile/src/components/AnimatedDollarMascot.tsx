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
      // Idle pose: make sure all values are perfectly reset to default idle states
      bounceAnim.setValue(0);
      scaleXAnim.setValue(1);
      scaleYAnim.setValue(1);
      foldAnim.setValue(0);
      sparkleAnim.setValue(0);
      sparkleTranslateY.setValue(0);
      sparkleScale.setValue(0.5);
      return;
    }

    // Clean resets before starting a new sequence
    bounceAnim.setValue(0);
    scaleXAnim.setValue(1);
    scaleYAnim.setValue(1);
    foldAnim.setValue(0);
    sparkleAnim.setValue(0);
    sparkleTranslateY.setValue(0);
    sparkleScale.setValue(0.5);

    // Disney-like Squash and Stretch character animation sequence
    
    // 1. Squash Down (Anticipation / prep for the fold)
    const squashDown = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: 3, duration: 100, useNativeDriver: true, easing: Easing.ease }),
      Animated.timing(scaleXAnim, { toValue: 1.18, duration: 100, useNativeDriver: true, easing: Easing.ease }),
      Animated.timing(scaleYAnim, { toValue: 0.82, duration: 100, useNativeDriver: true, easing: Easing.ease }),
    ]);

    // 2. Jump Up & Fold Hands (Action / high energy peak)
    const jumpAndFold = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: -7, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleXAnim, { toValue: 0.88, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(scaleYAnim, { toValue: 1.15, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
      Animated.timing(foldAnim, { toValue: 1, duration: 260, useNativeDriver: true, easing: Easing.out(Easing.back(1.4)) }),
    ]);

    // 3. Settle Land & Release Sparkle (Glow of gratitude / hold pose)
    const landAndSparkle = Animated.parallel([
      Animated.timing(bounceAnim, { toValue: 0, duration: 140, useNativeDriver: true, easing: Easing.bounce }),
      Animated.timing(scaleXAnim, { toValue: 1, duration: 140, useNativeDriver: true, easing: Easing.bounce }),
      Animated.timing(scaleYAnim, { toValue: 1, duration: 140, useNativeDriver: true, easing: Easing.bounce }),
      Animated.sequence([
        Animated.delay(60),
        Animated.parallel([
          Animated.timing(sparkleAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
          Animated.timing(sparkleTranslateY, { toValue: -15, duration: 380, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
          Animated.timing(sparkleScale, { toValue: 1.25, duration: 250, useNativeDriver: true, easing: Easing.out(Easing.back(1.5)) }),
        ]),
      ]),
    ]);

    // 4. Return to Idle (Relax arms back to side)
    const returnToIdle = Animated.parallel([
      Animated.timing(foldAnim, { toValue: 0, duration: 320, useNativeDriver: true, easing: Easing.out(Easing.ease) }),
      Animated.timing(sparkleAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(sparkleTranslateY, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(sparkleScale, { toValue: 0.5, duration: 200, useNativeDriver: true }),
    ]);

    // Execute full dynamic cartoon sequence
    Animated.sequence([
      squashDown,
      jumpAndFold,
      landAndSparkle,
      Animated.delay(1100), // Hold the respectful folded hands of gratitude
      returnToIdle,
    ]).start();

  }, [triggerCount, bounceAnim, scaleXAnim, scaleYAnim, foldAnim, sparkleAnim, sparkleTranslateY, sparkleScale]);

  // Arm translation and rotation interpolations
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

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Rising Sparkle of Trust/Gratitude */}
      <Animated.View style={[
        styles.sparkleContainer,
        {
          opacity: sparkleAnim,
          transform: [
            { translateY: sparkleTranslateY },
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
                inputRange: [-7, 0, 3],
                outputRange: [2.5, 0, -1],
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
                inputRange: [-7, 0, 3],
                outputRange: [2.5, 0, -1],
              }) 
            },
          ],
        },
      ]}>
        <View style={styles.foot} />
      </Animated.View>

      {/* Mascot Center Dollar Symbol Body */}
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
    backgroundColor: '#ffedd5', // cartoon skin peach
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
    backgroundColor: '#ffffff', // white glove hands
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
