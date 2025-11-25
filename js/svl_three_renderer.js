/**
 * SVL 5.0 Three.js Renderer - 完整版
 * 支持所有SVL规范的数据结构和操作
 * 
 * 支持的数据结构：
 * - Array（数组）
 * - Graph（图）
 * - Tree（树）
 * - Table（表格/DP）
 * - Hashtable（哈希表）
 * 
 * 支持的操作：
 * - Array: updateStyle, updateValues, moveElements, updateBoundary, removeBoundary
 * - Graph: updateNodeStyle, updateNodeProperties, updateEdgeStyle, addNode, removeNode, addEdge, removeEdge
 * - Table: updateTableCell, highlightTableCell, showDependency
 * - Tree: addChild, removeChild, reparent, swapNodes, highlightPath
 * - Hashtable: insertIntoBucket, updateInBucket, removeFromBucket, showHash, highlightCollision, highlightBucket
 * - List: appendToList, popFromList, clearList
 * - Comment: showComment
 */

class SVLThreeRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId) || document.getElementById('canvas-container');
        this.trace = null;
        this.currentFrame = 0;
        this.isPlaying = false;
        this.speed = 1.0;
        this.animationId = null;
        
        // 存储当前状态
        this.currentState = null;
        this.currentAuxViews = [];
        
        // 对象缓存（按类型分类）
        this.arrayObjects = [];      // 数组元素
        this.graphNodes = {};         // 图节点 {nodeId: mesh}
        this.graphEdges = [];         // 图边
        this.treeNodes = {};          // 树节点 {nodeId: mesh}
        this.treeEdges = [];          // 树边
        this.tableCells = {};        // 表格单元格 {view_id: {(r,c): mesh}}
        this.tableCellTexts = {};    // 表格单元格文本 {view_id: {(r,c): sprite}}
        this.hashtableBuckets = [];   // 哈希表桶
        this.overlayObjects = [];
        this.tempObjects = [];        // 临时对象（箭头、高亮等）
        
        // 声音系统
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.soundEnabled = true;
        
        // 伪代码高亮
        this.previousCodeLine = null;
        
        this.initScene();
        this.initControls();
        this.animate();
    }
    
    initScene() {
        // 创建场景
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a2e);
        
        // 创建相机
        this.camera = new THREE.PerspectiveCamera(
            75,
            this.container.clientWidth / this.container.clientHeight,
            0.1,
            1000
        );
        this.camera.position.set(0, 8, 15);
        this.camera.lookAt(0, 0, 0);
        
        // 创建渲染器
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.container.appendChild(this.renderer.domElement);
        
        // 添加环境光
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        // 添加方向光（用于阴影）
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(5, 10, 7);
        directionalLight.castShadow = true;
        this.scene.add(directionalLight);
        
        // 添加点光源
        const pointLight = new THREE.PointLight(0x4CAF50, 0.5);
        pointLight.position.set(0, 5, 5);
        this.scene.add(pointLight);
        
        // 添加地面
        const groundGeometry = new THREE.PlaneGeometry(50, 50);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0x16213e,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.5;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // OrbitControls
        this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.maxPolarAngle = Math.PI / 2;
        
        // 窗口大小调整
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    // ============================================================
    // 音效系统
    // ============================================================
    
    playSound(type) {
        if (!this.soundEnabled || !this.audioContext) return;
        
        const oscillator = this.audioContext.createOscillator();
        const gainNode = this.audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext.destination);
        
        const soundMap = {
            'compare': { freq: 440, gain: 0.1, duration: 0.1 },
            'comparing': { freq: 440, gain: 0.1, duration: 0.1 },
            'swap': { freq: 550, gain: 0.15, duration: 0.15 },
            'swapped': { freq: 550, gain: 0.15, duration: 0.15 },
            'sorted': { freq: 660, gain: 0.2, duration: 0.12 },
            'complete': { freq: 880, gain: 0.25, duration: 0.2 },
            'highlight': { freq: 500, gain: 0.1, duration: 0.1 },
            'add': { freq: 600, gain: 0.12, duration: 0.1 },
            'remove': { freq: 400, gain: 0.12, duration: 0.1 }
        };
        
        const sound = soundMap[type] || { freq: 440, gain: 0.1, duration: 0.1 };
        
        oscillator.frequency.value = sound.freq;
        gainNode.gain.value = sound.gain;
        oscillator.type = 'sine';
        
        oscillator.start(this.audioContext.currentTime);
        oscillator.stop(this.audioContext.currentTime + sound.duration);
        
        gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + sound.duration);
    }
    
    // ============================================================
    // 控制初始化
    // ============================================================
    
    initControls() {
        // Controls are handled externally by Vue
    }
    
    // ============================================================
    // Trace加载
    // ============================================================
    
    async loadTraceFile(file) {
        const loading = document.getElementById('loading');
        loading.style.display = 'block';
        
        try {
            const text = await file.text();
            const trace = JSON.parse(text);
            await this.loadTrace(trace);
            loading.style.display = 'none';
        } catch (error) {
            console.error('加载失败:', error);
            alert('加载trace.json失败: ' + error.message);
            loading.style.display = 'none';
        }
    }
    
    // Helper for safe DOM updates
    updateDomText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    async loadTrace(trace) {
        this.trace = trace;
        this.currentFrame = 0;
        
        this.clearOverlays();
        
        // 更新信息面板
        this.updateDomText('algo-name', trace.algorithm.name || 'Unknown');
        this.updateDomText('data-type', trace.initial_frame.data_state.type || 'Unknown');
        this.updateDomText('frame-info', `0 / ${trace.deltas.length}`);
        
        // 渲染伪代码（优先从initial_frame读取，否则从algorithm读取）
        const pseudocode = trace.initial_frame.pseudocode || trace.algorithm.pseudocode;
        this.renderPseudocode(pseudocode);
        
        // 初始化状态（深拷贝）
        this.currentState = JSON.parse(JSON.stringify(trace.initial_frame));
        this.currentAuxViews = JSON.parse(JSON.stringify(trace.initial_frame.auxiliary_views || []));
        
        // 渲染初始帧
        this.renderFrame();
        
        // 高亮初始代码行
        const initialCodeHighlight = this.currentState.code_highlight;
        if (initialCodeHighlight !== undefined && initialCodeHighlight !== null) {
            this.updatePseudocodeHighlight(initialCodeHighlight);
        }
    }
    
    renderPseudocode(pseudocode) {
        const container = document.getElementById('pseudocode-content');
        if (!container) return;
        
        // 如果没有伪代码，生成默认伪代码
        if (!pseudocode || pseudocode.length === 0) {
            const algoName = this.trace?.algorithm?.name || 'Algorithm';
            pseudocode = this.generateDefaultPseudocode(algoName);
        }
        
        container.innerHTML = '';
        pseudocode.forEach((line, index) => {
            const lineDiv = document.createElement('div');
            lineDiv.className = 'pseudocode-line';
            lineDiv.id = `pseudocode-line-${index}`;
            
            // 添加行号（1-based显示）
            const lineNumber = index + 1;
            const lineNumSpan = document.createElement('span');
            lineNumSpan.className = 'line-number';
            lineNumSpan.textContent = lineNumber.toString().padStart(2, ' ') + ' ';
            lineNumSpan.style.opacity = '0.5';
            lineNumSpan.style.userSelect = 'none';
            lineNumSpan.style.marginRight = '10px';
            
            const codeSpan = document.createElement('span');
            codeSpan.textContent = line;
            
            lineDiv.appendChild(lineNumSpan);
            lineDiv.appendChild(codeSpan);
            container.appendChild(lineDiv);
        });
    }
    
    generateDefaultPseudocode(algoName) {
        if (algoName.toLowerCase().includes('bubble')) {
            return [
                'function bubbleSort(arr):',
                '  n = length(arr)',
                '  for i = 0 to n-1:',
                '    for j = 0 to n-i-2:',
                '      if arr[j] > arr[j+1]:',
                '        swap(arr[j], arr[j+1])',
                '  return arr'
            ];
        } else if (algoName.toLowerCase().includes('quick')) {
            return [
                'function quickSort(arr, low, high):',
                '  if low < high:',
                '    pivot = partition(arr, low, high)',
                '    quickSort(arr, low, pivot-1)',
                '    quickSort(arr, pivot+1, high)',
                '  return arr'
            ];
        } else if (algoName.toLowerCase().includes('merge')) {
            return [
                'function mergeSort(arr):',
                '  if length(arr) <= 1:',
                '    return arr',
                '  mid = length(arr) / 2',
                '  left = mergeSort(arr[0:mid])',
                '  right = mergeSort(arr[mid:])',
                '  return merge(left, right)'
            ];
        } else if (algoName.toLowerCase().includes('dijkstra')) {
            return [
                'function dijkstra(graph, source):',
                '  dist = infinity for all nodes',
                '  dist[source] = 0',
                '  while unvisited nodes exist:',
                '    u = node with minimum dist',
                '    for each neighbor v of u:',
                '      alt = dist[u] + weight(u, v)',
                '      if alt < dist[v]:',
                '        dist[v] = alt',
                '  return dist'
            ];
        } else {
            return [
                `function ${algoName}:`,
                '  // Initialize data structures',
                '  // Process elements',
                '  // Update states',
                '  // Return result'
            ];
        }
    }
    
    updatePseudocodeHighlight(lineNumber) {
        // lineNumber是1-based（第1行、第2行...），需要转换为0-based索引
        // 如果lineNumber <= 0，不高亮任何行
        if (lineNumber <= 0) return;
        
        const lineIndex = lineNumber - 1; // 转换为0-based索引
        
        // 移除之前的高亮
        if (this.previousCodeLine !== null) {
            const prevLine = document.getElementById(`pseudocode-line-${this.previousCodeLine}`);
            if (prevLine) {
                prevLine.classList.remove('highlight');
                prevLine.classList.add('previous');
                setTimeout(() => prevLine.classList.remove('previous'), 300);
            }
        }
        
        // 添加新高亮
        const currentLine = document.getElementById(`pseudocode-line-${lineIndex}`);
        if (currentLine) {
            currentLine.classList.add('highlight');
            currentLine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            this.previousCodeLine = lineIndex;
        }
    }
    
    // ============================================================
    // 帧渲染（主函数）
    // ============================================================
    
    renderFrame() {
        // 清除旧对象
        this.clearScene();
        
        if (!this.currentState) return;
        
        const dataType = this.currentState.data_state.type;
        
        // 根据数据类型渲染
        switch (dataType) {
            case 'array':
                this.renderArray();
                break;
            case 'graph':
                this.renderGraph();
                break;
            case 'tree':
                this.renderTree();
                break;
            case 'table':
            case 'dp':
            case 'dp_table':
                this.renderTable();
                break;
            case 'hashtable':
                this.renderHashtable();
                break;
            default:
                console.warn('不支持的数据类型:', dataType);
        }
        
        // 更新代码高亮显示
        const codeHighlight = this.currentState.code_highlight;
        this.updateDomText('code-line', codeHighlight !== undefined ? codeHighlight : '-');
        
        // 更新伪代码行高亮
        if (codeHighlight !== undefined && codeHighlight !== null) {
            this.updatePseudocodeHighlight(codeHighlight);
        }
    }
    
    clearScene() {
        // 收集所有表格单元格和文本
        const allTableCells = [];
        const allTableTexts = [];
        
        Object.values(this.tableCells).forEach(viewCells => {
            allTableCells.push(...Object.values(viewCells));
        });
        
        Object.values(this.tableCellTexts).forEach(viewTexts => {
            allTableTexts.push(...Object.values(viewTexts));
        });
        
        // 清除所有对象（注意：graphNodes和treeNodes是对象，需要转换为数组）
        const allObjects = [
            ...this.arrayObjects,
            ...Object.values(this.graphNodes),
            ...this.graphEdges,
            ...Object.values(this.treeNodes),
            ...this.treeEdges,
            ...allTableCells,
            ...allTableTexts,
            ...this.hashtableBuckets,
            ...this.tempObjects
        ];
        
        allObjects.forEach(obj => {
            if (obj && obj.geometry) obj.geometry.dispose();
            if (obj && obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
            if (obj) this.scene.remove(obj);
        });
        
        // 清空缓存
        this.arrayObjects = [];
        this.graphNodes = {};
        this.graphEdges = [];
        this.treeNodes = {};
        this.treeEdges = [];
        this.tableCells = {};
        this.tableCellTexts = {};
        this.hashtableBuckets = [];
        this.tempObjects = [];
    }
    
    clearOverlays() {
        this.overlayObjects.forEach(obj => {
            if (obj && obj.geometry) obj.geometry.dispose();
            if (obj && obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
            if (obj) this.scene.remove(obj);
        });
        this.overlayObjects = [];
    }
    
    clearOverlayByCategory(category) {
        if (!category) return;
        this.overlayObjects = this.overlayObjects.filter(obj => {
            if (!obj || !obj.userData || obj.userData.overlayCategory !== category) {
                return true;
            }
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (obj.material.map) obj.material.map.dispose();
                obj.material.dispose();
            }
            this.scene.remove(obj);
            return false;
        });
    }
    
    // ============================================================
    // 数组渲染（Array）
    // ============================================================
    
    renderArray() {
        // SVL格式：数据在structure字段
        const arrayData = this.currentState.data_state.structure || this.currentState.data_state.data;
        if (!arrayData || !Array.isArray(arrayData)) return;
        
        // 清空mesh数组
        this.arrayObjects = [];
        
        // 计算最大值用于动态缩放
        const values = arrayData.map(elem => {
            const val = typeof elem === 'object' ? elem.value : elem;
            return Math.abs(parseFloat(val) || 1);
        });
        const maxValue = Math.max(...values, 1);
        
        // 动态缩放因子：最高柱子为6个单位
        const heightScale = 6.0 / maxValue;
        
        const spacing = 1.5;
        const offset = -(arrayData.length - 1) * spacing / 2;
        
        arrayData.forEach((elem, i) => {
            const value = typeof elem === 'object' ? elem.value : elem;
            // SVL使用styleKey字段
            const state = typeof elem === 'object' ? (elem.styleKey || elem.state) : 'idle';
            
            // 柱子高度（应用缩放因子，最小高度0.3）
            const rawHeight = Math.abs(parseFloat(value) || 1);
            const height = Math.max(rawHeight * heightScale, 0.3);
            
            // 几何体
            const geometry = new THREE.BoxGeometry(1, height, 1);
            
            // 材质（根据状态选择颜色）
            const color = this.getColorByState(state);
            const material = new THREE.MeshPhongMaterial({
                color: color,
                emissive: (state === 'comparing' || state === 'compare') ? 0xffaa00 : 0x000000,
                emissiveIntensity: (state === 'comparing' || state === 'compare') ? 0.5 : 0,
                shininess: 30
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(offset + i * spacing, height / 2, 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // 存储元数据
            mesh.userData = {
                index: i,
                value: value,
                state: state,
                height: height
            };
            
            this.scene.add(mesh);
            this.arrayObjects.push(mesh);
            
            // 添加数值标签（在柱子上方）- 更大且靠近柱子
            const valueSprite = this.createTextSprite(String(value), {
                fontSize: 64,
                color: '#ffffff',
                backgroundColor: null
            });
            valueSprite.position.set(offset + i * spacing, height + 0.4, 0);
            valueSprite.scale.set(1.6, 0.5, 1);
            this.scene.add(valueSprite);
            this.tempObjects.push(valueSprite);
            
            // 添加索引标签（在柱子下方）- 更大且靠近柱子
            const indexSprite = this.createTextSprite(`[${i}]`, {
                fontSize: 64,
                color: '#cccccc',
                backgroundColor: null
            });
            indexSprite.position.set(offset + i * spacing, -0.4, 0);
            indexSprite.scale.set(1.3, 0.4, 1);
            this.scene.add(indexSprite);
            this.tempObjects.push(indexSprite);
        });
    }
    
    getColorByState(state) {
        const colorMap = {
            'idle': 0x6c757d,
            'compare': 0xffc107,
            'comparing': 0xffc107,  // SVL格式
            'current': 0x007bff,
            'swap': 0x28a745,
            'swapped': 0x28a745,    // SVL格式
            'sorted': 0x17a2b8,
            'pivot': 0xdc3545,
            'active': 0xff6b6b,
            'visited': 0x4ecdc4,
            'idle_node': 0x6c757d,
            'current_node': 0x007bff,
            'visited_node': 0x4ecdc4
        };
        return colorMap[state] || 0x6c757d;
    }
    
    // ============================================================
    // 图渲染（Graph）
    // ============================================================
    
    renderGraph() {
        const struct = this.currentState.data_state.structure;
        if (!struct || !struct.nodes) return;
        
        const nodes = struct.nodes;
        const edges = struct.edges || [];
        
        // 布局计算（圆形或网格布局）
        const radius = 5;
        const angleStep = (2 * Math.PI) / nodes.length;
        
        nodes.forEach((node, i) => {
            const angle = i * angleStep;
            const x = radius * Math.cos(angle);
            const z = radius * Math.sin(angle);
            
            const nodeId = node.id;
            const label = node.label || nodeId;
            const styleKey = node.styleKey || 'idle_node';
            
            // 节点圆球
            const geometry = new THREE.SphereGeometry(0.5, 32, 32);
            const material = new THREE.MeshPhongMaterial({
                color: this.getColorByState(styleKey),
                emissive: styleKey === 'current_node' ? 0x4CAF50 : 0x000000,
                emissiveIntensity: styleKey === 'current_node' ? 0.3 : 0
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(x, 0, z);
            mesh.castShadow = true;
            
            this.scene.add(mesh);
            this.graphNodes[nodeId] = mesh;
            
            // 添加节点标签
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 128;
            canvas.height = 128;
            context.font = 'bold 80px Arial';
            context.fillStyle = 'white';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText(label, 64, 64);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ 
                map: texture,
                depthTest: false,
                depthWrite: false
            });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(0.8, 0.8, 1);
            sprite.position.set(x, 0, z + 0.6);
            sprite.renderOrder = 1;
            
            this.scene.add(sprite);
            this.tempObjects.push(sprite);
        });
        
        // 绘制边
        edges.forEach(edge => {
            const fromNode = this.graphNodes[edge.from];
            const toNode = this.graphNodes[edge.to];
            
            if (fromNode && toNode) {
                const material = new THREE.LineBasicMaterial({ 
                    color: edge.styleKey === 'relaxed_edge' ? 0x4CAF50 : 0x666666,
                    linewidth: 2
                });
                const points = [fromNode.position, toNode.position];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geometry, material);
                
                this.scene.add(line);
                this.graphEdges.push(line);
                
                // 添加边的标签（权重）
                if (edge.weight !== undefined || edge.label !== undefined) {
                    const label = edge.label !== undefined ? edge.label : edge.weight;
                    const midX = (fromNode.position.x + toNode.position.x) / 2;
                    const midY = (fromNode.position.y + toNode.position.y) / 2 + 0.3;
                    const midZ = (fromNode.position.z + toNode.position.z) / 2;
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = 128;
                    canvas.height = 128;
                    
                    // 绘制背景圆形
                    context.fillStyle = 'rgba(255, 255, 255, 0.9)';
                    context.beginPath();
                    context.arc(64, 64, 45, 0, Math.PI * 2);
                    context.fill();
                    
                    // 绘制边框
                    context.strokeStyle = '#666666';
                    context.lineWidth = 3;
                    context.stroke();
                    
                    // 绘制文字
                    context.font = 'bold 50px Arial';
                    context.fillStyle = '#000000';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    context.fillText(String(label), 64, 64);
                    
                    const texture = new THREE.CanvasTexture(canvas);
                    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
                    const sprite = new THREE.Sprite(spriteMaterial);
                    sprite.scale.set(0.8, 0.8, 1);
                    sprite.position.set(midX, midY, midZ);
                    
                    this.scene.add(sprite);
                    this.graphEdges.push(sprite);
                }
            }
        });
    }
    
    // ============================================================
    // 树渲染（Tree）
    // ============================================================
    
    renderTree() {
        const struct = this.currentState.data_state.structure;
        if (!struct || !struct.nodes) return;
        
        const nodes = struct.nodes;
        
        // 找出所有根节点（没有parent的节点）
        const rootNodes = nodes.filter(n => !n.parent);
        
        // 为每棵树单独渲染（并排显示）
        const treeSpacing = 8; // 树之间的水平间距
        
        rootNodes.forEach((rootNode, treeIndex) => {
            const treeOffsetX = (treeIndex - (rootNodes.length - 1) / 2) * treeSpacing;
            
            // BFS分层（针对单棵树）
            const levels = [];
            const queue = [rootNode.id];
            const visited = new Set([rootNode.id]);
            
            while (queue.length > 0) {
                const levelSize = queue.length;
                const level = [];
                
                for (let i = 0; i < levelSize; i++) {
                    const nodeId = queue.shift();
                    level.push(nodeId);
                    
                    const node = nodes.find(n => n.id === nodeId);
                    if (node && node.children) {
                        node.children.forEach(childId => {
                            if (!visited.has(childId)) {
                                visited.add(childId);
                                queue.push(childId);
                            }
                        });
                    }
                }
                
                levels.push(level);
            }
            
            // 渲染节点
            const vSpacing = 2.5;
            const hSpacing = 2.5;
            
            // 计算起始高度，确保最底层节点也在地面上方（至少1个单位）
            const treeDepth = levels.length;
            const startY = Math.max(2, (treeDepth - 1) * vSpacing + 2);
            
            levels.forEach((level, li) => {
                const y = startY - li * vSpacing; // 从顶部向下布局
                const offset = -(level.length - 1) * hSpacing / 2;
                
                level.forEach((nodeId, i) => {
                    const x = treeOffsetX + offset + i * hSpacing;
                    
                    const node = nodes.find(n => n.id === nodeId);
                    const label = node.label || nodeId;
                    const styleKey = node.styleKey || 'idle_node';
                    
                    // 创建节点球体
                    const geometry = new THREE.SphereGeometry(0.5, 32, 32);
                    const material = new THREE.MeshPhongMaterial({
                        color: this.getColorByState(styleKey)
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    mesh.position.set(x, y, 0);
                    mesh.castShadow = true;
                    mesh.receiveShadow = true;
                    
                    this.scene.add(mesh);
                    this.treeNodes[nodeId] = mesh;
                    
                    // 添加标签文本
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = 128;
                    canvas.height = 128;
                    context.font = 'bold 80px Arial';
                    context.fillStyle = 'white';
                    context.textAlign = 'center';
                    context.textBaseline = 'middle';
                    context.fillText(label, 64, 64);
                    
                    const texture = new THREE.CanvasTexture(canvas);
                    const spriteMaterial = new THREE.SpriteMaterial({ 
                        map: texture,
                        depthTest: false,
                        depthWrite: false
                    });
                    const sprite = new THREE.Sprite(spriteMaterial);
                    sprite.scale.set(0.8, 0.8, 1);
                    sprite.position.set(x, y, 0.6);
                    sprite.renderOrder = 1;
                    
                    this.scene.add(sprite);
                    this.tempObjects.push(sprite);
                });
            });
            
            // 绘制边（只绘制当前树的边）
            visited.forEach(nodeId => {
                const node = nodes.find(n => n.id === nodeId);
                if (node && node.children) {
                    node.children.forEach(childId => {
                        const parent = this.treeNodes[node.id];
                        const child = this.treeNodes[childId];
                        
                        if (parent && child) {
                            const material = new THREE.LineBasicMaterial({ 
                                color: 0x888888,
                                linewidth: 2
                            });
                            const points = [parent.position, child.position];
                            const geometry = new THREE.BufferGeometry().setFromPoints(points);
                            const line = new THREE.Line(geometry, material);
                            
                            this.scene.add(line);
                            this.treeEdges.push(line);
                        }
                    });
                }
            });
        });
    }
    
    // ============================================================
    // 辅助方法
    // ============================================================

    // 判断目标视图是否匹配当前视图（支持别名）
    isTargetView(targetViewId, currentViewId) {
        if (!targetViewId) return true; // 默认匹配
        if (targetViewId === currentViewId) return true;
        
        // 主视图别名列表
        const aliases = ['dp_table', 'data_state', 'main_table', 'dp', 'dp_edit_distance'];
        // 如果两者都是主视图别名，则认为是同一个
        if (aliases.includes(targetViewId) && aliases.includes(currentViewId)) return true;
        
        return false;
    }

    // 创建自适应大小的文本Sprite
    createFitTextSprite(text, color = '#000000', maxFontSize = 100) {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 256;
        
        context.clearRect(0, 0, 256, 256);
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        
        let fontSize = maxFontSize;
        context.font = `bold ${fontSize}px Arial`;
        
        // 自动缩小字体直到适应宽度 (留出40px边距)
        const maxWidth = 216;
        while (context.measureText(text).width > maxWidth && fontSize > 20) {
            fontSize -= 10;
            context.font = `bold ${fontSize}px Arial`;
        }
        
        context.fillStyle = color;
        context.fillText(text, 128, 128);
        
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        return new THREE.Sprite(material);
    }

    // ============================================================
    // 表格渲染（Table/DP）
    // ============================================================
    
    renderTable() {
        const data = this.currentState.data_state.data;
        if (!data || !Array.isArray(data)) return;
        
        const rows = data.length;
        const cols = data[0] ? data[0].length : 0;
        
        const cellSize = 1.0;
        const spacing = 0.15;
        const offsetX = -(cols * (cellSize + spacing)) / 2;
        const offsetZ = -(rows * (cellSize + spacing)) / 2;
        
        // 规范化 view_id
        const view_id = this.currentState.data_state.view_id || 'data_state';
        this.tableCells[view_id] = {};
        this.tableCellTexts[view_id] = {};
        
        // 获取行列标题（如果有）
        const options = this.currentState.data_state.options || {};
        const rowHeaders = options.row_headers || [];
        const colHeaders = options.col_headers || [];
        
        // 渲染列标题
        if (colHeaders.length > 0) {
            for (let c = 0; c < cols; c++) {
                const x = offsetX + c * (cellSize + spacing);
                const z = offsetZ - (cellSize + spacing);
                
                const sprite = this.createFitTextSprite(colHeaders[c] || '', '#ffffff', 80);
                sprite.scale.set(cellSize * 0.8, cellSize * 0.8, 1);
                sprite.position.set(x, 0.1, z);
                
                // 背景
                const bgGeo = new THREE.BoxGeometry(cellSize, 0.1, cellSize);
                const bgMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
                const bg = new THREE.Mesh(bgGeo, bgMat);
                bg.position.set(x, 0, z);
                
                this.scene.add(bg);
                this.scene.add(sprite);
                this.tempObjects.push(bg);
                this.tempObjects.push(sprite);
            }
        }
        
        // 渲染行标题
        if (rowHeaders.length > 0) {
            for (let r = 0; r < rows; r++) {
                const x = offsetX - (cellSize + spacing);
                const z = offsetZ + r * (cellSize + spacing);
                
                const sprite = this.createFitTextSprite(rowHeaders[r] || '', '#ffffff', 80);
                sprite.scale.set(cellSize * 0.8, cellSize * 0.8, 1);
                sprite.position.set(x, 0.1, z);
                
                // 背景
                const bgGeo = new THREE.BoxGeometry(cellSize, 0.1, cellSize);
                const bgMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
                const bg = new THREE.Mesh(bgGeo, bgMat);
                bg.position.set(x, 0, z);
                
                this.scene.add(bg);
                this.scene.add(sprite);
                this.tempObjects.push(bg);
                this.tempObjects.push(sprite);
            }
        }
        
        // 渲染单元格
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const value = data[r][c];
                const valStr = (value !== null && value !== undefined) ? String(value) : '';
                
                // 创建单元格立方体
                const geometry = new THREE.BoxGeometry(cellSize, 0.2, cellSize);
                const material = new THREE.MeshPhongMaterial({
                    color: 0xE0E0E0,
                    emissive: 0x000000,
                    transparent: false
                });
                const mesh = new THREE.Mesh(geometry, material);
                
                const x = offsetX + c * (cellSize + spacing);
                const z = offsetZ + r * (cellSize + spacing);
                mesh.position.set(x, 0, z);
                mesh.castShadow = true;
                mesh.receiveShadow = true;
                
                this.scene.add(mesh);
                // 使用字符串key避免引用问题
                this.tableCells[view_id][`${r},${c}`] = mesh;
                
                // 添加单元格值文本
                if (valStr) {
                    const sprite = this.createFitTextSprite(valStr, '#000000', 100);
                    sprite.scale.set(cellSize * 0.8, cellSize * 0.8, 1);
                    sprite.position.set(x, 0.15, z);
                    this.scene.add(sprite);
                    this.tableCellTexts[view_id][`${r},${c}`] = sprite;
                }
            }
        }
    }
    
    // ============================================================
    // 哈希表渲染（Hashtable）
    // ============================================================
    
    renderHashtable() {
        const struct = this.currentState.data_state.structure;
        if (!struct || !struct.buckets) return;
        
        const buckets = struct.buckets;
        const spacing = 1.5;
        const offset = -(buckets.length - 1) * spacing / 2;
        
        buckets.forEach((bucket, i) => {
            const geometry = new THREE.BoxGeometry(1.2, 0.6, 0.6);
            const material = new THREE.MeshPhongMaterial({ color: 0x4169E1 });
            const mesh = new THREE.Mesh(geometry, material);
            
            mesh.position.set(offset + i * spacing, 0, 0);
            
            this.scene.add(mesh);
            this.hashtableBuckets.push(mesh);
        });
    }
    
    // ============================================================
    // 播放控制
    // ============================================================
    
    async play() {
        if (!this.trace || this.currentFrame >= this.trace.deltas.length) return;
        
        this.isPlaying = true;
        // UI updates handled by Vue
        
        this.playNextFrame();
    }
    
    async playNextFrame() {
        if (!this.isPlaying || this.currentFrame >= this.trace.deltas.length) {
            if (this.currentFrame >= this.trace.deltas.length) {
                this.playSound('complete');
            }
            this.pause();
            return;
        }
        
        // 应用delta（异步，等待动画完成）
        const delta = this.trace.deltas[this.currentFrame];
        await this.applyDelta(delta);
        this.currentFrame++;
        
        // 更新信息
        this.updateDomText('frame-info', `${this.currentFrame} / ${this.trace.deltas.length}`);
        
        // 更新伪代码高亮
        const codeHighlight = this.currentState.code_highlight;
        if (codeHighlight !== undefined) {
            this.updatePseudocodeHighlight(codeHighlight);
        }
        
        // 更新当前行号显示
        this.updateDomText('code-line', codeHighlight !== undefined ? codeHighlight : '-');
        
        // 重新渲染
        this.renderFrame();
        
        // 继续播放
        setTimeout(() => this.playNextFrame(), 500 / this.speed);
    }
    
    pause() {
        this.isPlaying = false;
        // UI updates handled by Vue
    }
    
    reset() {
        this.pause();
        this.currentFrame = 0;
        this.currentState = JSON.parse(JSON.stringify(this.trace.initial_frame));
        this.currentAuxViews = JSON.parse(JSON.stringify(this.trace.initial_frame.auxiliary_views || []));
        this.clearOverlays();
        this.renderFrame();
        this.updateDomText('frame-info', `0 / ${this.trace.deltas.length}`);
        this.updateDomText('code-line', '-');
        
        // 重置代码高亮到初始状态
        const initialCodeHighlight = this.currentState.code_highlight;
        if (initialCodeHighlight !== undefined && initialCodeHighlight !== null) {
            this.updatePseudocodeHighlight(initialCodeHighlight);
        }
    }
    
    // ============================================================
    // Delta应用（核心逻辑）
    // ============================================================
    
    async applyDelta(delta) {
        // 更新变量
        const meta = delta.meta || {};
        Object.keys(meta).forEach(key => {
            // 更新变量（这里简化处理）
        });
        
        // 更新代码高亮
        if (delta.code_highlight !== undefined) {
            this.currentState.code_highlight = delta.code_highlight;
        }
        
        // 处理操作（串行执行，等待动画完成）
        const operations = delta.operations || [];
        for (const opGroup of operations) {
            const ops = Array.isArray(opGroup) ? opGroup : [opGroup];
            for (const op of ops) {
                await this.processOperation(op);
            }
        }
    }
    
    async processOperation(op) {
        const opName = op.op;
        const params = op.params || {};
        
        // 操作映射表
        const handlers = {
            // Array操作
            'updateStyle': () => this.op_updateStyle(params),
            'updateValues': () => this.op_updateValues(params),
            'moveElements': () => this.op_moveElements(params),
            'updateBoundary': () => this.op_updateBoundary(params),
            'removeBoundary': () => this.op_removeBoundary(params),
            
            // Graph操作
            'updateNodeStyle': () => this.op_updateNodeStyle(params),
            'updateNodeProperties': () => this.op_updateNodeProperties(params),
            'updateEdgeStyle': () => this.op_updateEdgeStyle(params),
            'addNode': () => this.op_addNode(params),
            'removeNode': () => this.op_removeNode(params),
            'addEdge': () => this.op_addEdge(params),
            'removeEdge': () => this.op_removeEdge(params),
            
            // Table操作
            'updateTableCell': () => this.op_updateTableCell(params),
            'highlightTableCell': () => this.op_highlightTableCell(params),
            'showDependency': () => this.op_showDependency(params),
            
            // Tree操作
            'addChild': () => this.op_addChild(params),
            'removeChild': () => this.op_removeChild(params),
            'reparent': () => this.op_reparent(params),
            'swapNodes': () => this.op_swapNodes(params),
            'highlightPath': () => this.op_highlightPath(params),
            
            // Hashtable操作
            'insertIntoBucket': () => this.op_insertIntoBucket(params),
            'updateInBucket': () => this.op_updateInBucket(params),
            'removeFromBucket': () => this.op_removeFromBucket(params),
            'showHash': () => this.op_showHash(params),
            'highlightCollision': () => this.op_highlightCollision(params),
            'highlightBucket': () => this.op_highlightBucket(params),
            
            // List操作（辅助视图）
            'appendToList': () => this.op_appendToList(params),
            'popFromList': () => this.op_popFromList(params),
            'clearList': () => this.op_clearList(params),
            
            // 通用操作
            'showComment': () => this.op_showComment(params)
        };
        
        const handler = handlers[opName];
        if (handler) {
            await handler();
        } else {
            console.log('未实现的操作:', opName, params);
        }
    }
    
    // ============================================================
    // Array操作实现
    // ============================================================
    
    async op_updateStyle(params) {
        const indices = params.indices || [];
        const styleKey = params.styleKey;
        const arrayData = this.currentState.data_state.structure || this.currentState.data_state.data;
        
        if (!arrayData) return;
        
        // 播放声音
        this.playSound(styleKey);
        
        // 更新状态数据（SVL使用styleKey字段）
        indices.forEach(i => {
            if (arrayData[i]) {
                arrayData[i].styleKey = styleKey;
            }
        });
    }
    
    async op_updateValues(params) {
        const updates = params.updates || [];
        const arrayData = this.currentState.data_state.structure || this.currentState.data_state.data;
        
        if (!arrayData) return;
        
        updates.forEach(u => {
            const idx = u.index;
            const value = u.value;
            if (arrayData[idx]) {
                arrayData[idx].value = value;
            }
        });
        
        this.playSound('swap');
    }
    
    async op_moveElements(params) {
        const pairs = params.pairs || [];
        const arrayData = this.currentState.data_state.structure || this.currentState.data_state.data;
        
        if (!arrayData) return;
        
        const snapshot = JSON.parse(JSON.stringify(arrayData));
        
        this.playSound('swap');
        
        // 更新数据状态
        pairs.forEach(p => {
            const from = p.fromIndex;
            const to = p.toIndex;
            if (from !== undefined && to !== undefined) {
                arrayData[to] = snapshot[from];
            }
        });
    }
    
    async op_updateBoundary(params) {
        const type = params.type;
        const range = params.range || [];
        const styleKey = params.styleKey || 'boundary';
        const label = params.label;
        
        if (range.length < 2 || !this.arrayObjects.length) return;
        
        const [start, end] = range;
        if (start < 0 || end >= this.arrayObjects.length) return;
        
        // 创建边界框
        const firstMesh = this.arrayObjects[start];
        const lastMesh = this.arrayObjects[end];
        
        if (!firstMesh || !lastMesh) return;
        
        // 计算边界框尺寸和位置
        const minX = Math.min(firstMesh.position.x, lastMesh.position.x) - 0.7;
        const maxX = Math.max(firstMesh.position.x, lastMesh.position.x) + 0.7;
        const centerX = (minX + maxX) / 2;
        const width = maxX - minX;
        
        // 获取最大高度
        let maxHeight = 0;
        for (let i = start; i <= end; i++) {
            if (this.arrayObjects[i]) {
                maxHeight = Math.max(maxHeight, this.arrayObjects[i].userData.height);
            }
        }
        
        // 创建边界框线框
        const height = maxHeight + 1;
        const boxGeometry = new THREE.BoxGeometry(width, height, 1.5);
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0xff0000, 
            linewidth: 2 
        });
        const boundaryBox = new THREE.LineSegments(edges, lineMaterial);
        boundaryBox.position.set(centerX, height / 2, 0);
        
        // 添加标签（如果有）
        if (label) {
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.width = 256;
            canvas.height = 64;
            context.fillStyle = '#ffffff';
            context.font = 'Bold 32px Arial';
            context.fillText(label, 10, 40);
            
            const texture = new THREE.CanvasTexture(canvas);
            const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
            const sprite = new THREE.Sprite(spriteMaterial);
            sprite.scale.set(2, 0.5, 1);
            sprite.position.set(centerX, height + 0.5, 0);
            
            this.scene.add(sprite);
            this.tempObjects.push(sprite);
        }
        
        this.scene.add(boundaryBox);
        this.tempObjects.push(boundaryBox);
        
        // 保存引用以便删除
        boundaryBox.userData = { type: type, boundaryType: 'boundary' };
    }
    
    async op_removeBoundary(params) {
        const type = params.type;
        
        // 移除对应类型的边界框
        this.tempObjects = this.tempObjects.filter(obj => {
            if (obj.userData && obj.userData.boundaryType === 'boundary' && obj.userData.type === type) {
                this.scene.remove(obj);
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) obj.material.dispose();
                return false;
            }
            return true;
        });
    }
    
    // ============================================================
    // Graph操作实现
    // ============================================================
    
    async op_updateNodeStyle(params) {
        const ids = params.ids || [];
        const styleKey = params.styleKey;
        const nodes = this.currentState.data_state.structure.nodes;
        
        ids.forEach(id => {
            const node = nodes.find(n => n.id === id);
            if (node) {
                node.styleKey = styleKey;
            }
        });
        
        this.playSound('highlight');
    }
    
    async op_updateNodeProperties(params) {
        const updates = params.updates || [];
        const nodes = this.currentState.data_state.structure.nodes;
        
        updates.forEach(update => {
            const node = nodes.find(n => n.id === update.id);
            if (node) {
                node.properties = { ...node.properties, ...update.properties };
            }
        });
    }
    
    async op_updateEdgeStyle(params) {
        const edges = params.edges || [];
        const styleKey = params.styleKey;
        const edgeList = this.currentState.data_state.structure.edges;
        
        edges.forEach(e => {
            const edge = edgeList.find(edge => edge.from === e.from && edge.to === e.to);
            if (edge) {
                edge.styleKey = styleKey;
            }
        });
    }
    
    async op_addNode(params) {
        const node = params.node;
        if (node) {
            this.currentState.data_state.structure.nodes.push(node);
            this.playSound('add');
        }
    }
    
    async op_removeNode(params) {
        const id = params.id;
        if (id) {
            const nodes = this.currentState.data_state.structure.nodes;
            this.currentState.data_state.structure.nodes = nodes.filter(n => n.id !== id);
            this.playSound('remove');
        }
    }
    
    async op_addEdge(params) {
        const edge = params.edge;
        if (edge) {
            this.currentState.data_state.structure.edges.push(edge);
            this.playSound('add');
        }
    }
    
    async op_removeEdge(params) {
        const from = params.from;
        const to = params.to;
        if (from && to) {
            const edges = this.currentState.data_state.structure.edges;
            this.currentState.data_state.structure.edges = edges.filter(e => !(e.from === from && e.to === to));
            this.playSound('remove');
        }
    }
    
    // ============================================================
    // Table操作实现
    // ============================================================
    
    async op_updateTableCell(params) {
        // 规范化 view_id
        const currentMainViewId = this.currentState.data_state.view_id || 'data_state';
        const targetViewId = params.view_id;
        
        // 检查是否匹配主视图
        const isMainTable = this.isTargetView(targetViewId, currentMainViewId);
        
        // 如果不匹配且不是辅助视图，暂时忽略（目前简化处理，只处理主表更新）
        // 如果有辅助视图逻辑，这里需要扩展查找辅助视图的数据
        
        if (!isMainTable) return;
        
        const view_id = currentMainViewId;
        const updates = params.updates || [];
        const data = this.currentState.data_state.data;
        
        if (!data) return;
        
        const cellSize = 1.0;
        const spacing = 0.15;
        const rows = data.length;
        const cols = data[0] ? data[0].length : 0;
        const offsetX = -(cols * (cellSize + spacing)) / 2;
        const offsetZ = -(rows * (cellSize + spacing)) / 2;
        
        updates.forEach(u => {
            const r = u.row;
            const c = u.col;
            const value = u.value;
            if (r < data.length && c < data[r].length) {
                data[r][c] = value;
                
                // 更新文本sprite
                if (this.tableCellTexts[view_id]) {
                    const key = `${r},${c}`;
                    const oldSprite = this.tableCellTexts[view_id][key];
                    
                    // 移除并清理旧的sprite
                    if (oldSprite) {
                        this.scene.remove(oldSprite);
                        if (oldSprite.material) {
                            if (oldSprite.material.map) oldSprite.material.map.dispose();
                            oldSprite.material.dispose();
                        }
                        delete this.tableCellTexts[view_id][key];
                    }
                    
                    // 创建新的sprite（即使值是0也要显示）
                    const valStr = (value !== null && value !== undefined) ? String(value) : '';
                    if (valStr) {
                        const x = offsetX + c * (cellSize + spacing);
                        const z = offsetZ + r * (cellSize + spacing);
                        
                        const sprite = this.createFitTextSprite(valStr, '#000000', 100);
                        sprite.scale.set(cellSize * 0.8, cellSize * 0.8, 1);
                        sprite.position.set(x, 0.15, z);
                        
                        this.scene.add(sprite);
                        this.tableCellTexts[view_id][key] = sprite;
                    }
                }
            }
        });
    }
    
    async op_highlightTableCell(params) {
        // 规范化 view_id
        const currentMainViewId = this.currentState.data_state.view_id || 'data_state';
        const targetViewId = params.view_id;
        
        if (!this.isTargetView(targetViewId, currentMainViewId)) return;
        
        const view_id = currentMainViewId;
        const cells = params.cells || [];
        // styleKey 支持: 'highlight', 'current_cell', 'compare', 'flash'
        const styleKey = params.styleKey || 'highlight';
        
        if (!this.tableCells[view_id]) return;
        
        // 确定高亮颜色
        let highlightColor = 0xffff00; // Default yellow
        let opacity = 0.3;
        
        if (styleKey === 'compare') highlightColor = 0xffaa00; // Orange
        else if (styleKey === 'current_cell') highlightColor = 0x00ff00; // Green
        else if (styleKey === 'flash' || styleKey === 'changed') {
            highlightColor = 0xff0000; // Red
            opacity = 0.5;
        }
        
        cells.forEach(cell => {
            const r = cell.row;
            const c = cell.col;
            const key = `${r},${c}`;
            
            if (this.tableCells[view_id][key]) {
                const cellMesh = this.tableCells[view_id][key];
                
                // 1. 创建填充平面 (Plane) 覆盖在单元格上方
                const planeGeo = new THREE.PlaneGeometry(0.9, 0.9);
                const planeMat = new THREE.MeshBasicMaterial({
                    color: highlightColor,
                    transparent: true,
                    opacity: opacity,
                    side: THREE.DoubleSide
                });
                const plane = new THREE.Mesh(planeGeo, planeMat);
                // 旋转90度使其水平
                plane.rotation.x = -Math.PI / 2;
                plane.position.copy(cellMesh.position);
                plane.position.y += 0.11; // 略高于单元格表面(0.1)
                
                this.scene.add(plane);
                this.overlayObjects.push(plane);
                
                // 2. 创建高亮边框
                const geometry = new THREE.BoxGeometry(1.0, 0.2, 1.0);
                const edges = new THREE.EdgesGeometry(geometry);
                const material = new THREE.LineBasicMaterial({ 
                    color: highlightColor, 
                    linewidth: 2 
                });
                const highlightBox = new THREE.LineSegments(edges, material);
                highlightBox.position.copy(cellMesh.position);
                
                this.scene.add(highlightBox);
                this.overlayObjects.push(highlightBox);
                
                // 3. 如果是 flash/update，添加简单的缩放动画
                if (styleKey === 'flash' || styleKey === 'changed') {
                    gsap.from(plane.material, { opacity: 0.8, duration: 0.5 });
                    gsap.from(highlightBox.scale, { x: 1.2, y: 1.2, z: 1.2, duration: 0.3 });
                }
            }
        });
    }
    
    async op_showDependency(params) {
        // 规范化 view_id
        const currentMainViewId = this.currentState.data_state.view_id || 'data_state';
        const targetViewId = params.view_id;
        
        if (!this.isTargetView(targetViewId, currentMainViewId)) return;
        
        const view_id = currentMainViewId;
        const from_cells = params.from_cells || [];
        const to_cell = params.to_cell;
        // styleKey currently unused but can map to colors
        
        // 每次绘制前先清除上一轮依赖箭头，避免长期堆积
        this.clearOverlayByCategory('dependencyArrow');
        
        if (!this.tableCells[view_id] || !to_cell) return;
        
        const toKey = `${to_cell.row},${to_cell.col}`;
        const toMesh = this.tableCells[view_id][toKey];
        
        if (!toMesh) return;
        
        from_cells.forEach(from_cell => {
            const fromKey = `${from_cell.row},${from_cell.col}`;
            const fromMesh = this.tableCells[view_id][fromKey];
            
            if (!fromMesh) return;
            
            // 起点和终点
            const start = fromMesh.position.clone();
            const end = toMesh.position.clone();
            
            // 提升高度，避免穿模
            start.y += 0.15;
            end.y += 0.15;
            
            // 计算曼哈顿距离
            const dist = Math.abs(from_cell.row - to_cell.row) + Math.abs(from_cell.col - to_cell.col);
            
            // 计算控制点：距离越远，弧度越高
            // 但为了保持整洁，高度限制在一定范围
            const arcHeight = Math.min(0.8, 0.3 + dist * 0.1);
            
            const mid = new THREE.Vector3(
                (start.x + end.x) / 2,
                start.y + arcHeight,
                (start.z + end.z) / 2
            );
            
            // 创建曲线
            const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
            const points = curve.getPoints(20);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ 
                color: 0xff0000, // Red arrows for dependencies
                linewidth: 2 
            });
            const arrow = new THREE.Line(geometry, material);
            
            // 添加箭头尖端 (ConeGeometry might be better than ArrowHelper for custom positions)
            // 这里继续使用 ArrowHelper 但调整长度
            const direction = new THREE.Vector3().subVectors(end, points[points.length - 2]).normalize();
            const arrowHeadLength = 0.3;
            const arrowHeadWidth = 0.2;
            const arrowHelper = new THREE.ArrowHelper(
                direction,
                end,
                arrowHeadLength,
                0xff0000,
                arrowHeadLength,
                arrowHeadWidth
            );
            
            arrow.userData = arrow.userData || {};
            arrow.userData.overlayCategory = 'dependencyArrow';
            arrowHelper.userData = arrowHelper.userData || {};
            arrowHelper.userData.overlayCategory = 'dependencyArrow';
            
            this.scene.add(arrow);
            this.scene.add(arrowHelper);
            this.overlayObjects.push(arrow);
            this.overlayObjects.push(arrowHelper);
        });
    }
    
    // ============================================================
    // Tree操作实现
    // ============================================================
    
    async op_addChild(params) {
        const parent_id = params.parent_id;
        const node = params.node;
        
        if (node) {
            this.currentState.data_state.structure.nodes.push(node);
            
            const parent = this.currentState.data_state.structure.nodes.find(n => n.id === parent_id);
            if (parent) {
                parent.children = parent.children || [];
                parent.children.push(node.id);
            }
            
            this.playSound('add');
        }
    }
    
    async op_removeChild(params) {
        const parent_id = params.parent_id;
        const child_id = params.child_id;
        
        const parent = this.currentState.data_state.structure.nodes.find(n => n.id === parent_id);
        if (parent && parent.children) {
            parent.children = parent.children.filter(id => id !== child_id);
            this.playSound('remove');
        }
    }
    
    async op_reparent(params) {
        const node_id = params.node_id;
        const new_parent_id = params.new_parent_id;
        const index = params.index;
        
        const nodes = this.currentState.data_state.structure.nodes;
        const targetNode = nodes.find(n => n.id === node_id);
        
        if (!targetNode) return;
        
        // 从旧父节点移除
        const old_parent_id = targetNode.parent;
        if (old_parent_id) {
            const oldParent = nodes.find(n => n.id === old_parent_id);
            if (oldParent && oldParent.children) {
                oldParent.children = oldParent.children.filter(id => id !== node_id);
            }
        }
        
        // 添加到新父节点
        targetNode.parent = new_parent_id;
        if (new_parent_id) {
            const newParent = nodes.find(n => n.id === new_parent_id);
            if (newParent) {
                newParent.children = newParent.children || [];
                if (index !== undefined && index >= 0 && index <= newParent.children.length) {
                    newParent.children.splice(index, 0, node_id);
                } else {
                    newParent.children.push(node_id);
                }
            }
        } else {
            this.currentState.data_state.structure.root = node_id;
        }
        
        this.playSound('add');
    }
    
    async op_swapNodes(params) {
        const a_id = params.a_id;
        const b_id = params.b_id;
        const swap_children = params.swap_children || false;
        
        const nodes = this.currentState.data_state.structure.nodes;
        const node_a = nodes.find(n => n.id === a_id);
        const node_b = nodes.find(n => n.id === b_id);
        
        if (!node_a || !node_b) return;
        
        // 交换label和properties
        if (node_a.label !== undefined && node_b.label !== undefined) {
            [node_a.label, node_b.label] = [node_b.label, node_a.label];
        }
        
        if (node_a.properties && node_b.properties) {
            [node_a.properties, node_b.properties] = [node_b.properties, node_a.properties];
        }
        
        // 如果需要交换子树
        if (swap_children && node_a.children && node_b.children) {
            [node_a.children, node_b.children] = [node_b.children, node_a.children];
        }
        
        this.playSound('swap');
    }
    
    async op_highlightPath(params) {
        const from_id = params.from_id;
        const to_id = params.to_id;
        const styleKey = params.styleKey || 'path';
        
        const nodes = this.currentState.data_state.structure.nodes;
        
        // BFS查找路径
        const path = this.findPathInTree(from_id, to_id, nodes);
        
        if (!path || path.length === 0) return;
        
        // 高亮路径上的节点
        path.forEach(nodeId => {
            const node = nodes.find(n => n.id === nodeId);
            if (node) {
                node.styleKey = 'active';
            }
        });
        
        // 高亮路径上的边
        for (let i = 0; i < path.length - 1; i++) {
            const fromMesh = this.treeNodes[path[i]];
            const toMesh = this.treeNodes[path[i + 1]];
            
            if (fromMesh && toMesh) {
                const material = new THREE.LineBasicMaterial({ 
                    color: 0xff6b6b, 
                    linewidth: 3 
                });
                const points = [fromMesh.position, toMesh.position];
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                const line = new THREE.Line(geometry, material);
                
                this.scene.add(line);
                this.tempObjects.push(line);
            }
        }
        
        this.playSound('highlight');
    }
    
    findPathInTree(from_id, to_id, nodes) {
        // BFS搜索路径
        const queue = [[from_id]];
        const visited = new Set([from_id]);
        
        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];
            
            if (current === to_id) {
                return path;
            }
            
            const node = nodes.find(n => n.id === current);
            if (node && node.children) {
                for (const childId of node.children) {
                    if (!visited.has(childId)) {
                        visited.add(childId);
                        queue.push([...path, childId]);
                    }
                }
            }
        }
        
        return null;
    }
    
    // ============================================================
    // Hashtable操作实现
    // ============================================================
    
    async op_insertIntoBucket(params) {
        const bucket_index = params.bucket_index;
        const element = params.element;
        const buckets = this.currentState.data_state.structure.buckets;
        
        if (bucket_index < buckets.length) {
            buckets[bucket_index].items.push(element);
            this.playSound('add');
        }
    }
    
    async op_updateInBucket(params) {
        const bucket_index = params.bucket_index;
        const key = params.key;
        const value = params.value;
        const buckets = this.currentState.data_state.structure.buckets;
        
        if (bucket_index < buckets.length) {
            const items = buckets[bucket_index].items;
            const item = items.find(it => it.key === key);
            if (item) {
                item.value = value;
            }
        }
    }
    
    async op_removeFromBucket(params) {
        const bucket_index = params.bucket_index;
        const key = params.key;
        const buckets = this.currentState.data_state.structure.buckets;
        
        if (bucket_index < buckets.length) {
            buckets[bucket_index].items = buckets[bucket_index].items.filter(item => item.key !== key);
            this.playSound('remove');
        }
    }
    
    async op_showHash(params) {
        const input_key = params.input_key;
        const output_hash = params.output_hash;
        const bucket_index = params.bucket_index;
        
        if (bucket_index >= this.hashtableBuckets.length) return;
        
        const bucketMesh = this.hashtableBuckets[bucket_index];
        
        // 创建哈希计算注释
        const text = `hash("${input_key}") = ${output_hash} → [${bucket_index}]`;
        const sprite = this.createTextSprite(text, { color: '#00ff00', fontSize: 24 });
        sprite.position.set(bucketMesh.position.x, bucketMesh.position.y + 1, bucketMesh.position.z);
        
        this.scene.add(sprite);
        this.tempObjects.push(sprite);
        
        // 添加动画箭头指向桶
        const start = new THREE.Vector3(bucketMesh.position.x, bucketMesh.position.y + 0.8, bucketMesh.position.z);
        const end = bucketMesh.position.clone();
        end.y += 0.3;
        
        const direction = new THREE.Vector3().subVectors(end, start).normalize();
        const arrow = new THREE.ArrowHelper(direction, start, 0.5, 0x00ff00, 0.2, 0.1);
        
        this.scene.add(arrow);
        this.tempObjects.push(arrow);
    }
    
    async op_highlightCollision(params) {
        const bucket_index = params.bucket_index;
        
        if (bucket_index >= this.hashtableBuckets.length) return;
        
        const bucketMesh = this.hashtableBuckets[bucket_index];
        
        // 创建红色脉冲边框
        const geometry = new THREE.BoxGeometry(1.3, 0.7, 0.7);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 3 });
        const collisionBox = new THREE.LineSegments(edges, material);
        collisionBox.position.copy(bucketMesh.position);
        
        this.scene.add(collisionBox);
        this.tempObjects.push(collisionBox);
        
        // 添加"COLLISION"文字
        const sprite = this.createTextSprite('COLLISION!', { color: '#ff0000', fontSize: 20 });
        sprite.position.set(bucketMesh.position.x, bucketMesh.position.y + 0.7, bucketMesh.position.z);
        
        this.scene.add(sprite);
        this.tempObjects.push(sprite);
        
        this.playSound('highlight');
    }
    
    async op_highlightBucket(params) {
        const bucket_index = params.bucket_index;
        
        if (bucket_index >= this.hashtableBuckets.length) return;
        
        const bucketMesh = this.hashtableBuckets[bucket_index];
        
        // 创建高亮边框
        const geometry = new THREE.BoxGeometry(1.3, 0.7, 0.7);
        const edges = new THREE.EdgesGeometry(geometry);
        const material = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
        const highlightBox = new THREE.LineSegments(edges, material);
        highlightBox.position.copy(bucketMesh.position);
        
        this.scene.add(highlightBox);
        this.tempObjects.push(highlightBox);
        
        this.playSound('highlight');
    }
    
    // ============================================================
    // List操作实现（辅助视图）
    // ============================================================
    
    async op_appendToList(params) {
        const view_id = params.view_id;
        const value = params.value;
        
        // 查找或创建辅助视图
        let view = this.currentAuxViews.find(v => v.view_id === view_id);
        if (!view) {
            view = {
                view_id: view_id,
                type: 'list',
                title: view_id,
                data: []
            };
            this.currentAuxViews.push(view);
        }
        
        if (Array.isArray(view.data)) {
            view.data.push(value);
        }
        
        this.playSound('add');
    }
    
    async op_popFromList(params) {
        const view_id = params.view_id;
        const from = params.from;
        const value = params.value;
        
        const view = this.currentAuxViews.find(v => v.view_id === view_id);
        if (!view || !Array.isArray(view.data)) return;
        
        if (value !== undefined) {
            // 按值删除
            const index = view.data.indexOf(value);
            if (index !== -1) {
                view.data.splice(index, 1);
            }
        } else if (from === 'head') {
            view.data.shift();
        } else if (from === 'tail') {
            view.data.pop();
        }
        
        this.playSound('remove');
    }
    
    async op_clearList(params) {
        const view_id = params.view_id;
        
        const view = this.currentAuxViews.find(v => v.view_id === view_id);
        if (view && Array.isArray(view.data)) {
            view.data = [];
        }
    }
    
    // ============================================================
    // 通用操作
    // ============================================================
    
    async op_showComment(params) {
        const text = params.text;
        const anchor = params.anchor || 'global';
        const ref = params.ref;
        
        if (!text) return;
        
        // 创建3D文本精灵
        const sprite = this.createTextSprite(text, { 
            color: '#ffffff', 
            fontSize: 18,
            backgroundColor: '#0066cc'
        });
        
        // 根据anchor类型定位
        if (anchor === 'global') {
            // 先清除已有全局注释，避免堆叠挡住主视图
            this.clearOverlayByCategory('globalComment');
            // 全局注释：主视图左上方，避免遮挡DP表
            sprite.position.set(-8, 5, 0);
            sprite.userData = sprite.userData || {};
            sprite.userData.overlayCategory = 'globalComment';
        } else if (anchor === 'node' && ref && ref.id) {
            // 节点注释
            const nodeMesh = this.graphNodes[ref.id] || this.treeNodes[ref.id];
            if (nodeMesh) {
                sprite.position.set(
                    nodeMesh.position.x,
                    nodeMesh.position.y + 1,
                    nodeMesh.position.z
                );
            }
            sprite.userData = sprite.userData || {};
            sprite.userData.overlayCategory = 'nodeComment';
        } else if (anchor === 'edge' && ref && ref.from && ref.to) {
            // 边注释（显示在边的中点）
            const fromNode = this.graphNodes[ref.from];
            const toNode = this.graphNodes[ref.to];
            if (fromNode && toNode) {
                sprite.position.set(
                    (fromNode.position.x + toNode.position.x) / 2,
                    (fromNode.position.y + toNode.position.y) / 2 + 0.5,
                    (fromNode.position.z + toNode.position.z) / 2
                );
            }
            sprite.userData = sprite.userData || {};
            sprite.userData.overlayCategory = 'edgeComment';
        }
        
        this.scene.add(sprite);
        this.overlayObjects.push(sprite);
    }
    
    // ============================================================
    // 工具函数
    // ============================================================
    
    createTextSprite(text, options = {}) {
        const fontSize = options.fontSize || 20;
        const color = options.color || '#ffffff';
        const backgroundColor = options.backgroundColor || null;
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = 512;
        canvas.height = 128;
        
        // 绘制背景（如果有）
        if (backgroundColor) {
            context.fillStyle = backgroundColor;
            context.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        // 绘制文本
        context.fillStyle = color;
        context.font = `Bold ${fontSize}px Arial`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(text, canvas.width / 2, canvas.height / 2);
        
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);
        sprite.scale.set(3, 0.75, 1);
        
        return sprite;
    }
    
    // ============================================================
    // 动画循环
    // ============================================================
    
    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
    
    onWindowResize() {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
}

// Export for module usage if needed, but keeps global for script tag
if (typeof module !== 'undefined') {
    module.exports = SVLThreeRenderer;
}

