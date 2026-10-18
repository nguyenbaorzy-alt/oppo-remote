# ProGuard rules for OPPO Remote Control
-keep class com.oppo.remotecontrol.model.** { *; }
-keep class io.socket.** { *; }
-keep class okhttp3.** { *; }
-keep class okio.** { *; }
-dontwarn okio.**
-dontwarn javax.annotation.**
