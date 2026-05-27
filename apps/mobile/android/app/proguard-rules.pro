# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Hermes
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# Supabase / GoTrue
-keep class org.msgpack.** { *; }
-keep class kotlinx.serialization.** { *; }

# React Native Gesture Handler
-keep class com.swmansion.gesturehandler.** { *; }

# React Native Screens
-keep class com.swmansion.rnscreens.** { *; }

# React Native Safe Area Context
-keep class com.th3rdwave.safeareacontext.** { *; }

# Expo Modules
-keep class expo.modules.** { *; }

# React Native IAP
-keep class com.dooboolab.iap.** { *; }

# Google Sign-In
-keep class com.reactnativegooglesignin.** { *; }

# Keep JavaScript interface methods used by native modules
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep source file names and line numbers for crash reporting
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
