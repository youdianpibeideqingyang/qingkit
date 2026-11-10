mod animate;
mod browser;
mod net;
mod ports;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Position as WinPosition, Size, WebviewWindow, WindowEvent};
use tauri_plugin_positioner::{Position, WindowExt};

/// 面板状态：是否固定（固定后失焦不收起），以及上一次因失焦被收起的时间。
struct PanelState {
    pinned: AtomicBool,
    /// 大窗口模式：可拖动、可缩放，失焦不收起
    expanded: AtomicBool,
    last_blur_hide: Mutex<Option<Instant>>,
    /// 面板最近一次在菜单栏图标下方弹出的位置，收回大窗口时回到这里
    panel_pos: Mutex<Option<PhysicalPosition<i32>>>,
    /// 同上，macOS 动画用的 AppKit 坐标
    #[cfg_attr(not(target_os = "macos"), allow(dead_code))]
    panel_frame: Mutex<Option<animate::Frame>>,
}

#[tauri::command]
fn set_pinned(state: tauri::State<PanelState>, pinned: bool) {
    state.pinned.store(pinned, Ordering::Relaxed);
}

const PANEL_SIZE: (f64, f64) = (440.0, 760.0);
const EXPANDED_SIZE: (f64, f64) = (1200.0, 820.0);

/// 在可用区域（去掉菜单栏和 Dock）内居中放一个窗口；屏幕太小时缩到可用区域的 92%。
/// 全部用物理像素计算。
pub fn centered_rect(area_pos: (i32, i32), area_size: (u32, u32), want: (u32, u32)) -> ((i32, i32), (u32, u32)) {
    let max_w = (area_size.0 as f64 * 0.92) as u32;
    let max_h = (area_size.1 as f64 * 0.92) as u32;
    let w = want.0.min(max_w);
    let h = want.1.min(max_h);
    let x = area_pos.0 + ((area_size.0 - w) / 2) as i32;
    let y = area_pos.1 + ((area_size.1 - h) / 2) as i32;
    ((x, y), (w, h))
}

fn remember_panel_pos(window: &WebviewWindow) {
    if let Ok(pos) = window.outer_position() {
        if let Ok(mut p) = window.state::<PanelState>().panel_pos.lock() {
            *p = Some(pos);
        }
    }
}

fn place_at_tray(window: &WebviewWindow) {
    if window.move_window(Position::TrayCenter).is_ok() {
        remember_panel_pos(window);
    }
}

/// macOS：在主线程上做缩放动画，等动画结束再返回。返回 false 表示没做成，走普通方式。
#[cfg(target_os = "macos")]
async fn animate_mac(window: &WebviewWindow, expand: bool) -> bool {
    let Ok(ptr) = window.ns_window() else { return false };
    let ptr = ptr as usize;
    let app = window.app_handle().clone();
    let (tx, rx) = std::sync::mpsc::channel::<bool>();
    let posted = window.run_on_main_thread(move || {
        let state = app.state::<PanelState>();
        let ok = if expand {
            let current = animate::mac::current_frame(ptr);
            if let Ok(mut f) = state.panel_frame.lock() {
                *f = Some(current);
            }
            match animate::mac::visible_frame(ptr) {
                Some(visible) => {
                    animate::mac::animate_to(ptr, animate::centered_frame(visible, EXPANDED_SIZE));
                    true
                }
                None => false,
            }
        } else {
            match state.panel_frame.lock().ok().and_then(|f| *f) {
                Some(frame) => {
                    animate::mac::animate_to(ptr, frame);
                    true
                }
                None => false,
            }
        };
        let _ = tx.send(ok);
    });
    if posted.is_err() {
        return false;
    }
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(3)).unwrap_or(false))
        .await
        .unwrap_or(false)
}

