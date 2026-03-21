# 在 Mac 上使用 Android Studio 编译博客 APK

本文说明如何把服务器上的 `android` 工程拿到本机，用 **Android Studio** 或命令行打出 **debug / release** 安装包。

## 一、你需要具备

- macOS（Apple Silicon / Intel 均可）
- 已安装 [Android Studio](https://developer.android.com/studio)（内含 Android SDK）
- JDK 17（Android Studio 通常已自带，可在 **Settings → Build → Gradle → Gradle JDK** 中确认）

## 二、把工程放到 Mac 上

任选一种方式：

### 方式 A：下载服务器打好的压缩包

在 Mac 终端执行（把 `你的服务器` 换成实际 IP 或域名）：

```bash
scp ubuntu@你的服务器:~/personal-site/blog-android-local-mac.tar.gz ~/Downloads/
cd ~/Downloads
tar -xzf blog-android-local-mac.tar.gz
```

解压后得到文件夹 **`android`**。

### 方式 B：从 Git 克隆整仓（若已 push）

```bash
git clone https://github.com/你的用户名/personal-site.git
cd personal-site/android
```

## 三、配置 `local.properties`（必做）

在 **`android`** 目录下：

1. 复制示例文件：

   ```bash
   cd android   # 若已在 android 目录可省略
   cp local.properties.example local.properties
   ```

2. 用文本编辑器打开 **`local.properties`**，填写两行：

   - **`sdk.dir`**：本机 Android SDK 路径。在 Android Studio 里打开 **Settings → Languages & Frameworks → Android SDK**，顶部 **Android SDK Location** 即为路径。常见示例：
     - Apple Silicon：`/Users/你的用户名/Library/Android/sdk`
     - 若自定义过安装位置，以 Studio 显示为准。

   - **`blog.web.url`**：你的博客 **HTTPS 根地址**（与浏览器打开博客时一致，不要带 `#/`）。例如：  
     `https://blog.example.com`

   示例：

   ```properties
   sdk.dir=/Users/wzw/Library/Android/sdk
   blog.web.url=https://你的域名
   ```

   > `local.properties` 仅本机使用，不要提交到 Git（仓库已写在 `.gitignore`）。

## 四、用 Android Studio 编译（推荐）

1. 打开 Android Studio → **Open**，选中解压/克隆得到的 **`android`** 文件夹（内含 `app`、`build.gradle.kts`、`settings.gradle.kts` 的那一层）。
2. 等待底部 **Gradle Sync** 完成（首次会下载依赖，国内已配置阿里云/清华镜像，一般较快）。
3. 菜单 **Build → Build Bundle(s) / APK(s) → Build APK(s)**。
4. 构建成功后，点击通知里的 **locate**，或到目录：

   ```
   android/app/build/outputs/apk/debug/app-debug.apk
   ```

   debug 包可直接拷到手机安装（需在手机上允许「未知来源」或使用调试安装）。

## 五、用命令行编译（可选）

在 Mac **终端**中：

```bash
cd /path/to/android
chmod +x ./gradlew
./gradlew :app:assembleDebug
```

成功后 APK 仍在：

`app/build/outputs/apk/debug/app-debug.apk`

## 六、正式签名 release（可选）

debug 包仅适合自测。若要发给别人或上架，需要 **release 签名**，步骤见本目录 **`README.md`** 中「正式包」一节（`keystore` + `assembleRelease`）。

## 七、常见问题

| 现象 | 处理 |
|------|------|
| Gradle Sync 失败 / 下载慢 | 工程已优先使用国内镜像；仍失败可检查代理/VPN 或手机热点 |
| `sdk.dir` 报错 | 路径必须存在且为 SDK 根目录（内含 `platforms`、`build-tools`） |
| App 打开是 example.com | 修改 `local.properties` 里 `blog.web.url` 后 **重新编译**（地址写进 `BuildConfig`） |
| 与网页登录不同步 | WebView 使用独立 `localStorage`，需在 App 内再登录一次 |

## 八、修改博客地址后

每次改 **`blog.web.url`** 后需要 **重新 Build APK**，否则 App 仍指向旧域名。
