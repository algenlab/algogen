const { createApp, ref, computed, onMounted, nextTick, onBeforeUnmount, watch } = Vue;

createApp({
    setup() {
        // Data
        const samples = ref([]);
        const allVideos = ref([]);
        const selectedSample = ref(null);
        const pipelineDemos = ref([]);
        const selectedPipelineDemoId = ref('');
        const pipelineStepIndex = ref(0);
        const pipelineAutoplay = ref(false);
        const assetCacheVersion = ref('');
        const filterCategory = ref('All');
        const visibleLimit = ref(9);
        const loading = ref(false);
        const isPlaying = ref(false);
        const speed = ref(1.0);
        const scrolled = ref(false);
        const selectedVideoModal = ref(null);
        const activeRenderMode = ref('manim');
        const comparisonPosition = ref(55);
        const renderModes = [
            { id: 'manim', label: 'Manim', badge: 'HD Video' },
            { id: 'three', label: 'Three.js', badge: 'Live 3D' },
            { id: 'tikz', label: 'TikZ', badge: 'Paper Figure' }
        ];

        const tikzHiddenTaskIds = new Set([
            '4__mergesort_tracker',
            '8__mst_tracker',
            '7__lcs_tracker'
        ]);

        const shouldHideSampleInTikz = (sample) => {
            if (!sample) return false;
            if (sample.id === 'tree_1717') return true;
            return tikzHiddenTaskIds.has(sample.task_id);
        };

        const appendCacheBust = (url, version) => {
            if (!version) return url;
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}v=${encodeURIComponent(version)}`;
        };

        const resolveVideoUrl = (fileOrUrl) => {
            if (!fileOrUrl) return '';
            if (fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://') || fileOrUrl.startsWith('assets/')) {
                return fileOrUrl;
            }
            return `assets/videos/${fileOrUrl}`;
        };

        const resolveTraceUrl = (fileOrUrl) => {
            if (!fileOrUrl) return '';
            if (fileOrUrl.startsWith('http://') || fileOrUrl.startsWith('https://') || fileOrUrl.startsWith('assets/')) {
                return fileOrUrl;
            }
            return `assets/traces/${fileOrUrl}`;
        };
        
        // Renderer instance
        const renderer = ref(null);

        // Categories
        const categories = ['All', 'array', 'dp', 'graph', 'tree', 'sorting', 'hashtable', 'algorithm_analysis'];

        // Computed
        const currentSampleInfo = computed(() => selectedSample.value || {});

        const filteredSamples = computed(() => {
            if (activeRenderMode.value !== 'tikz') return samples.value;
            return samples.value.filter(s => !shouldHideSampleInTikz(s));
        });

        const currentRenderDescription = computed(() => {
            switch (activeRenderMode.value) {
                case 'three':
                    return 'Three.js backend: interactive 3D scene rendered in the browser with orbit controls and real-time playback.';
                case 'manim':
                    return 'Manim backend: high-quality offline video rendering with precise timing, perfect for talks and demo reels.';
                case 'tikz':
                    return 'LaTeX/TikZ backend: vector-quality figures for papers and slides, generated from the same SVL trace.';
                default:
                    return '';
            }
        });
        
        const texContent = ref('Loading .tex source...');

        const lastLoadedTrace = ref(null);
        
        const loadTexContent = async () => {
            if (!selectedSample.value || !selectedSample.value.tex_file) {
                texContent.value = '% No LaTeX source available for this sample.';
                return;
            }
            try {
                const res = await fetch(`assets/tex/${selectedSample.value.tex_file}`);
                if (res.ok) {
                    texContent.value = await res.text();
                } else {
                    texContent.value = `% Error loading tex file: ${res.statusText}`;
                }
            } catch (e) {
                texContent.value = `% Error loading tex file: ${e}`;
            }
        };

        // Watch for changes to load tex content when needed
        watch([selectedSample, activeRenderMode], ([newSample, newMode]) => {
            if (newMode === 'tikz') {
                loadTexContent();
            }
        });

        watch(activeRenderMode, (newMode) => {
            if (newMode !== 'tikz') return;
            if (!selectedSample.value) return;
            if (!shouldHideSampleInTikz(selectedSample.value)) return;

            const next = filteredSamples.value[0] || null;
            if (next) {
                selectedSample.value = next;
                loadSample();
            }
        });

        const currentVideoPath = computed(() => {
            if (!selectedSample.value) return '';
            const url = resolveVideoUrl(selectedSample.value.video_file);
            return appendCacheBust(url, assetCacheVersion.value);
        });

        const currentImagePath = computed(() => {
            if (!selectedSample.value || !selectedSample.value.image_file) return '';
            return `assets/images/${selectedSample.value.image_file}`;
        });

        const filteredVideos = computed(() => {
            let videos = allVideos.value;
            if (filterCategory.value !== 'All') {
                videos = videos.filter(v => v.category === filterCategory.value);
            }
            return videos.slice(0, visibleLimit.value);
        });

        const hasMoreVideos = computed(() => {
            let total = filterCategory.value === 'All' ? allVideos.value.length : allVideos.value.filter(v => v.category === filterCategory.value).length;
            return visibleLimit.value < total;
        });

        // Methods
        const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

        const formatAlgoName = (sample) => {
            if (!sample) return '';
            return `${capitalize(sample.category)} - Task ${sample.task_id}`;
        };

        const loadSample = async () => {
            if (!selectedSample.value) return;
            
            loading.value = true;
            const tracePath = appendCacheBust(resolveTraceUrl(selectedSample.value.trace_file), assetCacheVersion.value);
            
            try {
                const response = await fetch(tracePath);
                const trace = await response.json();

                lastLoadedTrace.value = trace;
                
                if (renderer.value) {
                    // If renderer exists, just load data
                    await renderer.value.loadTrace(trace);
                } else if (activeRenderMode.value === 'three') {
                    // Only init Three.js renderer when the container is visible
                    initRenderer(trace);
                }
            } catch (e) {
                console.error("Failed to load trace:", e);
            } finally {
                loading.value = false;
            }
        };

        const initRenderer = (traceData) => {
            // Check if Three.js and custom renderer class are loaded
            if (typeof SVLThreeRenderer === 'undefined') {
                console.error("SVLThreeRenderer class not found!");
                return;
            }
            
            // Clear previous container if needed
            const container = document.getElementById('three-container');
            container.innerHTML = '';
            
            renderer.value = new SVLThreeRenderer('three-container');
            // In case the container size was not finalized yet
            try {
                renderer.value.onWindowResize();
            } catch (e) {
            }
            if (traceData) {
                renderer.value.loadTrace(traceData);
            }
        };

        const togglePlay = () => {
            if (!renderer.value) return;
            if (isPlaying.value) {
                renderer.value.pause();
            } else {
                renderer.value.play();
            }
            isPlaying.value = !isPlaying.value;
        };

        const updateSpeed = () => {
            if (renderer.value) {
                renderer.value.speed = parseFloat(speed.value);
            }
        };

        const setRenderMode = (mode) => {
            if (activeRenderMode.value === mode) return;
            activeRenderMode.value = mode;

            if (mode === 'three') {
                nextTick(() => {
                    if (!renderer.value) {
                        initRenderer(lastLoadedTrace.value);
                    } else {
                        try {
                            renderer.value.onWindowResize();
                        } catch (e) {
                        }
                        if (lastLoadedTrace.value && !renderer.value.trace) {
                            renderer.value.loadTrace(lastLoadedTrace.value);
                        }
                    }
                });
            } else if (isPlaying.value) {
                // Switching away from the interactive renderer should stop playback.
                try {
                    renderer.value && renderer.value.pause();
                } catch (e) {
                }
                isPlaying.value = false;
            }

            if (typeof gsap !== 'undefined') {
                const box = document.getElementById('render-mode-description');
                if (box) {
                    gsap.fromTo(
                        box,
                        { y: 10, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.4, ease: 'power2.out' }
                    );
                }
            }
        };

        const handleScroll = () => {
            scrolled.value = window.scrollY > 10;
        };

        const openVideo = (video) => {
            selectedVideoModal.value = video;
        };

        const closeVideo = () => {
            selectedVideoModal.value = null;
        };

        const heroTitle = ref("AlgoGen: LLMs as Tool Makers");

        // Decryption Text Effect Logic
        const decryptText = (targetText, elementRef, speed = 50) => {
            const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()";
            let iterations = 0;
            
            const interval = setInterval(() => {
                elementRef.value = targetText
                    .split("")
                    .map((letter, index) => {
                        if (index < iterations) {
                            return targetText[index];
                        }
                        return chars[Math.floor(Math.random() * chars.length)];
                    })
                    .join("");
                
                if (iterations >= targetText.length) {
                    clearInterval(interval);
                }
                
                iterations += 1 / 3; // Control the speed of decryption
            }, speed);
        };

        const playVideoPreview = (event) => {
            const video = event.target;
            if (!video) return;
            if (video.paused) {
                video.muted = true; // Ensure muted for autoplay
                try {
                    if (video.readyState < 2) {
                        video.load();
                        return;
                    }
                } catch (e) {
                }
                video.play().catch(e => {
                    try {
                        if (e && e.name === 'NotSupportedError') {
                            video.load();
                        }
                    } catch (err) {
                    }
                    console.log("Autoplay prevented:", e);
                });
            }
        };

        const pauseVideoPreview = (event) => {
            const video = event.target;
            if (!video.paused) {
                video.pause();
                try {
                    video.currentTime = 0.01;
                } catch (e) {
                }
            }
        };

        const primeVideoPreviewFrame = (event) => {
            const video = event.target;
            if (!video) return;
            if (video.dataset && video.dataset.previewPrimed === '1') return;
            if (video.dataset) video.dataset.previewPrimed = '1';

            try {
                if (!Number.isFinite(video.duration) || video.duration <= 0) {
                    video.currentTime = 0.01;
                    return;
                }
                const t = Math.min(0.1, Math.max(0.01, video.duration * 0.01));
                video.currentTime = t;
            } catch (e) {
            }
        };

        // Lifecycle
        onMounted(async () => {
            // Trigger decryption effect
            decryptText("AlgoGen: LLMs as Tool Makers", heroTitle);

            try {
                window.addEventListener('scroll', handleScroll, { passive: true });
                handleScroll();
                // Load manifest
                const res = await fetch('assets/data.json');
                const lastModified = res.headers ? res.headers.get('Last-Modified') : null;
                const lastModifiedEpoch = lastModified ? Date.parse(lastModified) : NaN;
                const data = await res.json();

                const cacheVersion = Number.isNaN(lastModifiedEpoch)
                    ? ((data.stats && data.stats.assets_version) ? String(data.stats.assets_version) : '')
                    : String(lastModifiedEpoch);

                assetCacheVersion.value = cacheVersion;
                
                pipelineDemos.value = data.pipeline_demos || [];
                if (pipelineDemos.value.length > 0) {
                    selectedPipelineDemoId.value = pipelineDemos.value[0].id;
                }

                const pipelineDemoSamples = (pipelineDemos.value || []).map(d => ({
                    id: d.id,
                    category: d.kind,
                    task_id: (d.source && d.source.task_tag) ? d.source.task_tag : d.id,
                    seed: 'demo',
                    trace_file: (d.artifacts && d.artifacts.trace_file) ? d.artifacts.trace_file : '',
                    video_file: (d.artifacts && d.artifacts.video_file) ? d.artifacts.video_file : ''
                }));

                samples.value = [...(data.samples || []), ...pipelineDemoSamples];

                const sampleVideos = (data.samples || []).map(v => ({
                    ...v,
                    video_file: appendCacheBust(`assets/videos/${v.video_file}`, cacheVersion),
                    isSample: true
                }));

                const algoAnalysisVideos = (data.algorithm_analysis_videos || []).map(v => ({
                    ...v,
                    video_file: appendCacheBust(`assets/videos/${v.video_file}`, cacheVersion),
                    isSample: false
                }));

                // Gallery: 默认展示精选的 algorithm_analysis 视频（如果存在）
                if (algoAnalysisVideos.length > 0) {
                    filterCategory.value = 'All';
                    visibleLimit.value = 9;
                }

                allVideos.value = [...algoAnalysisVideos, ...sampleVideos];

                // Select first sample
                if (samples.value.length > 0) {
                    selectedSample.value = samples.value[0];
                    // Initialize renderer after DOM update
                    nextTick(() => {
                        if (activeRenderMode.value === 'three') {
                            initRenderer(null);
                        }
                        loadSample();
                    });
                }
                
                // Setup GSAP Animations
                setupAnimations();

                // Init Hero 3D Background
                initHeroBackground();

            } catch (e) {
                console.error("Initialization failed:", e);
            }
        });

        onBeforeUnmount(() => {
            window.removeEventListener('scroll', handleScroll);
            stopPipelineAutoplay();
        });

        const isSample = (v) => {
            return samples.value.some(s => s.id === v.id);
        };

        const pipelineSteps = [
            { id: 'input', title: 'Input Digest', subtitle: 'Dataset + goal summarized as structured signals.', badge: 'Digest' },
            { id: 'extract', title: 'Extract & Route', subtitle: 'Blocks parsed; tags derived; artifacts routed.', badge: 'Parser' },
            { id: 'tool', title: 'Tool (Tracker) Digest', subtitle: 'Tracker capabilities summarized as ops + views.', badge: 'Tool' },
            { id: 'trace', title: 'SVL Trace Digest', subtitle: 'IR statistics and key operation patterns.', badge: 'IR' },
            { id: 'render', title: 'Render Outputs', subtitle: 'Deterministic backends: video + interactive playback.', badge: 'Render' }
        ];

        const currentPipelineDemo = computed(() => {
            if (!pipelineDemos.value || pipelineDemos.value.length === 0) return null;
            const id = selectedPipelineDemoId.value;
            return pipelineDemos.value.find(d => d.id === id) || pipelineDemos.value[0];
        });

        const currentPipelineStep = computed(() => pipelineSteps[pipelineStepIndex.value] || pipelineSteps[0]);

        const currentPipelineDigest = computed(() => {
            const demo = currentPipelineDemo.value;
            const step = currentPipelineStep.value;
            if (!demo || !step || !demo.digests) return [];
            const lines = demo.digests[step.id];
            return Array.isArray(lines) ? lines : [];
        });

        const currentPipelineVideoSrc = computed(() => {
            const demo = currentPipelineDemo.value;
            if (!demo || !demo.artifacts || !demo.artifacts.video_file) return '';
            return appendCacheBust(resolveVideoUrl(demo.artifacts.video_file), assetCacheVersion.value);
        });

        let pipelineAutoplayTimer = null;

        const stopPipelineAutoplay = () => {
            pipelineAutoplay.value = false;
            if (pipelineAutoplayTimer) {
                clearInterval(pipelineAutoplayTimer);
                pipelineAutoplayTimer = null;
            }
        };

        const startPipelineAutoplay = () => {
            const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (reduceMotion) {
                stopPipelineAutoplay();
                return;
            }
            stopPipelineAutoplay();
            pipelineAutoplay.value = true;
            pipelineAutoplayTimer = setInterval(() => {
                pipelineStepIndex.value = (pipelineStepIndex.value + 1) % pipelineSteps.length;
            }, 2500);
        };

        const togglePipelineAutoplay = () => {
            if (pipelineAutoplay.value) {
                stopPipelineAutoplay();
            } else {
                startPipelineAutoplay();
            }
        };

        const setPipelineStep = (idx) => {
            stopPipelineAutoplay();
            const n = pipelineSteps.length;
            const clamped = Math.max(0, Math.min(n - 1, idx));
            pipelineStepIndex.value = clamped;
        };

        const pipelineStepPrev = () => {
            stopPipelineAutoplay();
            const n = pipelineSteps.length;
            pipelineStepIndex.value = (pipelineStepIndex.value - 1 + n) % n;
        };

        const pipelineStepNext = () => {
            stopPipelineAutoplay();
            const n = pipelineSteps.length;
            pipelineStepIndex.value = (pipelineStepIndex.value + 1) % n;
        };

        const selectPipelineDemo = (demoId) => {
            stopPipelineAutoplay();
            selectedPipelineDemoId.value = demoId;
            pipelineStepIndex.value = 0;
        };

        const openPipelineDemoInSandbox = async () => {
            stopPipelineAutoplay();
            const demo = currentPipelineDemo.value;
            if (!demo) return;

            const sample = samples.value.find(s => s.id === demo.id);
            if (!sample) return;

            selectedSample.value = sample;
            activeRenderMode.value = 'manim';

            await nextTick();
            await loadSample();

            try {
                const el = document.getElementById('interactive');
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            } catch (e) {
            }
        };

        const setupAnimations = () => {
            if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
                return;
            }

            gsap.registerPlugin(ScrollTrigger);
            
            // Hero background parallax
            gsap.to("#hero-canvas", {
                scrollTrigger: {
                    trigger: "body",
                    start: "top top",
                    end: "bottom top",
                    scrub: true
                },
                y: 200
            });

            // Text decryption effect for hero title/subtitle
            const runDecryption = (selector, duration = 1.5, delay = 0) => {
                const el = document.querySelector(selector);
                if (!el) return;

                const original = el.textContent;
                const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/_-";
                const length = original.length;
                const state = { progress: 0 };

                gsap.fromTo(
                    state,
                    { progress: 0 },
                    {
                        progress: 1,
                        duration,
                        delay,
                        ease: "power2.out",
                        onUpdate: () => {
                            const p = state.progress;
                            let out = "";
                            for (let i = 0; i < length; i++) {
                                if (i / length < p) {
                                    out += original[i];
                                } else {
                                    out += chars[Math.floor(Math.random() * chars.length)];
                                }
                            }
                            el.textContent = out;
                        },
                        onComplete: () => {
                            el.textContent = original;
                        }
                    }
                );
            };

            runDecryption("#hero-title", 1.8, 0.4);
            runDecryption("#hero-subtitle", 1.4, 0.8);

            // Hero code typewriter
            const codeEl = document.getElementById('hero-code-content');
            if (codeEl) {
                const codeLines = [
                    "class Visualizer:",
                    "    def add_node(self, u, v):",
                    "        self.graph.add_edge(u, v)",
                    "        self.trace.append({ 'op': 'addNode', 'id': u })"
                ];
                const full = codeLines.join("\n");
                const state = { length: 0 };

                gsap.fromTo(
                    state,
                    { length: 0 },
                    {
                        length: full.length,
                        duration: 3,
                        delay: 1.0,
                        ease: "none",
                        onUpdate: () => {
                            const n = Math.floor(state.length);
                            const cursor = n % 2 === 0 ? "_" : "";
                            codeEl.textContent = full.slice(0, n) + cursor;
                        },
                        onComplete: () => {
                            codeEl.textContent = full;
                        }
                    }
                );
            }

            // Hero stats fade-up
            if (document.querySelector('.hero-stat')) {
                gsap.from(".hero-stat", {
                    scrollTrigger: {
                        trigger: ".hero-stat",
                        start: "top 80%"
                    },
                    y: 30,
                    opacity: 0,
                    duration: 0.8,
                    stagger: 0.15,
                    ease: "power2.out"
                });
            }

            // Interactive section entrance
            if (document.querySelector('#interactive')) {
                gsap.from('#interactive .container > .flex', {
                    scrollTrigger: {
                        trigger: '#interactive',
                        start: 'top 85%'
                    },
                    y: 40,
                    opacity: 0,
                    duration: 0.8,
                    ease: 'power2.out'
                });

                gsap.from('#interactive .rounded-2xl', {
                    scrollTrigger: {
                        trigger: '#interactive .rounded-2xl',
                        start: 'top 80%'
                    },
                    y: 40,
                    opacity: 0,
                    duration: 0.9,
                    ease: 'power2.out'
                });
            }

            // Why comparison section (Before / After slider)
            if (document.querySelector('#why')) {
                const tlWhy = gsap.timeline({
                    scrollTrigger: {
                        trigger: '#why',
                        start: 'top 80%'
                    }
                });

                tlWhy.from('#why .comparison-wrapper', {
                    y: 40,
                    opacity: 0,
                    duration: 0.9,
                    ease: 'power2.out'
                });

                tlWhy.from('#why .why-metric', {
                    y: 24,
                    opacity: 0,
                    duration: 0.7,
                    stagger: 0.15,
                    ease: 'power2.out'
                }, '-=0.3');

                // Subtle automatic sweep to hint interactivity
                tlWhy.fromTo(
                    comparisonPosition,
                    { value: 30 },
                    {
                        value: 70,
                        duration: 1.4,
                        ease: 'power2.inOut'
                    }
                );
            }

            // Gallery cards reveal
            if (document.querySelector('#gallery .group')) {
                gsap.from("#gallery .group", {
                    scrollTrigger: {
                        trigger: "#gallery",
                        start: "top 80%"
                    },
                    y: 40,
                    opacity: 0,
                    duration: 0.8,
                    stagger: 0.05,
                    ease: 'power2.out'
                });
            }

            // Pipeline Flow Animation (Infinite Loop)
            if (document.querySelector('#pipeline-beam')) {
                // Ensure beam starts from left
                gsap.set("#pipeline-beam", { x: "-100%" });
                
                const pipelineTl = gsap.timeline({ repeat: -1, repeatDelay: 1 });
                
                // 1. Beam movement (Linear flow)
                pipelineTl.to("#pipeline-beam", {
                    x: "100%",
                    duration: 4,
                    ease: "none"
                }, 0);

                // 2. Step Activation (Sequential pulses matching beam position)
                // Step 1 ~ 12%
                pipelineTl.to(".pipeline-step-1 .step-icon", { scale: 1.2, filter: "brightness(1.5)", duration: 0.3, yoyo: true, repeat: 1 }, 0.5);
                pipelineTl.to(".pipeline-step-1", { y: -5, borderColor: "rgba(59,130,246,0.6)", duration: 0.3, yoyo: true, repeat: 1 }, 0.5);
                
                // Step 2 ~ 37%
                pipelineTl.to(".pipeline-step-2 .step-icon", { scale: 1.2, filter: "brightness(1.5)", duration: 0.3, yoyo: true, repeat: 1 }, 1.5);
                pipelineTl.to(".pipeline-step-2", { y: -5, borderColor: "rgba(168,85,247,0.6)", duration: 0.3, yoyo: true, repeat: 1 }, 1.5);
                
                // Step 3 ~ 62%
                pipelineTl.to(".pipeline-step-3 .step-icon", { scale: 1.2, filter: "brightness(1.5)", duration: 0.3, yoyo: true, repeat: 1 }, 2.5);
                pipelineTl.to(".pipeline-step-3", { y: -5, borderColor: "rgba(234,179,8,0.6)", duration: 0.3, yoyo: true, repeat: 1 }, 2.5);
                
                // Step 4 ~ 87%
                pipelineTl.to(".pipeline-step-4 .step-icon", { scale: 1.2, filter: "brightness(1.5)", duration: 0.3, yoyo: true, repeat: 1 }, 3.5);
                pipelineTl.to(".pipeline-step-4", { y: -5, borderColor: "rgba(76,175,80,0.6)", duration: 0.3, yoyo: true, repeat: 1 }, 3.5);
            }
        };

        // Hero 3D Background
        const initHeroBackground = () => {
            const canvasContainer = document.getElementById('hero-canvas');
            if (!canvasContainer) return;

            // Scene Setup
            const scene = new THREE.Scene();
            // Add slight fog for depth
            scene.fog = new THREE.FogExp2(0x050a14, 0.002);

            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.z = 30;
            camera.position.y = 10;
            camera.lookAt(0, 0, 0);

            const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(window.devicePixelRatio);
            canvasContainer.appendChild(renderer.domElement);

            // Particles
            const particlesGeometry = new THREE.BufferGeometry();
            const particlesCount = 2000;
            
            const posArray = new Float32Array(particlesCount * 3);
            
            for(let i = 0; i < particlesCount * 3; i++) {
                posArray[i] = (Math.random() - 0.5) * 100;
            }
            
            particlesGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            
            // Material
            const material = new THREE.PointsMaterial({
                size: 0.2,
                color: 0x4CAF50,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending
            });
            
            // Mesh
            const particlesMesh = new THREE.Points(particlesGeometry, material);
            scene.add(particlesMesh);

            // Animation Loop
            let mouseX = 0;
            let mouseY = 0;
            
            // Mouse interaction
            document.addEventListener('mousemove', (event) => {
                mouseX = event.clientX / window.innerWidth - 0.5;
                mouseY = event.clientY / window.innerHeight - 0.5;
            });

            // Handle resize
            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });

            const clock = new THREE.Clock();

            const animate = () => {
                requestAnimationFrame(animate);
                const elapsedTime = clock.getElapsedTime();

                // Rotate entire system slowly
                particlesMesh.rotation.y = elapsedTime * 0.05;
                particlesMesh.rotation.x = mouseY * 0.5;
                particlesMesh.rotation.z = mouseX * 0.5;

                // Wave effect
                const positions = particlesGeometry.attributes.position.array;
                for(let i = 0; i < particlesCount; i++) {
                    const x = positions[i * 3];
                    // const y = positions[i * 3 + 1];
                    const z = positions[i * 3 + 2];

                    // Sine wave movement based on x/z position and time
                    positions[i * 3 + 1] = Math.sin(elapsedTime + x * 0.5) * 2 + Math.cos(elapsedTime + z * 0.5) * 2;
                }
                particlesGeometry.attributes.position.needsUpdate = true;

                renderer.render(scene, camera);
            };

            animate();
        };

        return {
            samples,
            filteredSamples,
            allVideos,
            selectedSample,
            pipelineDemos,
            selectedPipelineDemoId,
            pipelineSteps,
            pipelineStepIndex,
            pipelineAutoplay,
            currentPipelineDemo,
            currentPipelineStep,
            currentPipelineDigest,
            currentPipelineVideoSrc,
            filterCategory,
            visibleLimit,
            loading,
            isPlaying,
            speed,
            scrolled,
            categories,
            renderer,
            currentSampleInfo,
            activeRenderMode,
            renderModes,
            currentRenderDescription,
            texContent,
            currentVideoPath,
            currentImagePath,
            filteredVideos,
            hasMoreVideos,
            comparisonPosition,
            capitalize,
            formatAlgoName,
            loadSample,
            togglePlay,
            updateSpeed,
            setRenderMode,
            selectedVideoModal,
            openVideo,
            closeVideo,
            heroTitle,
            playVideoPreview,
            pauseVideoPreview,
            primeVideoPreviewFrame,
            selectPipelineDemo,
            setPipelineStep,
            pipelineStepPrev,
            pipelineStepNext,
            togglePipelineAutoplay,
            openPipelineDemoInSandbox
        };
    }
}).mount('#app');
