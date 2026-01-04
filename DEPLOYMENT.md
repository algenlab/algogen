# AlgoGen Project Page - 部署指南

## 完成状态

✅ **系统已完整实现**，包括：

1. **前端页面** (`index.html`)
   - Hero Section 与核心数据展示
   - Pipeline 可视化流程
   - Interactive Demo (Three.js 3D渲染)
   - Video Gallery (200个任务视频)

2. **JavaScript 逻辑**
   - `main.js`: Vue 3应用，管理状态和交互
   - `svl_three_renderer.js`: SVL 5.0 Three.js渲染引擎

3. **数据资产**
   - `assets/data.json`: 200个任务的元数据清单
   - `assets/traces/`: 6个交互式演示样本的trace文件
   - `assets/videos/`: 6个样本视频文件

4. **辅助脚本**
   - `scripts/generate_manifest.py`: 数据清单生成器
   - `start_server.sh`: 一键启动脚本

## 本地测试

### 快速启动

```bash
cd /data/lkp/paper/AIgoGen_final/project_page
./start_server.sh
```

或手动启动：

```bash
python3 -m http.server 8080
```

访问: http://localhost:8080

## 生产部署选项

### 选项 1: 静态网站托管（推荐）

适用于：GitHub Pages, Netlify, Vercel, Cloudflare Pages

**优点**: 
- 免费
- 自动HTTPS
- 全球CDN加速

**步骤**:
1. 将 `project_page/` 目录推送到Git仓库
2. 在托管平台连接仓库
3. 设置构建配置：
   - 构建命令: `python3 scripts/generate_manifest.py` (可选)
   - 发布目录: `./`

**注意事项**:
- Gallery中的视频需要相对路径或CDN链接
- 当前Gallery指向 `../../tracker_v2/...`，需要调整为相对路径或上传到CDN

### 选项 2: Nginx静态服务

适用于：自有服务器

**nginx.conf 示例**:

```nginx
server {
    listen 80;
    server_name algogen.example.com;
    
    root /var/www/algogen/project_page;
    index index.html;
    
    location / {
        try_files $uri $uri/ =404;
    }
    
    # 启用gzip压缩
    gzip on;
    gzip_types text/css application/javascript application/json;
    
    # 视频文件缓存
    location ~* \.(mp4|webm)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
    
    # JSON和JS文件缓存
    location ~* \.(json|js)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

### 选项 3: Docker容器化

**Dockerfile**:

```dockerfile
FROM nginx:alpine

# 复制项目文件
COPY project_page/ /usr/share/nginx/html/

# 可选：复制所有视频（注意大小）
# COPY tracker_v2/deepseek-ai_DeepSeek-V3.1-Terminus/videos_720p/ /usr/share/nginx/html/assets/videos/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

构建和运行:

```bash
docker build -t algogen-page .
docker run -p 8080:80 algogen-page
```

## 性能优化

### 1. 视频文件优化

**当前状态**: 6个样本视频已复制到 `assets/videos/`

**对于完整Gallery (200个视频)**:

```bash
# 选项A: 复制所有视频（需要大量存储空间）
cp tracker_v2/deepseek-ai_DeepSeek-V3.1-Terminus/videos_720p/*.mp4 project_page/assets/videos/

# 选项B: 使用软链接（仅限同服务器）
ln -s ../../tracker_v2/deepseek-ai_DeepSeek-V3.1-Terminus/videos_720p project_page/assets/videos_full

# 选项C: 上传到CDN并修改data.json中的路径
# 推荐：AWS S3, Cloudflare R2, 或阿里云OSS
```

### 2. JavaScript/CSS优化

生产环境建议：

```bash
# 安装工具
npm install -g terser csso-cli

# 压缩JS
terser js/main.js -c -m -o js/main.min.js
terser js/svl_three_renderer.js -c -m -o js/svl_three_renderer.min.js

# 压缩CSS（内联在HTML中，可提取后压缩）
```

### 3. CDN加速

修改 `index.html` 中的库引用为国内CDN:

```html
<!-- 替换为国内CDN -->
<script src="https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.12.2/dist/gsap.min.js"></script>
```

## 数据管理

### 重新生成数据清单

如果添加了新的trace或video：

```bash
cd /data/lkp/paper/AIgoGen_final/project_page
python3 scripts/generate_manifest.py
```

这将：
1. 扫描 `tracker_v2/` 目录
2. 更新 `assets/data.json`
3. 复制新的样本文件到 `assets/`

### Gallery视频路径调整

对于生产环境，修改 `main.js` 中的视频路径逻辑：

```javascript
// 当前（开发环境）
video_file: isSample(v) ? v.video_file : `../../tracker_v2/.../videos_720p/${v.video_file}`

// 生产环境（所有视频都在assets中）
video_file: `assets/videos/${v.video_file}`

// 或使用CDN
video_file: `https://cdn.example.com/algogen/videos/${v.video_file}`
```

## 故障排查

### 问题：Three.js渲染器白屏

**检查清单**:
1. 浏览器控制台是否有JavaScript错误
2. `assets/traces/` 中的trace文件是否存在
3. WebGL是否被浏览器禁用（输入 `chrome://gpu` 检查）

### 问题：视频无法加载

**解决方案**:
```bash
# 检查视频文件是否存在
ls -lh assets/videos/

# 检查MIME类型配置（Nginx）
# 确保 .mp4 被识别为 video/mp4
```

### 问题：CORS错误

如果使用外部CDN或API：

```nginx
# Nginx添加CORS头
add_header Access-Control-Allow-Origin *;
```

## 监控和分析

### Google Analytics集成

在 `index.html` 的 `</head>` 前添加：

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

### 性能监控

使用浏览器开发者工具的Performance标签：
1. 记录页面加载
2. 检查JavaScript执行时间
3. 优化长任务（>50ms）

## 下一步优化建议

1. **添加加载动画**: Three.js场景初始化时显示加载指示器
2. **响应式设计**: 针对移动设备优化布局
3. **视频预加载**: 实现视频缩略图懒加载
4. **SEO优化**: 添加meta标签和Open Graph数据
5. **错误边界**: 添加Vue错误处理和友好错误提示

## 技术支持

如有问题，请检查：
- README.md: 基础使用说明
- 浏览器控制台: JavaScript错误
- Network标签: 资源加载失败

## 版本信息

- Vue: 3.x (CDN)
- Three.js: r128
- TailwindCSS: 最新 (CDN)
- GSAP: 3.12.2

最后更新: 2025-11-20
