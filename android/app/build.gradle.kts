import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// 从 android/local.properties 读取 blog.web.url（与 sdk.dir 同文件，见 local.properties.example）
val androidLocal = rootProject.file("local.properties")
val blogWebUrl: String = run {
    val p = Properties()
    if (androidLocal.exists()) {
        androidLocal.inputStream().use { p.load(it) }
    }
    (p.getProperty("blog.web.url") ?: "https://example.com").trim().trimEnd('/')
}

android {
    namespace = "site.personal.blogreader"
    compileSdk = 34

    defaultConfig {
        applicationId = "site.personal.blogreader"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"
        // 供 Kotlin 读取首页地址（末尾无斜杠）
        buildConfigField("String", "BLOG_WEB_URL", "\"${blogWebUrl.replace("\"", "\\\"")}\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}
