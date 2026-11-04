#!/usr/bin/env node
// 修补 `pnpm tauri android init` 生成的 Android 工程：manifest 权限与竖屏方向、
// MainActivity 的局域网运行时授权。`gen/` 不入库，每次初始化都需重新执行本脚本。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const androidRoot = resolve(repoRoot, "app/src-tauri/gen/android/app/src/main");
const manifestPath = resolve(androidRoot, "AndroidManifest.xml");
const mainActivityPath = resolve(
  androidRoot,
  "java/dev/sidekick/app/MainActivity.kt",
);

if (!existsSync(manifestPath)) {
  console.log("AndroidManifest 不存在，跳过；先运行 pnpm tauri android init。");
  process.exit(0);
}

const permissions = [
  "android.permission.RECORD_AUDIO",
  "android.permission.MODIFY_AUDIO_SETTINGS",
  // Android 16（API 36）起访问局域网设备要这个 dangerous 运行时权限；
  // targetSdk >= 36 默认拒绝，缺它时 UDP 发现与 WebSocket 直连都会被系统拦掉。
  "android.permission.ACCESS_LOCAL_NETWORK",
  // 扫码连接要用后置相机；系统相机授权由 wry 在 getUserMedia 时自动弹出（见 lib.rs 的 on_permission_request）。
  "android.permission.CAMERA",
];

let text = readFileSync(manifestPath, "utf8");
let changed = false;

for (const permission of permissions) {
  const line = `<uses-permission android:name="${permission}" />`;
  if (text.includes(line)) continue;

  text = text.replace(/(<manifest[^>]*>\s*\n)/, `$1    ${line}\n`);
  changed = true;
}

// 手机端只做竖屏布局：锁定 Activity 方向，避免旋转后进入没有专门设计的横屏舞台。
const orientation = 'android:screenOrientation="portrait"';
if (!text.includes(orientation)) {
  text = text.replace(
    /(\n\s*)android:configChanges="orientation/,
    `$1${orientation}$1android:configChanges="orientation`,
  );
  changed = true;
}

if (changed) {
  writeFileSync(manifestPath, text);
  console.log("已写入 Android 权限 / 竖屏方向。");
} else {
  console.log("Android 权限与竖屏方向已存在。");
}

const LOCAL_NETWORK_MARKER = "// sidekick:local-network";

/**
 * 声明权限只是一半：Android 16 起 `ACCESS_LOCAL_NETWORK` 属于 dangerous 权限，
 * 必须在运行时向用户请求。不请求时系统按「拒绝」处理，连接表现为 4 秒超时、
 * 自动发现恒为 0 台，而 shell 里的 curl 却能连通，极易误判成网络或防火墙问题。
 */
function patchMainActivity() {
  if (!existsSync(mainActivityPath)) {
    console.log("MainActivity.kt 不存在，跳过局域网授权补丁。");
    return;
  }

  let source = readFileSync(mainActivityPath, "utf8");
  if (source.includes(LOCAL_NETWORK_MARKER)) {
    console.log("MainActivity 局域网授权已存在。");
    return;
  }

  const importAnchor = "import android.os.Bundle";
  const onCreateAnchor = "    super.onCreate(savedInstanceState)";
  const classAnchor = "\n}";
  if (
    !source.includes(importAnchor) ||
    !source.includes(onCreateAnchor) ||
    !source.endsWith(`${classAnchor}\n`)
  ) {
    console.warn("MainActivity 结构与预期不符，跳过局域网授权补丁。");
    return;
  }

  source = source.replace(
    importAnchor,
    `import android.content.pm.PackageManager\nimport android.os.Build\n${importAnchor}`,
  );
  source = source.replace(
    onCreateAnchor,
    `${onCreateAnchor}\n    ${LOCAL_NETWORK_MARKER}\n    requestLocalNetworkAccess()`,
  );
  source = source.slice(0, -`${classAnchor}\n`.length);
  source += `
  ${LOCAL_NETWORK_MARKER}
  private fun requestLocalNetworkAccess() {
    if (Build.VERSION.SDK_INT < 36) return
    val granted =
      checkSelfPermission(LOCAL_NETWORK_PERMISSION) == PackageManager.PERMISSION_GRANTED
    if (granted) return
    requestPermissions(arrayOf(LOCAL_NETWORK_PERMISSION), LOCAL_NETWORK_REQUEST_CODE)
  }

  private companion object {
    private const val LOCAL_NETWORK_PERMISSION = "android.permission.ACCESS_LOCAL_NETWORK"
    private const val LOCAL_NETWORK_REQUEST_CODE = 4781
  }${classAnchor}
`;

  writeFileSync(mainActivityPath, source);
  console.log("已写入 MainActivity 局域网授权请求。");
}

patchMainActivity();
