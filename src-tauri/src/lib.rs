mod browser;
mod net;
mod ports;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};
use tauri_plugin_positioner::{Position, WindowExt};

/// 面板状态：是否固定（固定后失焦不收起），以及上一次因失焦被收起的时间。
struct PanelState {
    pinned: AtomicBool,
    last_blur_hide: Mutex<Option<Instant>>,
}

#[tauri::command]
fn set_pinned(state: tauri::State<PanelState>, pinned: bool) {
    state.pinned.store(pinned, Ordering::Relaxed);
}

#[tauri::command]
fn hide_panel(window: WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_panel(window: &WebviewWindow) {
    let _ = window.move_window(Position::TrayCenter);
    let _ = window.show();
    let _ = window.set_focus();
}

fn toggle_panel(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    // 面板打开时点菜单栏图标：系统会先触发失焦（面板收起），再触发点击。
    // 刚因失焦收起的话，这次点击的本意是“关闭”，不要再弹出来。
    let state = app.state::<PanelState>();
    let recently_hidden = state
        .last_blur_hide
        .lock()
        .ok()
        .and_then(|t| *t)
        .map(|t| t.elapsed() < Duration::from_millis(300))
        .unwrap_or(false);
    if !recently_hidden {
        show_panel(&window);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .manage(PanelState {
            pinned: AtomicBool::new(false),
            last_blur_hide: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            set_pinned,
            hide_panel,
            quit_app,
            net::list_interfaces,
            net::probe_port,
            ports::list_listening_ports,
            browser::browser_current_url,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let open_item = MenuItem::with_id(app, "open", "打开面板", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出 QingKit", true, Some("CmdOrCtrl+Q"))?;
            let separator = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&open_item, &separator, &quit_item])?;

            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;

            TrayIconBuilder::with_id("main")
                .icon(icon)
                .icon_as_template(true)
                .tooltip("QingKit")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => {
                        if let Some(window) = app.get_webview_window("main") {
                            show_panel(&window);
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::Focused(false) = event {
                let state = window.state::<PanelState>();
                if !state.pinned.load(Ordering::Relaxed) {
                    if let Ok(mut t) = state.last_blur_hide.lock() {
                        *t = Some(Instant::now());
                    }
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("QingKit 启动失败");
}
