# AlgoGen Project Page

这是AlgoGen论文的交互式项目展示页面，展示了基于LLM的算法可视化生成系统。

## 功能特性

- **Hero Section**: 首屏展示核心数据（99.5%成功率、200+任务）
- **Pipeline Visualization**: 展示从任务到可视化的完整流程
- **Interactive Demo**: 基于Three.js的3D交互式算法可视化演示
- **Video Gallery**: 200个LeetCode任务的可视化视频展示

## 技术栈

- **前端框架**: Vue 3 (CDN)
- **样式**: TailwindCSS (CDN)
- **3D渲染**: Three.js + 自定义SVL渲染器
- **动画**: GSAP + ScrollTrigger

## 文件结构

```
project_page/
├── index.html              # 主页面
├── js/
│   ├── main.js            # Vue应用逻辑
│   └── svl_three_renderer.js  # Three.js SVL渲染器
├── assets/
│   ├── data.json          # 任务清单和元数据
│   ├── traces/            # SVL trace JSON文件（样本）
│   └── videos/            # 生成的视频文件（样本）
└── scripts/
    └── generate_manifest.py  # 生成data.json的脚本

```

## 快速开始

### 方法1: 使用Python HTTP服务器（推荐）

```bash
cd /data/lkp/paper/AIgoGen_final/project_page
python3 -m http.server 8080
```

然后在浏览器中访问: `http://localhost:8080`

### 方法2: 使用Node.js HTTP服务器

```bash
cd /data/lkp/paper/AIgoGen_final/project_page
npx http-server -p 8080
```

### 方法3: 使用PHP内置服务器

```bash
cd /data/lkp/paper/AIgoGen_final/project_page
php -S localhost:8080
```

## 数据生成

如果需要重新生成`data.json`和复制trace/video文件：

```bash
python3 scripts/generate_manifest.py
```

这将：
1. 扫描 `tracker_v2/deepseek-ai_DeepSeek-V3.1-Terminus/` 目录
2. 为每个算法类别（array, dp, graph, tree, sorting, hashtable）选择1个样本
3. 复制对应的trace.json和video文件到assets目录
4. 生成包含所有200个任务元数据的data.json

## 交互式Demo使用

1. 在页面上选择算法示例（下拉菜单）
2. 点击播放按钮查看动画
3. 使用鼠标拖动旋转、滚轮缩放3D场景
4. 调整播放速度（0.5x - 3.0x）

## Video Gallery

- 支持按算法类型筛选（Array, DP, Graph, Tree, Sorting, Hashtable）
- 鼠标悬停自动预览视频
- 点击"Load More"加载更多视频

## 浏览器兼容性

- Chrome/Edge: ✅ 完全支持
- Firefox: ✅ 完全支持
- Safari: ✅ 支持（部分CSS动画可能略有差异）

## 性能优化建议

对于生产部署：
1. 压缩JS/CSS文件
2. 使用CDN加速Three.js和Vue库
3. 对视频文件启用懒加载
4. 考虑使用视频流服务（如HLS）处理大量视频

## 故障排除

### 问题：Three.js渲染器无法初始化
**解决方案**: 确保浏览器支持WebGL，检查控制台是否有错误

### 问题：Trace加载失败
**解决方案**: 
- 检查`assets/data.json`是否存在
- 确认trace文件路径正确
- 查看浏览器开发者工具的Network标签

### 问题：视频无法播放
**解决方案**: 
- 确保视频文件已复制到`assets/videos/`
- 检查视频文件格式是否为浏览器支持的格式（mp4）
- 对于Gallery中的大量视频，确保相对路径正确

## 开发备注

- `svl_three_renderer.js`已从原始版本修改，移除了自动初始化和内部DOM事件监听
- Vue组件在`main.js`中管理渲染器的生命周期
- 所有CDN依赖都使用了固定版本以确保稳定性

## License

与AlgoGen论文项目相同的License。