/// 普通方式：直接改大小和位置（非 macOS，或动画失败时）
fn resize_plain(window: &WebviewWindow, expand: bool) -> Result<(), String> {
    let e = |r: tauri::Result<()>| r.map_err(|e| e.to_string());
    if expand {
        let monitor = window.current_monitor().ok().flatten().or_else(|| window.primary_monitor().ok().flatten());
        if let Some(m) = monitor {
            let scale = m.scale_factor();
            let area = m.work_area();
            let want = ((EXPANDED_SIZE.0 * scale) as u32, (EXPANDED_SIZE.1 * scale) as u32);
            let ((x, y), (w, h)) = centered_rect((area.position.x, area.position.y), (area.size.width, area.size.height), want);
            e(window.set_size(Size::Physical(PhysicalSize::new(w, h))))?;
            e(window.set_position(WinPosition::Physical(PhysicalPosition::new(x, y))))?;
        } else {
            e(window.set_size(Size::Logical(LogicalSize::new(EXPANDED_SIZE.0, EXPANDED_SIZE.1))))?;
            e(window.center())?;
        }
    } else {
        e(window.set_size(Size::Logical(LogicalSize::new(PANEL_SIZE.0, PANEL_SIZE.1))))?;
        let saved = window.state::<PanelState>().panel_pos.lock().ok().and_then(|p| *p);
        match saved {
            Some(pos) => e(window.set_position(WinPosition::Physical(pos)))?,
            None => place_at_tray(window),
        }
    }
    Ok(())
}

/// 切换大窗口 / 菜单栏面板。带动画，动画结束后才返回，前端据此切换布局。
#[tauri::command]
async fn set_expanded(window: WebviewWindow, expanded: bool) -> Result<(), String> {
    let was_expanded = window.state::<PanelState>().expanded.swap(expanded, Ordering::Relaxed);
    if was_expanded == expanded {
        return Ok(());
    }
    let e = |r: tauri::Result<()>| r.map_err(|e| e.to_string());
    if expanded {
        remember_panel_pos(&window);
        e(window.set_always_on_top(false))?;
        e(window.set_resizable(true))?;
    } else {
        // 先去掉最小尺寸限制，否则缩小动画会被卡住
        e(window.set_min_size(None::<Size>))?;
    }

    #[cfg(target_os = "macos")]
    let animated = animate_mac(&window, expanded).await;
    #[cfg(not(target_os = "macos"))]
    let animated = false;
    if !animated {
        resize_plain(&window, expanded)?;
    }

    if expanded {
        e(window.set_min_size(Some(Size::Logical(LogicalSize::new(760.0, 560.0)))))?;
    } else {
        e(window.set_resizable(false))?;
        e(window.set_always_on_top(true))?;
    }
    let _ = window.set_focus();
    Ok(())
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
    let expanded = window.state::<PanelState>().expanded.load(Ordering::Relaxed);
    if !expanded {
        place_at_tray(window);
    }
    let _ = window.show();
    let _ = window.set_focus();
}

fn toggle_panel(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let expanded = app.state::<PanelState>().expanded.load(Ordering::Relaxed);
    if window.is_visible().unwrap_or(false) {
        // 大窗口被其他窗口挡住时，点图标是“找回来”，不是关掉
        if expanded && !window.is_focused().unwrap_or(false) {
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
        }
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
            expanded: AtomicBool::new(false),
            last_blur_hide: Mutex::new(None),
            panel_pos: Mutex::new(None),
            panel_frame: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            set_pinned,
            set_expanded,
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
                if !state.pinned.load(Ordering::Relaxed) && !state.expanded.load(Ordering::Relaxed) {
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

#[cfg(test)]
mod tests {
    use super::centered_rect;

    #[test]
    fn centers_in_work_area() {
        // 2880x1800 的 Retina 屏，去掉菜单栏后可用区域从 y=74 开始
        let ((x, y), (w, h)) = centered_rect((0, 74), (2880, 1726), (2400, 1640));
        assert_eq!((w, h), (2400, 1587)); // 高度被限制在可用区域的 92%
        assert_eq!(x, 240);
        assert_eq!(y, 74 + (1726 - 1587) / 2);
    }

    #[test]
    fn second_monitor_offset() {
        let ((x, y), _) = centered_rect((2880, 0), (1920, 1055), (1200, 820));
        assert_eq!((x, y), (2880 + 360, 117));
    }
}
