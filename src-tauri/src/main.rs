// release 构建时不弹出终端窗口（Windows 上才有意义，macOS 无影响）
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    qingkit_lib::run()
}
