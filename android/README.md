# 博客 Android 客户端（WebView）

在 App 内打开与网页**同一站点**的 Vue 博客，列表、文章、评论、登录均走现有 `/api`，数据与网页端一致。

**在 Mac 本机用 Android Studio 编译**：见同目录下的 **[BUILD_ON_MAC.md](./BUILD_ON_MAC.md)**。

**说明**：WebView 使用**独立的** `localStorage`（`blog_admin_token` 等），与手机 Chrome 不共享。若要在 App 里发表评论或进后台，请在 App 内登录一次；账号与服务器端相同。

## 环境要求

- [Android Studio](https://developer.android.com/studio)（推荐 Koala 及以上）或已安装 **Android SDK** + **JDK 17**
- 可访问的 **HTTPS** 博客地址（与生产部署域名一致）

## 配置站点地址

1. 复制 `local.properties.example` 为 `android/local.properties`
2. 填写：
   - `sdk.dir`：本机 Android SDK 路径  
     - Linux 示例：`/home/用户名/Android/Sdk`  
     - macOS 示例：`/Users/用户名/Library/Android/sdk`
   - `blog.web.url`：例如 `https://blog.example.com`（不要带 `#/`，使用与浏览器一致的根 URL）

默认未配置时，`blog.web.url` 为 `https://example.com`，仅用于占位，**发布前必须修改**。

## Gradle Wrapper

仓库已包含 `gradlew`、`gradlew.bat` 与 `gradle/wrapper/gradle-wrapper.jar`（Gradle 8.7）。在 `android` 目录首次构建前需安装 **JDK 17** 并配置 `local.properties` 中的 `sdk.dir`。

### 国内网络（阿里云 / 清华镜像）

已为大陆网络做默认加速：

- **Gradle 分发包**：`gradle/wrapper/gradle-wrapper.properties` 中 `distributionUrl` 指向阿里云  
  `mirrors.aliyun.com/gradle/distributions/v8.7.0/gradle-8.7-bin.zip`；若需改回官方，可改用文件中注释掉的 `services.gradle.org` 地址。
- **依赖仓库**：`settings.gradle.kts` 中已优先使用 **阿里云** Maven（`google` / `public` / `gradle-plugin`）与 **清华** `maven-public`，其后仍保留 `google()`、`mavenCentral()` 作回退。

若阿里云某版本路径 404，可到 [阿里云 gradle 目录](https://mirrors.aliyun.com/gradle/distributions/) 核对子目录名（如 `v8.7.0`）后改 `distributionUrl`。

## 编译可安装的 APK

### 调试包（可立即安装测试）

在 `android` 目录执行：

```bash
chmod +x ./gradlew   # Linux / macOS 仅需一次
./gradlew :app:assembleDebug
```

产物：`app/build/outputs/apk/debug/app-debug.apk`（`applicationId` 带 `.debug` 后缀）。

### 正式包（上架或发好友）

1. 生成签名密钥（只需做一次）：

```bash
keytool -genkey -v -keystore blog-release.keystore -alias blog -keyalg RSA -keysize 2048 -validity 10000
```

2. 在 `android/app` 下新建 `keystore.properties`（**勿提交 git**）：

```properties
storeFile=../blog-release.keystore
storePassword=你的仓库密码
keyAlias=blog
keyPassword=你的密钥密码
```

3. 在 `app/build.gradle.kts` 的 `android { signingConfigs { ... } }` 中引用该文件（可按 Android 官方「Sign your app」文档粘贴模板），然后执行：

```bash
./gradlew :app:assembleRelease
```

产物：`app/build/outputs/apk/release/app-release.apk`。

若暂不需要签名，可继续使用 **debug APK** 在「允许安装未知来源」的设备上安装。

## 用 Android Studio

1. **File → Open**，选择本仓库下的 `android` 文件夹  
2. 等待 Gradle 同步，按提示安装缺失的 SDK 组件  
3. 配置好 `local.properties` 后，**Build → Build Bundle(s) / APK(s) → Build APK(s)**

## 与网页同步范围

| 项目       | 是否一致                         |
|------------|----------------------------------|
| 文章与评论 | 是（同一 API）                   |
| 登录 token | 需在 App 内单独登录（存储隔离）   |
| 外链       | 弹出确认后在系统浏览器中打开      |

## 包名与改版

- `applicationId`：`site.personal.blogreader`（可在 `app/build.gradle.kts` 修改）
- 修改站点地址后需**重新编译** APK（`BLOG_WEB_URL` 在编译期写入 `BuildConfig`）
