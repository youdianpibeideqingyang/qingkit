use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ListeningPort {
    pub port: u16,
    pub pid: u32,
    /// 进程名，如 node、python3
    pub command: String,
    /// 进程工作目录的文件夹名，通常就是项目名
    pub project: Option<String>,
    /// lan：监听所有网卡，手机能访问；loopback：只监听本机；specific：只监听某个 IP
    pub exposure: String,
    /// 原始监听地址，如 *、127.0.0.1、[::1]
    pub addresses: Vec<String>,
}

#[derive(Debug, PartialEq)]
pub struct RawListen {
    pub pid: u32,
    pub command: String,
    pub host: String,
    pub port: u16,
}

/// 解析 `lsof -F pcn` 的输出：p 开头是进程号，c 是进程名，n 是地址。
pub fn parse_lsof(text: &str) -> Vec<RawListen> {
    let mut out = Vec::new();
    let mut pid = 0u32;
    let mut command = String::new();
    for line in text.lines() {
        let (tag, rest) = line.split_at(line.char_indices().nth(1).map(|(i, _)| i).unwrap_or(line.len()));
        match tag {
            "p" => pid = rest.parse().unwrap_or(0),
            "c" => command = rest.to_string(),
            "n" => {
                // 形如 *:8080、127.0.0.1:5173、[::1]:5173、[::]:3000
                if let Some(idx) = rest.rfind(':') {
                    let host = &rest[..idx];
                    if let Ok(port) = rest[idx + 1..].parse::<u16>() {
                        out.push(RawListen { pid, command: command.clone(), host: host.to_string(), port });
                    }
                }
            }
            _ => {}
        }
    }
    out
}

pub fn host_exposure(host: &str) -> &'static str {
    match host {
        "*" | "0.0.0.0" | "[::]" | "::" => "lan",
        h if h.starts_with("127.") || h == "[::1]" || h == "::1" || h == "localhost" => "loopback",
        _ => "specific",
    }
}

/// 同一个端口可能同时监听 IPv4 和 IPv6，合并后取“最开放”的结果。
pub fn merge(raw: Vec<RawListen>) -> Vec<ListeningPort> {
    let mut by_port: BTreeMap<u16, ListeningPort> = BTreeMap::new();
    for r in raw {
        let exposure = host_exposure(&r.host);
        let entry = by_port.entry(r.port).or_insert_with(|| ListeningPort {
            port: r.port,
            pid: r.pid,
            command: r.command.replace("\\x20", " "),
            project: None,
            exposure: exposure.to_string(),
            addresses: vec![],
        });
        if !entry.addresses.contains(&r.host) {
            entry.addresses.push(r.host.clone());
        }
        let better = |a: &str| match a {
            "lan" => 0,
            "specific" => 1,
            _ => 2,
        };
        if better(exposure) < better(&entry.exposure) {
            entry.exposure = exposure.to_string();
        }
    }
    by_port.into_values().collect()
}

fn project_dirs(pids: &[u32]) -> BTreeMap<u32, String> {
    let mut map = BTreeMap::new();
    if pids.is_empty() {
        return map;
    }
    let list = pids.iter().map(|p| p.to_string()).collect::<Vec<_>>().join(",");
    let Ok(out) = Command::new("/usr/sbin/lsof").args(["-a", "-d", "cwd", "-p", &list, "-Fpn"]).output() else {
        return map;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut pid = 0u32;
    for line in text.lines() {
        if let Some(p) = line.strip_prefix('p') {
            pid = p.parse().unwrap_or(0);
        } else if let Some(path) = line.strip_prefix('n') {
            if path != "/" {
                if let Some(name) = Path::new(path).file_name() {
                    map.insert(pid, name.to_string_lossy().to_string());
                }
            }
        }
    }
    map
}

/// 列出本机正在监听的 TCP 端口（只含当前用户的进程，无需 sudo）。
#[tauri::command]
pub async fn list_listening_ports() -> Result<Vec<ListeningPort>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let out = Command::new("/usr/sbin/lsof")
            .args(["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"])
            .output()
            .map_err(|e| format!("无法运行 lsof：{e}"))?;
        let text = String::from_utf8_lossy(&out.stdout);
        let mut ports = merge(parse_lsof(&text));
        let pids: Vec<u32> = ports.iter().map(|p| p.pid).collect();
        let dirs = project_dirs(&pids);
        for p in ports.iter_mut() {
            p.project = dirs.get(&p.pid).cloned();
        }
        Ok(ports)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "p501\ncnode\nn*:8080\nn[::]:8080\np777\ncnode\nn127.0.0.1:5173\nn[::1]:5173\np900\ncFlClash\nn127.0.0.1:7890\np42\ncrapportd\nn*:49152\n";

    #[test]
    fn parses_and_merges() {
        let ports = merge(parse_lsof(SAMPLE));
        assert_eq!(ports.len(), 4);
        let p8080 = ports.iter().find(|p| p.port == 8080).unwrap();
        assert_eq!(p8080.exposure, "lan");
        assert_eq!(p8080.addresses, vec!["*", "[::]"]);
        let p5173 = ports.iter().find(|p| p.port == 5173).unwrap();
        assert_eq!(p5173.exposure, "loopback");
        assert_eq!(p5173.command, "node");
        assert_eq!(ports.iter().find(|p| p.port == 7890).unwrap().command, "FlClash");
    }

    #[test]
    fn exposure_rules() {
        assert_eq!(host_exposure("*"), "lan");
        assert_eq!(host_exposure("[::1]"), "loopback");
        assert_eq!(host_exposure("192.168.1.5"), "specific");
    }
}
