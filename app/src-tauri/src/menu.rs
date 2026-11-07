//! macOS 应用菜单中文化（D113）。
//!
//! Tauri 在没有自定义菜单时会挂一份英文默认菜单（File / Edit / View / Window / Help）。
//! 这里按同一结构重建一份中文菜单：小跟班（关于/服务/隐藏/退出）、文件（关闭窗口）、
//! 编辑（撤销/重做/剪切/复制/粘贴/全选）、显示（切换全屏）、窗口（最小化/缩放/前置全部窗口）。
//!
//! 说明：
//! - 菜单只在主窗口显示时可见（激活策略见 `activation.rs`：窗口显示切 Regular）；
//! - 第一项（应用菜单）的标题由系统按应用名显示，打包后是 `Sidekick`，调试裸二进制是 `desktop`；
//! - 编辑菜单保留标准快捷键（⌘Z / ⌘X / ⌘C / ⌘V / ⌘A），WebView 里的输入框依赖它；
//! - 托盘右键菜单（显示主窗口 / 退出 Sidekick）在 `tray.rs`，与这里互不影响。

use tauri::{
    AppHandle, Runtime,
    menu::{AboutMetadata, Menu, PredefinedMenuItem, Submenu},
};

/// 用中文菜单替换 Tauri 的默认 macOS 菜单。
pub fn install<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let pkg = app.package_info();
    let about = AboutMetadata {
        name: Some("小跟班".into()),
        version: Some(pkg.version.to_string()),
        ..Default::default()
    };

    let app_menu = Submenu::with_items(
        app,
        "小跟班",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("关于小跟班"), Some(about))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::services(app, Some("服务"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::hide(app, Some("隐藏小跟班"))?,
            &PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?,
            &PredefinedMenuItem::show_all(app, Some("全部显示"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::quit(app, Some("退出小跟班"))?,
        ],
    )?;

    let file_menu = Submenu::with_items(
        app,
        "文件",
        true,
        &[&PredefinedMenuItem::close_window(app, Some("关闭窗口"))?],
    )?;

    let edit_menu = Submenu::with_items(
        app,
        "编辑",
        true,
        &[
            &PredefinedMenuItem::undo(app, Some("撤销"))?,
            &PredefinedMenuItem::redo(app, Some("重做"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::cut(app, Some("剪切"))?,
            &PredefinedMenuItem::copy(app, Some("复制"))?,
            &PredefinedMenuItem::paste(app, Some("粘贴"))?,
            &PredefinedMenuItem::select_all(app, Some("全选"))?,
        ],
    )?;

    let view_menu = Submenu::with_items(
        app,
        "显示",
        true,
        &[&PredefinedMenuItem::fullscreen(app, Some("切换全屏"))?],
    )?;

    let window_menu = Submenu::with_items(
        app,
        "窗口",
        true,
        &[
            &PredefinedMenuItem::minimize(app, Some("最小化"))?,
            &PredefinedMenuItem::maximize(app, Some("缩放"))?,
            &PredefinedMenuItem::separator(app)?,
            &PredefinedMenuItem::bring_all_to_front(app, Some("前置全部窗口"))?,
        ],
    )?;

    let menu = Menu::with_items(
        app,
        &[&app_menu, &file_menu, &edit_menu, &view_menu, &window_menu],
    )?;
    app.set_menu(menu)?;
    eprintln!("[menu] 已安装中文菜单（小跟班 / 文件 / 编辑 / 显示 / 窗口）");
    Ok(())
}
