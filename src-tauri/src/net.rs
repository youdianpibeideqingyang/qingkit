use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream};
use std::process::Command;
use std::time::Duration;

use serde::Serialize;

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct NetInterface {
    /// 系统网卡名，如 en0、utun4
    pub name: String,
    /// IPv4 地址
    pub ip: String,
    /// wifi / ethernet / vpn / virtual / other
    pub kind: String,
    /// 给人看的名字，如 “Wi‑Fi”、“有线”
    pub label: String,
    /// 是否推荐给手机使用
    pub recommended: bool,
    /// 额外提示，如 “VPN 通道，手机通常连不上”
    pub note: Option<String>,
}

/// macOS：用 networksetup 拿到 “硬件端口名 → 设备名” 的对应，如 Wi‑Fi → en0。
fn hardware_ports() -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(out) = Command::new("/usr/sbin/networksetup")
        .arg("-listallhardwareports")
        .output()
    else {
        return map;
    };
    let text = String::from_utf8_lossy(&out.stdout);
    let mut port: Option<String> = None;
    for line in text.lines() {
        if let Some(p) = line.strip_prefix("Hardware Port: ") {
            port = Some(p.trim().to_string());
        } else if let Some(d) = line.strip_prefix("Device: ") {
            if let Some(p) = port.take() {
                map.insert(d.trim().to_string(), p);
            }
        }
    }
    map
}

pub fn classify(name: &str, ip: &Ipv4Addr, hw_port: Option<&str>) -> (String, String, Option<String>) {
    let hw = hw_port.unwrap_or("");
    let hw_lower = hw.to_lowercase();
    if hw_lower.contains("wi-fi") || hw_lower.contains("airport") {
        return ("wifi".into(), "Wi‑Fi".into(), None);
    }
    if name.starts_with("utun") || name.starts_with("ppp") || name.starts_with("ipsec") || name.starts_with("tun") {
        // 198.18.0.0/15 是 Clash 等代理 TUN 模式常用的假 IP 段
        let note = if ip.octets()[0] == 198 && (ip.octets()[1] == 18 || ip.octets()[1] == 19) {
            "代理 TUN 网卡，手机连不上"
        } else {
            "VPN 通道，手机通常连不上"
        };
        return ("vpn".into(), "VPN / 隧道".into(), Some(note.into()));
    }
    if name.starts_with("bridge") || name.starts_with("vmnet") || name.starts_with("vboxnet") || name.starts_with("docker") || name.starts_with("veth") {
        return ("virtual".into(), "虚拟网卡".into(), Some("虚拟机或容器网段".into()));
    }
    if hw_lower.contains("ethernet") || hw_lower.contains("lan") || hw_lower.contains("thunderbolt") || hw_lower.contains("usb") {
        return ("ethernet".into(), if hw.is_empty() { "有线".into() } else { format!("有线 · {hw}") }, None);
    }
    if !hw.is_empty() {
        return ("other".into(), hw.to_string(), None);
    }
    if name.starts_with("en") || name.starts_with("eth") {
        return ("ethernet".into(), "有线".into(), None);
    }
    ("other".into(), "其他".into(), None)
}

fn rank(kind: &str) -> u8 {
    match kind {
        "wifi" => 0,
        "ethernet" => 1,
        "other" => 2,
        "virtual" => 3,
        _ => 4,
    }
}

/// 列出所有可用的 IPv4 网卡，推荐的排在最前面。
#[tauri::command]
pub fn list_interfaces() -> Result<Vec<NetInterface>, String> {
    let hw = hardware_ports();
    let addrs = if_addrs::get_if_addrs().map_err(|e| format!("读取网卡失败：{e}"))?;
    let mut list: Vec<NetInterface> = addrs
        .into_iter()
        .filter_map(|iface| {
            let IpAddr::V4(ip) = iface.ip() else { return None };
            if ip.is_loopback() || ip.is_link_local() || ip.is_unspecified() {
                return None;
            }
            let (kind, label, note) = classify(&iface.name, &ip, hw.get(&iface.name).map(String::as_str));
            Some(NetInterface {
                name: iface.name.clone(),
                ip: ip.to_string(),
                kind,
                label,
                recommended: false,
                note,
            })
        })
        .collect();
    list.sort_by(|a, b| rank(&a.kind).cmp(&rank(&b.kind)).then(a.name.cmp(&b.name)));
    list.dedup_by(|a, b| a.name == b.name && a.ip == b.ip);
    if let Some(first) = list.iter_mut().find(|i| i.kind == "wifi" || i.kind == "ethernet") {
        first.recommended = true;
    } else if let Some(first) = list.first_mut() {
        first.recommended = true;
    }
    Ok(list)
}

/// 从本机用局域网 IP 连一下端口：只监听 127.0.0.1 的服务会连不上，手机同样打不开。
#[tauri::command]
pub async fn probe_port(ip: String, port: u16) -> Result<bool, String> {
    let addr: IpAddr = ip.parse().map_err(|_| format!("IP 地址不合法：{ip}"))?;
    let sock = SocketAddr::new(addr, port);
    let ok = tauri::async_runtime::spawn_blocking(move || {
        TcpStream::connect_timeout(&sock, Duration::from_millis(600)).is_ok()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(ok)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_common_interfaces() {
        let lan: Ipv4Addr = "192.168.31.24".parse().unwrap();
        assert_eq!(classify("en0", &lan, Some("Wi-Fi")).0, "wifi");
        assert_eq!(classify("en7", &lan, Some("USB 10/100/1000 LAN")).0, "ethernet");
        assert_eq!(classify("bridge100", &lan, None).0, "virtual");
        let vpn: Ipv4Addr = "172.16.2.9".parse().unwrap();
        assert_eq!(classify("utun4", &vpn, None).0, "vpn");
        let fake: Ipv4Addr = "198.18.0.1".parse().unwrap();
        assert_eq!(classify("utun9", &fake, None).2.as_deref(), Some("代理 TUN 网卡，手机连不上"));
    }
}
