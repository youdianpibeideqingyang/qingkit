//! 大窗口 / 菜单栏面板之间切换时的窗口动画。
//!
//! macOS 上直接调用 AppKit 的 `setFrame:display:animate:`，和系统窗口缩放同一套平滑动画。
//! 坐标都用 AppKit 的“点”，原点在屏幕左下角。

/// x, y, 宽, 高（AppKit 点，原点在左下角）
pub type Frame = [f64; 4];

/// 在可用区域（去掉菜单栏和 Dock）里居中放一个 want 大小的窗口；屏幕太小时缩到可用区域的 92%。
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
pub fn centered_frame(visible: Frame, want: (f64, f64)) -> Frame {
    let w = want.0.min(visible[2] * 0.92).round();
    let h = want.1.min(visible[3] * 0.92).round();
    let x = (visible[0] + (visible[2] - w) / 2.0).round();
    let y = (visible[1] + (visible[3] - h) / 2.0).round();
    [x, y, w, h]
}

#[cfg(target_os = "macos")]
pub mod mac {
    use super::Frame;
    use objc2_app_kit::NSWindow;
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    /// ptr 是 tauri 的 `ns_window()` 返回值；只能在主线程调用。
    unsafe fn window<'a>(ptr: usize) -> &'a NSWindow {
        &*(ptr as *const NSWindow)
    }

    pub fn current_frame(ptr: usize) -> Frame {
        let f = unsafe { window(ptr) }.frame();
        [f.origin.x, f.origin.y, f.size.width, f.size.height]
    }

    /// 窗口所在屏幕去掉菜单栏和 Dock 之后的区域
    pub fn visible_frame(ptr: usize) -> Option<Frame> {
        let screen = unsafe { window(ptr) }.screen()?;
        let f = screen.visibleFrame();
        Some([f.origin.x, f.origin.y, f.size.width, f.size.height])
    }

    /// 平滑缩放到目标位置，动画结束后才返回（约 0.2 秒，由系统决定）
    pub fn animate_to(ptr: usize, f: Frame) {
        let rect = NSRect::new(NSPoint::new(f[0], f[1]), NSSize::new(f[2], f[3]));
        unsafe { window(ptr) }.setFrame_display_animate(rect, true, true);
    }
}

#[cfg(test)]
mod tests {
    use super::centered_frame;

    #[test]
    fn centers_and_clamps() {
        // 1440x900 的屏幕，菜单栏 25，Dock 在底部 70
        let visible = [0.0, 70.0, 1440.0, 805.0];
        let f = centered_frame(visible, (1200.0, 820.0));
        assert_eq!(f[2], 1200.0);
        assert_eq!(f[3], (805.0_f64 * 0.92).round());
        assert_eq!(f[0], 120.0);
        assert_eq!(f[1], (70.0 + (805.0 - f[3]) / 2.0).round());
    }

    #[test]
    fn big_screen_keeps_size() {
        let f = centered_frame([-1920.0, 0.0, 1920.0, 1055.0], (1200.0, 820.0));
        assert_eq!(f, [-1560.0, 118.0, 1200.0, 820.0]);
    }
}
