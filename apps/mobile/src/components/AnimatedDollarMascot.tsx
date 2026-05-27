import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { theme } from '../theme';

export function AnimatedDollarMascot({ size = 48, triggerCount = 0 }: { size?: number; triggerCount?: number }) {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const leftArmAnim = useRef(new Animated.Value(0)).current;
  const rightArmAnim = useRef(new Animated.Value(0)).current;
  const leftLegAnim = useRef(new Animated.Value(0)).current;
  const rightLegAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (triggerCount === 0) {
      // Idle pose: make sure all values are reset to 0 (default pose)
      bounceAnim.setValue(0);
      leftArmAnim.setValue(0);
      rightArmAnim.setValue(0);
      leftLegAnim.setValue(0);
      rightLegAnim.setValue(0);
      return;
    }

    // 1. Continuous Hop/Bounce animation for the character body
    const bodyLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: -3,
          duration: 380,
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 380,
          useNativeDriver: true,
        }),
      ])
    );

    // 2. Continuous Waving arms loop
    const armsLoop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(leftArmAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(leftArmAnim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );

    const armsLoop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(rightArmAnim, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(rightArmAnim, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
      ])
    );

    // 3. Alternating Leg walk/dance vertical bouncing
    const legsLoop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(leftLegAnim, {
          toValue: -2.5,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(leftLegAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ])
    );

    const legsLoop2 = Animated.loop(
      Animated.sequence([
        Animated.timing(rightLegAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(rightLegAnim, {
          toValue: -2.5,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(rightLegAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ])
    );

    // Start all animation loops
    bodyLoop.start();
    armsLoop1.start();
    armsLoop2.start();
    legsLoop1.start();
    legsLoop2.start();

    // After 1800ms of dancing, smoothly decay values back to 0 (idle pose)
    const timeout = setTimeout(() => {
      bodyLoop.stop();
      armsLoop1.stop();
      armsLoop2.stop();
      legsLoop1.stop();
      legsLoop2.stop();

      Animated.parallel([
        Animated.timing(bounceAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(leftArmAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(rightArmAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(leftLegAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(rightLegAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    }, 1800);

    return () => {
      clearTimeout(timeout);
      bodyLoop.stop();
      armsLoop1.stop();
      armsLoop2.stop();
      legsLoop1.stop();
      legsLoop2.stop();
    };
  }, [triggerCount, bounceAnim, leftArmAnim, rightArmAnim, leftLegAnim, rightLegAnim]);

  const bodyY = bounceAnim;
  
  const leftArmRotate = leftArmAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-18deg', '24deg'],
  });

  const rightArmRotate = rightArmAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['18deg', '-24deg'],
  });

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* Left Arm */}
      <Animated.View style={[
        styles.arm, 
        styles.leftArm, 
        { transform: [{ rotate: leftArmRotate }] }
      ]}>
        <View style={[styles.hand, { left: -1 }]} />
      </Animated.View>

      {/* Right Arm */}
      <Animated.View style={[
        styles.arm, 
        styles.rightArm, 
        { transform: [{ rotate: rightArmRotate }] }
      ]}>
        <View style={[styles.hand, { right: -1 }]} />
      </Animated.View>

      {/* Left Leg */}
      <Animated.View style={[
        styles.leg, 
        styles.leftLeg, 
        { transform: [{ translateY: leftLegAnim }] }
      ]}>
        <View style={styles.foot} />
      </Animated.View>

      {/* Right Leg */}
      <Animated.View style={[
        styles.leg, 
        styles.rightLeg, 
        { transform: [{ translateY: rightLegAnim }] }
      ]}>
        <View style={styles.foot} />
      </Animated.View>

      {/* Dollar Mascot Body */}
      <Animated.View style={[
        styles.body, 
        { transform: [{ translateY: bodyY }] }
      ]}>
        {/* Mascot Center Dollar Symbol only */}
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
    color: '#10b981', // Glowing signature emerald green dollar character
    fontFamily: Platform.OS === 'ios' ? 'System' : 'normal',
    marginTop: -8,
  },
  arm: {
    position: 'absolute',
    width: 11,
    height: 3,
    backgroundColor: '#ffedd5', // Cartoon skin peach tone
    borderRadius: 1.5,
    top: 21,
    borderWidth: 0.8,
    borderColor: '#475569',
  },
  leftArm: {
    left: 4,
  },
  rightArm: {
    right: 4,
  },
  hand: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff', // White cartoon glove hands
    position: 'absolute',
    top: -1,
  },
  leg: {
    position: 'absolute',
    width: 3.5,
    height: 9,
    backgroundColor: '#334155', // Charcoal leg lines
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
    backgroundColor: '#fbbf24', // Amber yellow retro-mascot shoes
    position: 'absolute',
    bottom: 0,
    left: -1,
  },
});
