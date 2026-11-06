use std::process::Command;

/// 读取浏览器当前标签页的地址。浏览器没打开时返回空字符串，不会把它启动起来。
/// 第一次使用时 macOS 会询问是否允许 QingKit 控制该浏览器。
#[tauri::command]
pub async fn browser_current_url(browser: String) -> Result<String, String> {
    let (app, expr) = match browser.as_str() {
        "chrome" => ("Google Chrome", "URL of active tab of front window"),
        "edge" => ("Microsoft Edge", "URL of active tab of front window"),
        "arc" => ("Arc", "URL of active tab of front window"),
        "safari" => ("Safari", "URL of current tab of front window"),
        other => return Err(format!("不支持的浏览器：{other}")),
    };
    let script = format!(
        "if application \"{app}\" is running then\n\
           tell application \"{app}\"\n\
             if (count of windows) > 0 then return {expr}\n\
           end tell\n\
         end if\n\
         return \"\""
    );
    let out = tauri::async_runtime::spawn_blocking(move || {
        Command::new("/usr/bin/osascript").args(["-e", &script]).output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("无法运行 osascript：{e}"))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        if err.contains("-1743") || err.contains("Not authorized") {
            return Err(format!(
                "没有权限读取 {app}。请到 系统设置 › 隐私与安全性 › 自动化 中允许 QingKit 控制 {app}。"
            ));
        }
        return Err(format!("读取 {app} 失败：{}", err.trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}
