import React, { useEffect } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  useWindowDimensions,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { theme } from '../theme';

interface AnimatedPopupProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export const AnimatedPopup: React.FC<AnimatedPopupProps> = ({
  visible,
  onClose,
  children,
}) => {
  const { height } = useWindowDimensions();
  const backdropOpacity = useSharedValue(0);
  const contentTranslateY = useSharedValue(height);
  const startY = useSharedValue(0);

  useEffect(() => {
    // If height changes, ensure closed state stays synced with screen height
    if (visible) {
      backdropOpacity.value = withTiming(1, { duration: 300 });
      contentTranslateY.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.cubic) });
    } else {
      backdropOpacity.value = withTiming(0, { duration: 250 });
      contentTranslateY.value = withTiming(height, {
        duration: 250,
        easing: Easing.out(Easing.quad),
      });
    }
  }, [visible, height]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startY.value = contentTranslateY.value;
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        contentTranslateY.value = startY.value + event.translationY;
      }
    })
    .onEnd((event) => {
      if (event.translationY > 100 || event.velocityY > 500) {
        contentTranslateY.value = withTiming(height, { duration: 200 }, () => {
          runOnJS(onClose)();
        });
      } else {
        contentTranslateY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
      }
    });

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: contentTranslateY.value }],
    maxHeight: height * 0.9,
  }));

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none">
      <View style={styles.overlay}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.backdrop, backdropStyle]} />
        </TouchableWithoutFeedback>

        <GestureDetector gesture={panGesture}>
          <Animated.View style={[styles.content, contentStyle]}>
            <View style={styles.handleContainer}>
                <View style={styles.handle} />
            </View>
            <KeyboardAvoidingView
              style={styles.keyboardAvoider}
              behavior="padding"
              keyboardVerticalOffset={Platform.OS === 'android' ? 24 : 0}
            >
              {children}
            </KeyboardAvoidingView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  content: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    minHeight: 250,
    ...theme.shadows.lg,
  },
  keyboardAvoider: {
    flex: 1,
  },
  handleContainer: {
    height: 30,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#e2e8f0',
  },
});
