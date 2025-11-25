# AIgoGen Project Page 跨机器访问指南

## 问题诊断

你当前的情况：
- **服务器位置**: Linux 机器 (xmu@xmu47)
- **服务器 IP**: 10.24.116.47
- **服务器端口**: 8081
- **访问设备**: Windows 机器
- **浏览器**: Edge

**问题**: 在 Windows 上访问 `http://localhost:8081` 实际上是在访问 Windows 本机，而不是 Linux 服务器！

---

## ✅ 正确访问方法

### 方法 1：使用 Linux 机器的 IP 地址（推荐）

在 Windows 的 Edge 浏览器中访问：

```
http://10.24.116.47:8081
```

**注意**：不是 `localhost`，而是 Linux 机器的实际 IP！

---

## 🔧 如果无法访问

### 检查 1：确认服务器正在运行

在 Linux 终端执行：
```bash
cd /data/lkp/paper/AIgoGen_final/project_page
python3 -m http.server 8081
```

看到 `Serving HTTP on 0.0.0.0 port 8081...` 就对了。

### 检查 2：测试从 Windows 能否访问

在 Windows 的 **命令提示符** (CMD) 或 PowerShell 中：

```cmd
ping 10.24.116.47
```

如果能 ping 通，说明网络可达。

然后测试端口：
```cmd
telnet 10.24.116.47 8081
```

或者用浏览器直接访问：
```
http://10.24.116.47:8081
```

### 检查 3：Linux 防火墙设置

如果 Windows 无法访问，可能是 Linux 防火墙阻止了。

在 Linux 上执行：

```bash
# 检查防火墙状态
sudo ufw status

# 如果防火墙开启，临时允许 8081 端口
sudo ufw allow 8081/tcp

# 或者关闭防火墙（仅用于测试！）
sudo ufw disable
```

**或者使用 firewalld**：
```bash
# 检查状态
sudo firewall-cmd --state

# 允许端口
sudo firewall-cmd --add-port=8081/tcp --permanent
sudo firewall-cmd --reload
```

### 检查 4：确认绑定到所有网络接口

确保 Python HTTP 服务器绑定到 `0.0.0.0`（已经是了）：

```bash
python3 -m http.server 8081 --bind 0.0.0.0
```

---

## 🌐 访问 URL 对比

| 设备 | 错误 URL ❌ | 正确 URL ✅ |
|------|------------|------------|
| Windows 机器 | `http://localhost:8081` | `http://10.24.116.47:8081` |
| Linux 本机 | - | `http://localhost:8081` 或 `http://10.24.116.47:8081` |

---

## 🎯 快速测试步骤

1. **在 Linux 上**：确保服务器运行
   ```bash
   cd /data/lkp/paper/AIgoGen_final/project_page
   python3 -m http.server 8081
   ```

2. **在 Windows Edge 中**：访问
   ```
   http://10.24.116.47:8081
   ```

3. **观察 Linux 终端**：应该能看到类似这样的请求日志
   ```
   10.24.xxx.xxx - - [20/Nov/2025 12:35:00] "GET / HTTP/1.1" 200 -
   10.24.xxx.xxx - - [20/Nov/2025 12:35:01] "GET /assets/videos/array_leetcode_1186_seed_02.mp4 HTTP/1.1" 200 -
   ```

4. **在 Edge 控制台**：应该看到
   ```
   ✓ Video loaded: assets/videos/array_leetcode_1186_seed_02.mp4
   ```

---

## 📱 移动设备访问

如果你想在手机/平板上访问，同样使用：
```
http://10.24.116.47:8081
```

前提是设备在同一局域网内。

---

## 🔒 安全提示

- 这个设置仅适合**局域网内测试**
- 不要在生产环境或公网使用 Python 简单 HTTP 服务器
- 如果需要外网访问，考虑使用 Nginx + SSL

---

## ❓ 常见问题

### Q: IP 地址会变吗？
A: 如果是 DHCP 分配的，可能会变。可以在路由器上设置静态 IP。

### Q: 能用域名吗？
A: 可以，如果你的网络有 DNS 服务器或者在 Windows 的 `C:\Windows\System32\drivers\etc\hosts` 文件中添加：
```
10.24.116.47    aigogen.local
```
然后访问 `http://aigogen.local:8081`

### Q: 视频还是不能播放？
A: 打开浏览器开发者工具 (F12)，切换到 Network 标签，刷新页面，查看：
- 视频请求的状态码是否为 200
- 如果是 404，检查文件路径
- 如果是 403，检查文件权限

---

**现在请在 Windows Edge 中访问**: `http://10.24.116.47:8081` 🚀
