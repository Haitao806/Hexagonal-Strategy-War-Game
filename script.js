console.log("--- script.js 开始加载 ---"); 

const CONFIG = {
    MAP: {
        CONTAINER_ID: 'map-container',
        HEX_SIZE: 30,
        ROWS: 10,
        COLS: 15,
        BOUNDS: {
            minLat: 37.25,
            maxLat: 38.75,
            minLon: 125.0,
            maxLon: 129.0
        }
    },
    GAME: {
        FACTIONS: ['US', 'ROK', 'DPRK', 'PLA']
    }
};

// --- 游戏状态管理 ---
const GameState = {
    map: {
        grid: [],
        selectedUnit: null,
        targetHex: null,
        movementPath: [],
        possibleMoves: [],
        possibleAttacks: []
    },
    turn: {
        current: 1,
        faction: 'US', // 默认从US开始
        actionsTaken: [],
        phase: 'select' // select, move, attack, end
    },
    loading: {
        isLoading: true,
        isDataLoaded: false,
        status: '',
        error: null,
    },
    init: {
        isInitialized: false,
        playerFaction: null
    },
    gameOver: false,
    winner: null,
    processingAITurn: false, // 新增：标记AI是否正在处理其回合
    eliminatedFactions: new Set() // 新增：记录已被消灭的阵营
};

// --- 单位配置 ---
const UNIT_TYPES = {
    infantry: {
        name: 'Infantry', // 步兵 -> Infantry
        type: 'infantry',
        stats: {
            maxHealth: 10,
            attack: 10,
            defense: 2,
            movement: 7,
            range: 1
        },
        icon: 'Inf' // 步 -> Inf (short for Infantry)
    },
    tank: {
        name: 'Tank', // 坦克 -> Tank
        type: 'tank',
        stats: {
            maxHealth: 500, // 原来是 100
            attack: 100,    // 原来是 500
            defense: 10,
            movement: 2,
            range: 3
        },
        icon: 'Tnk' // 坦 -> Tnk (short for Tank)
    },
    artillery: {
        name: 'Artillery', // 炮台 -> Artillery
        type: 'artillery',
        stats: {
            maxHealth: 20,    // 原来是 50
            attack: 500,   // 原来是 1000
            defense: 5,
            movement: 1,
            range: 6
        },
        icon: 'Arty' // 炮 -> Arty (short for Artillery)
    }
};

// --- 地形配置 ---
const TERRAIN_TYPES = {
    plain: {
        name: '平原',
    },
    forest: {
        name: '森林',
    },
    rock: {
        name: '岩块',
    },
    water: { 
        name: '水域',
    }
};

// --- 错误处理工具 ---
const GameError = {
    throw: (message, code) => {
        const timestamp = new Date().toISOString();
        const fullMessage = `[${timestamp}] [错误 ${code}]: ${message}`;
        console.error(fullMessage);
        throw new Error(`${code}: ${message}`);
    },
    log: (message, type = 'info') => {
        const timestamp = new Date().toISOString();
        const fullMessage = `[${timestamp}] ${message}`;
        if (typeof console[type] === 'function') {
            console[type](fullMessage);
        } else {
            console.log(`[${type.toUpperCase()}] ${fullMessage}`);
        }
    }
};

/**
 * 网络请求辅助函数
 */
async function fetchWithTimeout(resource, options = {}, timeout = 8000) {
    GameError.log(`执行本地资源请求: ${typeof resource === 'string' ? resource : resource.url}`);
    try {
        const response = await fetch(resource, options);
        GameError.log(`成功获取本地资源`);
        return response;
    } catch (error) {
        GameError.log(`本地资源请求失败: ${error.message}`, 'error');
        throw error;
    }
}

// --- 事件监听器设置 ---
document.addEventListener('DOMContentLoaded', () => {
    GameError.log("DOM加载完成，设置事件监听器...");
    
    // 检查关键元素是否存在
    const loadingScreen = document.getElementById('loading-screen');
    const factionSelection = document.getElementById('faction-selection');
    const gameInterface = document.getElementById('game-interface');
    
    if (!loadingScreen || !factionSelection || !gameInterface) {
        GameError.log("关键UI元素缺失，无法初始化", "error");
        alert("页面加载不完整，请刷新重试");
        return;
    }
    
    // 初始隐藏加载屏幕
    loadingScreen.style.display = 'none';
    GameState.loading.isLoading = false;
    GameError.log("初始加载屏幕已隐藏");

    // 显示阵营选择
    factionSelection.style.display = 'block';
    GameError.log("阵营选择界面已显示");
    
    // 设置阵营选择按钮的事件监听
    const factionButtons = factionSelection.querySelectorAll('.faction-button');
    factionButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            const faction = e.currentTarget.getAttribute('data-faction');
            if (faction) {
                GameError.log(`用户点击了阵营按钮: ${faction.toUpperCase()}`);
                selectFactionAndStartGame(faction.toUpperCase());
            }
        });
    });
    GameError.log(`已为 ${factionButtons.length} 个阵营按钮添加事件监听`);

    // 添加结束回合按钮的事件监听
    const endTurnButton = document.getElementById('end-turn-button');
    if (endTurnButton) {
        endTurnButton.addEventListener('click', endTurn);
    }
});

/**
 * 选择阵营并开始游戏的主流程
 */
async function selectFactionAndStartGame(selectedFaction) {
    GameError.log(`开始游戏流程，选择阵营: ${selectedFaction}`);

    // 防止重复初始化
    if (GameState.init.isInitialized) {
        GameError.log('游戏已初始化，忽略此次选择', 'warn');
        return;
    }

    // 验证阵营选择
    if (!CONFIG.GAME.FACTIONS.includes(selectedFaction)) {
        GameError.log('Invalid faction selection', 'error'); // 无效的阵营选择
        alert('Invalid faction selected'); // 选择了无效的阵营
        return;
    }
    
    // 初始化或重置游戏状态中与一局游戏相关的部分
    GameState.eliminatedFactions = new Set();
    GameState.turn.current = 1;
    GameState.gameOver = false;
    GameState.winner = null;
    // 其他可能需要在一局开始时重置的状态...

    const factionSelector = document.getElementById('faction-selection');
    const gameInterface = document.getElementById('game-interface');

    // 更新状态并显示加载
    GameState.init.playerFaction = selectedFaction;
    GameState.turn.faction = selectedFaction;
    GameState.loading.isLoading = true;
    
    // UI 切换
    if (factionSelector) factionSelector.style.display = 'none';
    if (gameInterface) gameInterface.style.display = 'none';
    showLoadingScreen();
    updateLoadingStatus('正在初始化游戏...');

    try {
        // 执行核心游戏初始化
        await initializeGameCore();
        
        // 初始化成功
        GameState.init.isInitialized = true;
        GameState.loading.isLoading = false;
        hideLoadingScreen();
        showGameInterface();
        updateGameInfoUI();
        GameError.log('游戏初始化成功并启动', 'success');

    } catch (error) {
        // 初始化失败
        GameState.loading.isLoading = false;
        hideLoadingScreen();
        GameError.log(`游戏初始化失败: ${error.message}`, 'error');
        alert(`Failed to load game: ${error.message}\nPlease refresh the page and try again.`); // 游戏加载失败...
        
        // 重置 UI 到初始状态
        if (gameInterface) gameInterface.style.display = 'none'; 
        if (factionSelector) factionSelector.style.display = 'block'; 
    }
}

/**
 * 核心游戏初始化逻辑
 */
async function initializeGameCore() {
    console.log("=== 核心游戏初始化开始 ===");
    updateLoadingText('初始化核心游戏组件...');
    
    try {
        console.log("设置地图网格...");
        await setupMapGrid();
        updateLoadingText('地图网格设置完毕。');

        console.log("获取并处理地形数据...");
        const terrainData = await fetchTerrainData();
        if (terrainData) {
            await processTerrainData(terrainData);
            updateLoadingText('地形数据处理完毕。');
        } else {
            console.warn("未能获取地形数据，将使用默认地形。");
            await processTerrainData(null);
            updateLoadingText('使用默认地形配置。');
        }

        console.log("放置初始单位...");
        placeInitialUnits();
        updateLoadingText('初始单位已部署。');

        console.log("渲染地图...");
        renderMap(); 
        updateLoadingText('地图渲染完成。');

        console.log("更新游戏信息UI...");
        updateGameInfoUI();
        updateLoadingText('游戏界面准备就绪。');
        
        console.log("=== 核心游戏初始化完成 ===");
        GameState.init.isInitialized = true;
        
    } catch (error) {
        handleLoadingError(error, "核心游戏初始化");
        throw error; 
    }
}

/**
 * 设置地图网格
 */
function setupMapGrid() {
    return new Promise((resolve) => {
        console.log('设置地图网格...');
        GameState.map.grid = [];
        for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
            const row = [];
            for (let c = 0; c < CONFIG.MAP.COLS; c++) {
                row.push({
                    row: r,
                    col: c,
                    terrain: 'plain',
                    unit: null,
                    owner: null
                });
            }
            GameState.map.grid.push(row);
        }
        console.log(`创建了 ${CONFIG.MAP.ROWS}x${CONFIG.MAP.COLS} 的基础网格`);
        resolve();
    });
}

/**
 * 创建单位
 */
function createUnit(type, faction, isNewlyCreated = false) {
    const baseUnit = UNIT_TYPES[type];
    
    // 深拷贝基本单位数据
    const unit = {
        type,
        faction,
        stats: { ...baseUnit.stats },
        health: baseUnit.stats.maxHealth,
        isNewlyCreated: isNewlyCreated // 标记是否是新生成的单位
    };
    
    return unit;
}

/**
 * 在地图上放置所有四个阵营的初始单位
 */
function placeInitialUnits() {
    console.log('放置所有阵营的初始单位...');

    // 定义起始区域，为每个国家划分初始8个格子
    const startingAreas = {
        US: { rowRange: [7, 9], colRange: [0, 3] },               // 左下角
        ROK: { rowRange: [7, 9], colRange: [11, 14] },            // 右下角
        DPRK: { rowRange: [0, 2], colRange: [0, 3] },             // 左上角
        PLA: { rowRange: [0, 2], colRange: [11, 14] }             // 右上角
    };

    // 为每个阵营放置初始单位和标记领土
    CONFIG.GAME.FACTIONS.forEach(faction => {
        const area = startingAreas[faction];
        if (!area) return;

        // 每个国家的初始单位：3个步兵、1个坦克、1个炮台
        const unitComposition = [
            { type: 'infantry', count: 3 },
            { type: 'tank', count: 1 },
            { type: 'artillery', count: 1 }
        ];

        // 标记初始领土（8个格子）
        for (let r = area.rowRange[0]; r <= area.rowRange[1]; r++) {
            for (let c = area.colRange[0]; c <= area.colRange[1]; c++) {
                if (GameState.map.grid[r] && GameState.map.grid[r][c]) {
                    GameState.map.grid[r][c].owner = faction;
                }
            }
        }

        let attempts = 0;
        const maxAttempts = 100;

        // 按照预定义的单位组成放置单位
        for (const composition of unitComposition) {
            let placedOfType = 0;
            while (placedOfType < composition.count && attempts < maxAttempts) {
                attempts++;
                const r = Math.floor(Math.random() * (area.rowRange[1] - area.rowRange[0] + 1)) + area.rowRange[0];
                const c = Math.floor(Math.random() * (area.colRange[1] - area.colRange[0] + 1)) + area.colRange[0];

                // 检查是否是有效位置（不是岩块且没有单位）
                if (GameState.map.grid[r] && GameState.map.grid[r][c] && 
                    !GameState.map.grid[r][c].unit && 
                    GameState.map.grid[r][c].terrain !== 'rock') {
                    GameState.map.grid[r][c].unit = createUnit(composition.type, faction);
                    placedOfType++;
                    console.log(`在 [${r},${c}] 为 ${faction} 放置了 ${composition.type}`);
                }
            }
        }
    });

    console.log('所有初始单位放置完毕。');
}

/**
 * 将经纬度坐标转换为网格坐标
 */
function latLonToGrid(lat, lon) {
    if (lat < CONFIG.MAP.BOUNDS.minLat || lat > CONFIG.MAP.BOUNDS.maxLat ||
        lon < CONFIG.MAP.BOUNDS.minLon || lon > CONFIG.MAP.BOUNDS.maxLon) {
        return null;
    }

    const latRange = CONFIG.MAP.BOUNDS.maxLat - CONFIG.MAP.BOUNDS.minLat;
    const lonRange = CONFIG.MAP.BOUNDS.maxLon - CONFIG.MAP.BOUNDS.minLon;

    const normalizedLat = (CONFIG.MAP.BOUNDS.maxLat - lat) / latRange;
    const normalizedLon = (lon - CONFIG.MAP.BOUNDS.minLon) / lonRange;

    let row = Math.floor(normalizedLat * CONFIG.MAP.ROWS);
    let col = Math.floor(normalizedLon * CONFIG.MAP.COLS);

    row = Math.max(0, Math.min(CONFIG.MAP.ROWS - 1, row));
    col = Math.max(0, Math.min(CONFIG.MAP.COLS - 1, col));

    return { row, col };
}

/**
 * 获取地形数据
 */
async function fetchTerrainData() {
    updateLoadingStatus('Loading');
    updateLoadingText('正在准备地形数据...');
    
    // 创建默认地形数据
    const defaultTerrainData = {
        elements: []
    };
    
    // 添加一些随机地形元素 - 岩块（控制数量和分布）
    // 岩块数量减少为8个，避免过多阻挡
    for (let i = 0; i < 8; i++) {
        // 避免在地图边缘和中心区域生成岩块
        // 计算地图中心
        const centerLat = (CONFIG.MAP.BOUNDS.minLat + CONFIG.MAP.BOUNDS.maxLat) / 2;
        const centerLon = (CONFIG.MAP.BOUNDS.minLon + CONFIG.MAP.BOUNDS.maxLon) / 2;
        
        // 计算地图尺寸的20%作为边缘区域避免放置
        const latRange = (CONFIG.MAP.BOUNDS.maxLat - CONFIG.MAP.BOUNDS.minLat) * 0.2;
        const lonRange = (CONFIG.MAP.BOUNDS.maxLon - CONFIG.MAP.BOUNDS.minLon) * 0.2;
        
        // 随机选择一个区域，避开中心和边缘
        let lat, lon;
        
        // 避开中心区域
        const avoidCenter = Math.random() > 0.5;
        if (avoidCenter) {
            // 在远离中心的区域生成
            lat = Math.random() > 0.5 
                ? CONFIG.MAP.BOUNDS.minLat + Math.random() * latRange * 2 
                : CONFIG.MAP.BOUNDS.maxLat - Math.random() * latRange * 2;
                
            lon = Math.random() > 0.5 
                ? CONFIG.MAP.BOUNDS.minLon + Math.random() * lonRange * 2 
                : CONFIG.MAP.BOUNDS.maxLon - Math.random() * lonRange * 2;
        } else {
            // 避开四个角落区域的生成
            lat = CONFIG.MAP.BOUNDS.minLat + latRange + Math.random() * (CONFIG.MAP.BOUNDS.maxLat - CONFIG.MAP.BOUNDS.minLat - 2 * latRange);
            lon = CONFIG.MAP.BOUNDS.minLon + lonRange + Math.random() * (CONFIG.MAP.BOUNDS.maxLon - CONFIG.MAP.BOUNDS.minLon - 2 * lonRange);
        }
        
        defaultTerrainData.elements.push({
            type: 'node',
            tags: { natural: 'rock' },
            lat: lat,
            lon: lon
        });
    }
    
    // 森林
    for (let i = 0; i < 30; i++) {
        defaultTerrainData.elements.push({
            type: 'node',
            tags: { natural: 'wood' },
            lat: CONFIG.MAP.BOUNDS.minLat + Math.random() * (CONFIG.MAP.BOUNDS.maxLat - CONFIG.MAP.BOUNDS.minLat),
            lon: CONFIG.MAP.BOUNDS.minLon + Math.random() * (CONFIG.MAP.BOUNDS.maxLon - CONFIG.MAP.BOUNDS.minLon)
        });
    }
    
    // 水域
    for (let i = 0; i < 15; i++) {
        defaultTerrainData.elements.push({
            type: 'node',
            tags: { natural: 'water' },
            lat: CONFIG.MAP.BOUNDS.minLat + Math.random() * (CONFIG.MAP.BOUNDS.maxLat - CONFIG.MAP.BOUNDS.minLat),
            lon: CONFIG.MAP.BOUNDS.minLon + Math.random() * (CONFIG.MAP.BOUNDS.maxLon - CONFIG.MAP.BOUNDS.minLon)
        });
    }
    
    GameError.log(`已生成默认地形数据 (${defaultTerrainData.elements.length} 个要素)`);
    GameState.loading.isDataLoaded = true;
    return defaultTerrainData;
}

/**
 * 处理地形数据
 */
async function processTerrainData(data) {
    console.log("=== 开始处理地形数据 ===");
    updateLoadingText('正在处理地形数据...');
    
    if (!GameState.map.grid || GameState.map.grid.length === 0) {
        GameError.log("地图网格未初始化，正在重新初始化...", 'warn');
        await setupMapGrid(); 
    }
    
    console.log("设置默认地形（平原）...");
    for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
        for (let c = 0; c < CONFIG.MAP.COLS; c++) {
            if (GameState.map.grid[r]?.[c]) {
                GameState.map.grid[r][c].terrain = 'plain';
            }
        }
    }

    if (data && data.elements && data.elements.length > 0) {
        console.log(`开始处理 ${data.elements.length} 个地形元素...`);
        
        const terrainPriority = { 'rock': 3, 'forest': 2, 'plain': 1, 'water': 0 }; 
        let terrainCounts = { rock: 0, forest: 0, plain: 0, water: 0 };

        const processElement = async (element, index) => {
            if (index % 5000 === 0) {
                console.log(`已处理 ${index}/${data.elements.length} 个元素...`);
            }

            let currentTerrainType = 'plain'; 
            const tags = element.tags || {};

            if (tags.natural === 'water') {
                currentTerrainType = 'water';
            } else if (tags.natural === 'wood' || tags.landuse === 'forest') {
                currentTerrainType = 'forest';
            } else if (tags.natural === 'rock') {  // 改为检查rock标签
                currentTerrainType = 'rock';
            }

            if (currentTerrainType !== 'plain') {
                terrainCounts[currentTerrainType]++;
            }

            try {
                if (element.type === 'node' && typeof element.lat === 'number' && typeof element.lon === 'number') {
                    const gridCoords = latLonToGrid(element.lat, element.lon);
                    if (gridCoords) {
                        const { row, col } = gridCoords;
                        if (GameState.map.grid[row]?.[col]) {
                            if (terrainPriority[currentTerrainType] > terrainPriority[GameState.map.grid[row][col].terrain]) {
                                GameState.map.grid[row][col].terrain = currentTerrainType;
                                
                                // 如果是岩块地形，移除该格子上的单位（如果有）
                                if (currentTerrainType === 'rock' && GameState.map.grid[row][col].unit) {
                                    console.log(`在 [${row},${col}] 放置岩块，移除了该位置的单位`);
                                    GameState.map.grid[row][col].unit = null;
                                }
                            }
                        }
                    } 
                } 
            } catch (error) {
                GameError.log(`处理元素 ${element.id} 时发生错误: ${error.message}`, 'error');
            }
        };
        
        const batchSize = 5000;
        for(let i = 0; i < data.elements.length; i += batchSize) {
            const batch = data.elements.slice(i, i + batchSize);
            updateLoadingText(`处理地形数据批次 ${Math.ceil((i+1)/batchSize)}...`);
            for (let j = 0; j < batch.length; j++) {
                await processElement(batch[j], i + j);
            }
            await new Promise(r => setTimeout(r, 10)); 
        }

        console.log("地形处理统计:");
        console.log(`- 岩块: ${terrainCounts.rock}`);
        console.log(`- 森林: ${terrainCounts.forest}`);
        console.log(`- 水域: ${terrainCounts.water}`);
    } else {
        console.log("使用默认地形配置（无有效地形数据）");
        updateLoadingText('使用默认地形配置...');
    }
    
    console.log("=== 地形数据处理完成 ===");
}

/**
 * 渲染地图
 */
function renderMap() {
    const mapContainer = document.getElementById(CONFIG.MAP.CONTAINER_ID);
    if (!mapContainer) {
        console.error('找不到地图容器元素！');
        return;
    }
    mapContainer.innerHTML = '';

    for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
        if (!GameState.map.grid[r]) continue; 
        for (let c = 0; c < CONFIG.MAP.COLS; c++) {
            if (!GameState.map.grid[r][c]) continue; 
            
            try {
                const hex = document.createElement('div');
                hex.className = 'hex';
                hex.setAttribute('data-row', r);
                hex.setAttribute('data-col', c);
                const {x, y} = calculateHexPosition(r, c);
                hex.style.left = x + 'px';
                hex.style.top = y + 'px';
                hex.style.width = (CONFIG.MAP.HEX_SIZE * 2) + 'px';
                hex.style.height = (CONFIG.MAP.HEX_SIZE * Math.sqrt(3)) + 'px';

                // 显示格子的所有权
                const owner = GameState.map.grid[r][c].owner;
                if (owner) {
                    hex.classList.add(`faction-${owner.toLowerCase()}`);

                    // 添加国旗
                    const flagImg = document.createElement('img');
                    flagImg.className = 'faction-flag';
                    // 国旗图片直接在 images 目录下
                    const flagSrc = `images/${owner.toLowerCase()}.png`;
                    flagImg.src = flagSrc;
                    flagImg.alt = `${owner} Flag`;
                    flagImg.title = `${owner} Territory`;
                    flagImg.onerror = () => {
                        // 如果图片加载失败，显示阵营缩写
                        flagImg.style.display = 'none'; // 隐藏损坏的图片图标
                        const flagFallback = document.createElement('span');
                        flagFallback.className = 'faction-flag-fallback';
                        flagFallback.textContent = owner.substring(0, 2).toUpperCase();
                        hex.appendChild(flagFallback);
                        console.warn(`Flag image not found: ${flagSrc}. Displaying fallback.`);
                    };
                    hex.appendChild(flagImg);
                }

                const terrainType = GameState.map.grid[r][c].terrain;
                hex.classList.add(`terrain-${terrainType}`);

                const unit = GameState.map.grid[r][c].unit;
                if (unit) {
                    const unitDiv = document.createElement('div');
                    unitDiv.className = `unit unit-${unit.faction.toLowerCase()}`;
                    
                    // 如果是新生成的单位，添加视觉指示器
                    if (unit.isNewlyCreated) {
                        unitDiv.classList.add('newly-created');
                        
                        // 添加"新"标记
                        const newMarker = document.createElement('span');
                        newMarker.className = 'new-unit-marker';
                        newMarker.textContent = '新';
                        unitDiv.appendChild(newMarker);
                    }
                    
                    const unitImg = document.createElement('img');
                    const imgPath = `images/${unit.faction.toLowerCase()}_${unit.type}.png`;
                    unitImg.src = imgPath;
                    // 使用英文名称
                    unitImg.alt = `${unit.faction} ${UNIT_TYPES[unit.type].name}`;
                    // 更新 title 提示
                    unitImg.title = `${unit.faction} ${UNIT_TYPES[unit.type].name} (HP: ${unit.health}/${unit.stats.maxHealth})${unit.isNewlyCreated ? ' - Cannot act this turn' : ''}`;
                    unitImg.onerror = () => { 
                        console.warn(`Image loading failed: ${imgPath}`);
                        unitDiv.style.backgroundColor = getComputedStyle(document.documentElement).getPropertyValue(`--faction-${unit.faction.toLowerCase()}-color`) || '#888'; 
                        unitDiv.textContent = UNIT_TYPES[unit.type].icon || '?'; // 使用英文缩写图标
                        unitImg.style.display = 'none';
                    };
                    unitDiv.appendChild(unitImg);
                    hex.appendChild(unitDiv);
                }

                hex.addEventListener('click', () => handleHexClick(r, c));
                mapContainer.appendChild(hex);
            } catch (e) {
                console.error(`Error rendering hex (${r}, ${c}):`, e);
            }
        }
    }
}

/**
 * 更新游戏信息UI
 */
function updateGameInfoUI() {
    document.getElementById('current-faction').textContent = `${GameState.turn.faction} (${GameState.turn.faction === GameState.init.playerFaction ? 'Player' : 'AI'})`;
    document.getElementById('current-turn').textContent = GameState.turn.current;
}

/**
 * 处理六边形点击
 */
function handleHexClick(row, col) {
    if (GameState.processingAITurn) {
        GameError.log("玩家在AI回合处理期间点击，已忽略。");
        showTemporaryMessage("AI is taking its turn, please wait...", 1500);
        return;
    }
    if (!GameState.map.grid[row] || !GameState.map.grid[row][col]) return;
    if (GameState.gameOver) return;

    const clickedHex = GameState.map.grid[row][col];
    console.log(`点击了位置 [${row}, ${col}], 地形: ${clickedHex.terrain}`);
    
    // 岩块格子不可通行且不可选中
    if (clickedHex.terrain === 'rock') {
        showTemporaryMessage('Rocks are impassable'); // 岩块不可通行
        return;
    }

    // 根据当前阶段处理点击
    switch (GameState.turn.phase) {
        case 'select':
            handleUnitSelection(row, col);
            break;
        case 'move':
            handleUnitMovement(row, col);
            break;
        case 'attack':
            handleUnitAttack(row, col);
            break;
    }
}

/**
 * 处理单位选择
 */
function handleUnitSelection(row, col) {
    // 当重新选择单位时，清除之前可能选中的攻击目标
    if (GameState.map.targetHex) {
        GameState.map.targetHex = null;
    }
    
    const clickedHex = GameState.map.grid[row][col];
    
    // 如果点击的是单位
    if (clickedHex.unit) {
        // 只能选择当前回合阵营的单位
        if (clickedHex.unit.faction === GameState.turn.faction) {
            // 检查该单位是否已执行过行动
            if (GameState.turn.actionsTaken.includes(`${row},${col}`)) {
                showTemporaryMessage('This unit has already acted this turn'); // 该单位本回合已行动
                return;
            }
            
            // 检查该单位是否是新生成的单位
            if (clickedHex.unit.isNewlyCreated) {
                showTemporaryMessage('Newly created units must wait until next turn to act'); // 新生成的单位需要等到下个回合才能行动
                return;
            }
            
            // 选择单位
            GameState.map.selectedUnit = {
                unit: clickedHex.unit,
                row: row,
                col: col
            };
            
            // 计算可移动格子和可攻击格子
            calculatePossibleMoves();
            calculatePossibleAttacks();
            
            // 更新UI，高亮显示可移动和可攻击的格子
            highlightPossibleActions();
            
            // 更新阶段
            GameState.turn.phase = 'move';
            updateStatusMessage('Move or Attack'); // 选择移动位置或攻击目标
        } else {
            showTemporaryMessage('Cannot select units of another faction'); // 不能选择其他阵营的单位
        }
    } else {
        // 注意：初始状态栏消息已在HTML中改为英文 "Select a unit"
        // 如果需要在这里也提示，则取消注释下一行
        // showTemporaryMessage('Please select a unit'); // 请选择一个单位
    }
}

/**
 * 处理单位移动
 */
function handleUnitMovement(row, col) {
    const targetHex = GameState.map.grid[row][col];
    const selectedUnit = GameState.map.selectedUnit;
    
    if (!selectedUnit) return;
    
    // 取消选择
    if (row === selectedUnit.row && col === selectedUnit.col) {
        cancelSelection();
        return;
    }
    
    // 检查是否是可移动位置
    const isPossibleMove = GameState.map.possibleMoves.some(pos => pos.row === row && pos.col === col);
    
    if (isPossibleMove) {
        // 执行移动
        moveUnit(selectedUnit.row, selectedUnit.col, row, col);
        
        // 如果移动到其他阵营的格子，则占领该格子
        if (targetHex.owner !== selectedUnit.unit.faction) {
            // 占领格子
            const oldOwner = targetHex.owner;
            targetHex.owner = selectedUnit.unit.faction;
            
            // 如果是无主格子，则产生一个步兵
            if (oldOwner === null) {
                // 获取可用于放置新单位的相邻格子（不是岩块且没有单位）
                const validAdjacentHexes = getAdjacentHexes(row, col).filter(hex => 
                    GameState.map.grid[hex.row] && 
                    GameState.map.grid[hex.row][hex.col] && 
                    !GameState.map.grid[hex.row][hex.col].unit && 
                    GameState.map.grid[hex.row][hex.col].terrain !== 'rock'
                );
                
                if (validAdjacentHexes.length > 0) {
                    // 随机选择一个有效的相邻格子
                    const randomIndex = Math.floor(Math.random() * validAdjacentHexes.length);
                    const newUnitHex = validAdjacentHexes[randomIndex];
                    
                    // 创建新单位，并标记为新生成的
                    GameState.map.grid[newUnitHex.row][newUnitHex.col].unit = createUnit('infantry', selectedUnit.unit.faction, true);
                    showTemporaryMessage('Captured neutral hex, gained an Infantry (acts next turn)'); // 占领无主格子，获得一个步兵（下回合可行动）
                } else {
                    showTemporaryMessage('Captured neutral hex, but no space for new unit'); // 占领无主格子，但周围没有空间放置新单位
                }
            }
        }
        
        // 检查单位合并条件
        checkAndMergeUnits(row, col);
        
        // 标记该单位已行动
        GameState.turn.actionsTaken.push(`${row},${col}`);
        
        // 更新阶段
        GameState.turn.phase = 'select';
        
        // 检查胜利条件
        checkVictoryConditions();
        
        // 重新渲染地图
        renderMap();
        
        // 更新UI信息
        updateGameInfoUI();
    } else if (GameState.map.possibleAttacks.some(pos => pos.row === row && pos.col === col)) {
        // 如果点击的是可攻击格子，设置目标，切换到攻击阶段，并更新高亮
        GameState.map.targetHex = { row, col }; 
        GameState.turn.phase = 'attack';
        
        clearHighlights();           // 清除旧高亮
        highlightPossibleActions(); // 应用新高亮 (包括 .selected 和 .action-target)
        
        updateStatusMessage(`Preparing to attack unit at [${row},${col}]`); // 准备攻击 [r,c] 的单位
        
        // 立即执行攻击
        handleUnitAttack(row, col);
    } else {
        // 非法移动或点击了非预期格子
        const clickedHexData = GameState.map.grid[row][col];
        GameError.log(`玩家点击了非移动/攻击目标格: [${row}, ${col}]. 地形: ${clickedHexData.terrain}, 单位: ${JSON.stringify(clickedHexData.unit)}`);
        GameError.log(`当前计算的可攻击列表 (possibleAttacks): ${JSON.stringify(GameState.map.possibleAttacks)}`);
        
        // 检查点击的格子是否在可攻击列表的坐标中，但因为其他原因.some()返回false
        let foundInPossibleAttacksForDebug = false;
        for (const attackPos of GameState.map.possibleAttacks) {
            if (attackPos.row === row && attackPos.col === col) {
                foundInPossibleAttacksForDebug = true;
                break;
            }
        }
        GameError.log(`调试检查：点击的格子 [${row},${col}] 是否在 possibleAttacks 列表中？ ${foundInPossibleAttacksForDebug}`);

        showTemporaryMessage('Cannot move or attack this location'); // 不能移动或攻击该位置
    }
}

/**
 * 处理单位攻击
 */
function handleUnitAttack(row, col) {
    const targetHex = GameState.map.grid[row][col];
    const selectedUnit = GameState.map.selectedUnit;
    
    if (!selectedUnit) return;
    
    // 取消选择
    if (row === selectedUnit.row && col === selectedUnit.col) {
        cancelSelection();
        return;
    }
    
    // 检查是否是可攻击位置
    const isPossibleAttack = GameState.map.possibleAttacks.some(pos => pos.row === row && pos.col === col);
    
    if (isPossibleAttack && targetHex.unit) {
        // 执行攻击
        const attackerUnit = selectedUnit.unit;
        const defenderUnit = targetHex.unit;
        
        // 计算伤害
        const damage = calculateDamage(attackerUnit, defenderUnit);
        
        // 应用伤害
        defenderUnit.health -= damage;
        showTemporaryMessage(`Dealt ${damage} damage`); // 造成 X 点伤害
        
        // 检查是否击败单位
        if (defenderUnit.health <= 0) {
            targetHex.unit = null;
            showTemporaryMessage(`${defenderUnit.faction}'s ${UNIT_TYPES[defenderUnit.type].name} defeated`); // XX 的 XX 被击败
            
            // 如果击败的是最后一个单位，检查胜利条件
            checkVictoryConditions();
        }
        
        // 标记该单位已行动
        GameState.turn.actionsTaken.push(`${selectedUnit.row},${selectedUnit.col}`);
        
        // 更新阶段
        GameState.turn.phase = 'select';
        
        // 清除选择
        GameState.map.selectedUnit = null;
        GameState.map.targetHex = null;
        
        // 清除高亮
        clearHighlights();
        
        // 重新渲染地图
        renderMap();
    } else {
        showTemporaryMessage('Cannot attack this location'); // 不能攻击该位置
    }
}

/**
 * 计算伤害
 */
function calculateDamage(attacker, defender) {
    const attackPower = attacker.stats.attack;
    const defense = defender.stats.defense;
    
    // 伤害计算公式：攻击力 - 防御力/2，最小为1
    let damage = Math.max(1, attackPower - Math.floor(defense / 2));
    
    // 地形加成（如果在森林中防御加成20%）
    const defenderHex = findUnitHex(defender);
    if (defenderHex && defenderHex.terrain === 'forest') {
        damage = Math.floor(damage * 0.8);
    }
    
    return damage;
}

/**
 * 查找单位所在的格子
 */
function findUnitHex(targetUnit) {
    for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
        for (let c = 0; c < CONFIG.MAP.COLS; c++) {
            if (GameState.map.grid[r][c].unit === targetUnit) {
                return GameState.map.grid[r][c];
            }
        }
    }
    return null;
}

/**
 * 移动单位
 */
function moveUnit(fromRow, fromCol, toRow, toCol) {
    const unit = GameState.map.grid[fromRow][fromCol].unit;
    
    // 移除原位置的单位
    GameState.map.grid[fromRow][fromCol].unit = null;
    
    // 放置到新位置
    GameState.map.grid[toRow][toCol].unit = unit;
    
    // 更新选中单位的位置
    GameState.map.selectedUnit = {
        unit: unit,
        row: toRow,
        col: toCol
    };
    
    showTemporaryMessage(`Moved ${UNIT_TYPES[unit.type].name} to [${toRow}, ${toCol}]`); // 移动 XX 到 [r, c]
}

/**
 * 取消选择
 */
function cancelSelection() {
    GameState.map.selectedUnit = null;
    GameState.map.targetHex = null;
    GameState.map.possibleMoves = [];
    GameState.map.possibleAttacks = [];
    GameState.turn.phase = 'select';
    
    clearHighlights();
    updateStatusMessage('Select  a unit'); // 请选择单位
    renderMap();
}

/**
 * 清除高亮
 */
function clearHighlights() {
    const hexElements = document.querySelectorAll('#map-container .hex');
    hexElements.forEach(hexEl => {
        hexEl.classList.remove('selected', 'possible-move', 'possible-attack', 'action-target');
        // 同时清除格子内单位图标的选中状态
        const unitElement = hexEl.querySelector('.unit');
        if (unitElement) {
            unitElement.classList.remove('selected');
        }
    });
}

/**
 * 高亮显示可能的行动
 */
function highlightPossibleActions() {
    if (!GameState.map.selectedUnit) return; // 如果没有选中单位，直接返回
    
    // 先清除所有旧高亮
    clearHighlights();

    const unitRow = GameState.map.selectedUnit.row;
    const unitCol = GameState.map.selectedUnit.col;

    // 高亮选中的单位所在的格子
    const selectedHex = document.querySelector(`.hex[data-row="${unitRow}"][data-col="${unitCol}"]`);
    if (selectedHex) {
        selectedHex.classList.add('selected');
        // 同时高亮单位图标本身
        const unitElement = selectedHex.querySelector('.unit');
        if (unitElement) {
            unitElement.classList.add('selected');
        }
    }
    
    // 高亮可移动格子
    GameState.map.possibleMoves.forEach(move => {
        const moveHex = document.querySelector(`.hex[data-row="${move.row}"][data-col="${move.col}"]`);
        if (moveHex) {
            moveHex.classList.add('possible-move');
        }
    });
    
    // 高亮可攻击格子
    GameState.map.possibleAttacks.forEach(attack => {
        const attackHex = document.querySelector(`.hex[data-row="${attack.row}"][data-col="${attack.col}"]`);
        if (attackHex) {
            attackHex.classList.add('possible-attack');
        }
    });

    // 新增：高亮已选中的攻击目标 (如果存在)
    if (GameState.map.targetHex) {
        const targetActionHex = document.querySelector(`.hex[data-row="${GameState.map.targetHex.row}"][data-col="${GameState.map.targetHex.col}"]`);
        if (targetActionHex) {
            targetActionHex.classList.add('action-target');
        }
    }
}

/**
 * 计算可能的移动位置
 */
function calculatePossibleMoves() {
    if (!GameState.map.selectedUnit) return;
    
    const { row, col, unit } = GameState.map.selectedUnit;
    const movementRange = unit.stats.movement;
    const possibleMoves = [];
    
    // 使用宽度优先搜索计算所有可移动的格子
    const queue = [{ row, col, steps: 0 }];
    const visited = new Set();
    visited.add(`${row},${col}`);
    
    while (queue.length > 0) {
        const current = queue.shift();
        
        // 如果当前格子不是起始格子，加入可能移动列表
        if (current.steps > 0) {
            possibleMoves.push({ row: current.row, col: current.col });
        }
        
        // 如果达到移动距离上限，不再扩展
        if (current.steps >= movementRange) continue;
        
        // 获取相邻的格子
        const adjacentHexes = getAdjacentHexes(current.row, current.col);
        
        // 检查每个相邻格子是否可以移动
        for (const hex of adjacentHexes) {
            const key = `${hex.row},${hex.col}`;
            
            // 如果已访问过或超出地图边界，跳过
            if (visited.has(key) || !GameState.map.grid[hex.row] || !GameState.map.grid[hex.row][hex.col]) continue;
            
            const targetHex = GameState.map.grid[hex.row][hex.col];
            
            // 完全跳过岩块格子，不可移动
            if (targetHex.terrain === 'rock') continue;
            
            // 跳过有单位的格子，除非是己方单位且可以合并
            if (targetHex.unit) {
                // 检查是否是同类型同阵营单位，且可以合并
                if (targetHex.unit.faction === unit.faction && targetHex.unit.type === unit.type && canMergeUnits(unit.type, 2)) {
                    // 允许移动到可合并的格子
                } else {
                    continue;
                }
            }
            
            // 将该格子加入队列
            visited.add(key);
            queue.push({ row: hex.row, col: hex.col, steps: current.steps + 1 });
        }
    }
    
    GameState.map.possibleMoves = possibleMoves;
}

/**
 * 计算可能的攻击目标
 */
function calculatePossibleAttacks() {
    if (!GameState.map.selectedUnit) return;
    
    const { row, col, unit } = GameState.map.selectedUnit;
    const attackRange = unit.stats.range;
    const possibleAttacks = [];
    
    // 遍历攻击范围内的所有格子
    for (let r = Math.max(0, row - attackRange); r <= Math.min(CONFIG.MAP.ROWS - 1, row + attackRange); r++) {
        for (let c = Math.max(0, col - attackRange); c <= Math.min(CONFIG.MAP.COLS - 1, col + attackRange); c++) {
            // 计算与选中单位的距离
            const distance = calculateHexDistance(row, col, r, c);
            
            // 如果距离在攻击范围内，且不是选中单位自身
            if (distance <= attackRange && !(r === row && c === col)) {
                const targetHex = GameState.map.grid[r][c];
                
                // 只能攻击有敌方单位的格子
                if (targetHex.unit && targetHex.unit.faction !== unit.faction) {
                    // 检查是否有障碍物阻挡
                    if (!isAttackBlocked(row, col, r, c)) {
                        possibleAttacks.push({ row: r, col: c });
                    }
                }
            }
        }
    }
    
    GameState.map.possibleAttacks = possibleAttacks;
}

/**
 * 检查攻击路径是否被障碍物阻挡
 */
function isAttackBlocked(fromRow, fromCol, toRow, toCol) {
    // 获取攻击路径上的所有格子
    const path = getHexLine(fromRow, fromCol, toRow, toCol);
    
    // 移除起点
    path.shift();  // 移除起点
    
    // 保留终点用于检查
    const endPoint = path.pop();
    
    // 检查路径上是否有障碍物（岩块）
    for (const hex of path) {
        if (GameState.map.grid[hex.row] && GameState.map.grid[hex.row][hex.col] && 
            GameState.map.grid[hex.row][hex.col].terrain === 'rock') {
            return true;  // 被岩块阻挡
        }
    }
    
    // 如果终点是岩块，也不能攻击
    if (endPoint && GameState.map.grid[endPoint.row] && GameState.map.grid[endPoint.row][endPoint.col] && 
        GameState.map.grid[endPoint.row][endPoint.col].terrain === 'rock') {
        return true; // 终点是岩块，不能攻击
    }
    
    return false;  // 没有被阻挡
}

/**
 * 获取两点之间的直线路径上的所有格子
 */
function getHexLine(fromRow, fromCol, toRow, toCol) {
    const points = [];
    const steps = Math.max(Math.abs(toRow - fromRow), Math.abs(toCol - fromCol));
    
    for (let i = 0; i <= steps; i++) {
        const ratio = steps === 0 ? 0 : i / steps;
        const row = Math.round(fromRow + (toRow - fromRow) * ratio);
        const col = Math.round(fromCol + (toCol - fromCol) * ratio);
        points.push({ row, col });
    }
    
    return points;
}

/**
 * 计算两个六边形之间的距离
 */
function calculateHexDistance(row1, col1, row2, col2) {
    const dx = Math.abs(col1 - col2);
    const dy = Math.abs(row1 - row2);
    return Math.max(dx, dy);
}

/**
 * 获取相邻的六边形格子
 */
function getAdjacentHexes(row, col) {
    // 六边形网格的六个相邻方向
    const directions = [
        { dr: -1, dc: 0 },  // 上
        { dr: -1, dc: 1 },  // 右上
        { dr: 0, dc: 1 },   // 右
        { dr: 1, dc: 0 },   // 下
        { dr: 1, dc: -1 },  // 左下
        { dr: 0, dc: -1 }   // 左
    ];
    
    return directions.map(dir => ({
        row: row + dir.dr,
        col: col + dir.dc
    })).filter(pos => 
        pos.row >= 0 && pos.row < CONFIG.MAP.ROWS && 
        pos.col >= 0 && pos.col < CONFIG.MAP.COLS
    );
}

/**
 * 检查并执行单位合并
 */
function checkAndMergeUnits(row, col) {
    const centerHex = GameState.map.grid[row][col];
    if (!centerHex || !centerHex.unit) return; // 确保中心格子有效且有单位
    
    const currentUnit = centerHex.unit;
    const faction = currentUnit.faction;
    const unitType = currentUnit.type;
    
    let sameTypeCount = 0;
    const areaToScan = [{ row, col }, ...getAdjacentHexes(row, col)];
    
    for (const hexPos of areaToScan) {
        const scanHex = GameState.map.grid[hexPos.row]?.[hexPos.col];
        if (scanHex && scanHex.unit && scanHex.unit.faction === faction && scanHex.unit.type === unitType) {
            sameTypeCount++;
        }
    }
    
    GameError.log(`检查合并: 中心 [${row},${col}] (${unitType}), 区域内同类单位数量: ${sameTypeCount}`);

    // 检查合并条件
    switch (unitType) {
        case 'infantry':
            if (sameTypeCount >= 5) {
                GameError.log(`满足步兵合并条件 (${sameTypeCount} >= 5)，尝试合并为坦克`);
                mergeUnits(row, col, 'infantry', 'tank', 5);
            }
            break;
        case 'tank':
            if (sameTypeCount >= 3) {
                GameError.log(`满足坦克合并条件 (${sameTypeCount} >= 3)，尝试合并为炮台`);
                mergeUnits(row, col, 'tank', 'artillery', 3);
            }
            break;
    }
}

/**
 * 执行单位合并 (中心格子+邻居格子机制)
 */
function mergeUnits(centerRow, centerCol, fromType, toType, requiredCount) {
    const centerHex = GameState.map.grid[centerRow]?.[centerCol];
    // 首先检查中心格子是否是岩块，如果是，则合并直接失败
    if (!centerHex || centerHex.terrain === 'rock') {
        showTemporaryMessage('Merge failed: Center position is rock or invalid.'); // 合并失败：中心位置是岩块或无效。
        GameError.log(`合并失败: 中心 [${centerRow},${centerCol}] 是岩块或无效.`);
        return;
    }

    // 合并操作一定发生在centerHex有单位（通常是刚移动过来的单位）
    if (!centerHex.unit || centerHex.unit.type !== fromType) {
        GameError.log(`合并预检失败: 中心 [${centerRow},${centerCol}] 没有预期的 ${fromType} 单位.`);
        // 理论上不应发生，因为checkAndMergeUnits应该保证了这一点
        return;
    }
    const faction = centerHex.unit.faction;

    let unitsFoundForMerging = [];
    const areaToScan = [{ row: centerRow, col: centerCol }, ...getAdjacentHexes(centerRow, centerCol)];

    for (const hexPos of areaToScan) {
        const scanHex = GameState.map.grid[hexPos.row]?.[hexPos.col];
        if (scanHex && scanHex.unit && scanHex.unit.faction === faction && scanHex.unit.type === fromType) {
            unitsFoundForMerging.push({ row: hexPos.row, col: hexPos.col }); // 存储单位位置
        }
    }

    if (unitsFoundForMerging.length >= requiredCount) {
        GameError.log(`找到 ${unitsFoundForMerging.length} 个 ${fromType} 单位用于合并 (需要 ${requiredCount} 个).`);
        // 消耗单位：从找到的单位中精确移除 requiredCount 个
        // 优先消耗中心格子的单位（如果它在列表中），然后消耗其他单位
        let unitsConsumedCount = 0;
        let consumedFromCenter = false;

        // 尝试先消耗中心格子的单位
        const centerUnitIndex = unitsFoundForMerging.findIndex(u => u.row === centerRow && u.col === centerCol);
        if (centerUnitIndex !== -1) {
            const unitToRemove = unitsFoundForMerging.splice(centerUnitIndex, 1)[0];
            GameState.map.grid[unitToRemove.row][unitToRemove.col].unit = null;
            GameError.log(`合并消耗: 中心单位 [${unitToRemove.row},${unitToRemove.col}]`);
            unitsConsumedCount++;
            consumedFromCenter = true;
        }

        // 消耗剩余所需数量的单位 (从非中心单位开始)
        for (let i = 0; i < unitsFoundForMerging.length && unitsConsumedCount < requiredCount; i++) {
            const unitToRemove = unitsFoundForMerging[i];
            GameState.map.grid[unitToRemove.row][unitToRemove.col].unit = null;
            GameError.log(`合并消耗: 相邻单位 [${unitToRemove.row},${unitToRemove.col}]`);
            unitsConsumedCount++;
        }
        
        if (unitsConsumedCount < requiredCount) {
             // 这通常不应该发生，因为 checkAndMergeUnits 已经确认数量足够
             // 但作为保险，如果因为某种原因实际消耗的数量不够，则恢复操作
            GameError.log(`错误：实际消耗单位数量 ${unitsConsumedCount} 少于所需的 ${requiredCount}。回滚消耗操作。`, "error");
            // （简单回滚逻辑：这里只是日志，实际回滚会更复杂，暂时假设不会发生）
            // 为了简单起见，如果发生这种情况，合并就失败了
            showTemporaryMessage('Merge failed: Internal error, could not consume enough units.'); // 合并失败：内部错误，未能消耗足够单位。
            // 需要重新放置被移除的单位，或者更好地处理这种情况，暂时简单返回
            // 这里应该重新创建被错误移除的单位，但为简化，暂时只提示并阻止新单位创建
            return; 
        }

        // 在中心格子创建新单位 (因为我们已确认中心格子非岩块)
        GameState.map.grid[centerRow][centerCol].unit = createUnit(toType, faction, true);
        showTemporaryMessage(`${requiredCount} ${UNIT_TYPES[fromType].name}s near [${centerRow},${centerCol}] merged into 1 ${UNIT_TYPES[toType].name} (acts next turn)`); // X个XX在[r,c]附近合并为1个XX (下回合可行动)
        GameError.log(`${requiredCount} 个 ${fromType} 在 [${centerRow},${centerCol}] 附近合并为 ${toType}`);
        renderMap(); // 确保地图立即更新显示合并结果
    } else {
        // 理论上不应该执行到这里，因为 checkAndMergeUnits 应该已经保证数量足够
        GameError.log(`合并警告: mergeUnits被调用时，发现单位数量 (${unitsFoundForMerging.length}) 不足 ${requiredCount}。`);
    }
}

/**
 * 检查合并条件
 */
function canMergeUnits(unitType, minimumCount) {
    if (unitType === 'infantry' && minimumCount >= 5) {
        return true;
    } else if (unitType === 'tank' && minimumCount >= 3) {
        return true;
    }
    return false;
}

/**
 * 结束当前回合
 */
function endTurn() {
    // 清除当前回合的选择和行动记录
    GameState.map.selectedUnit = null;
    GameState.map.targetHex = null;
    GameState.map.possibleMoves = [];
    GameState.map.possibleAttacks = [];
    GameState.turn.actionsTaken = [];
    
    // 移除所有单位的"新生成"标记
    for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
        for (let c = 0; c < CONFIG.MAP.COLS; c++) {
            const hex = GameState.map.grid[r][c];
            if (hex.unit && hex.unit.isNewlyCreated) {
                hex.unit.isNewlyCreated = false;
            }
        }
    }
    
    const oldFactionIndex = CONFIG.GAME.FACTIONS.indexOf(GameState.turn.faction);
    let nextFactionIndex = (oldFactionIndex + 1) % CONFIG.GAME.FACTIONS.length;
    GameState.turn.faction = CONFIG.GAME.FACTIONS[nextFactionIndex];

    if (nextFactionIndex === 0) { // 新的一轮开始
        GameState.turn.current++;
    }

    // 更新UI
    updateGameInfoUI();
    clearHighlights();
    renderMap();
    
    // 重置阶段
    GameState.turn.phase = 'select';
    updateStatusMessage(`Now it is ${GameState.turn.faction}'s turn`); // 现在是 XX 的回合

    // 如果是AI的回合，则执行AI行动
    if (GameState.turn.faction !== GameState.init.playerFaction && !GameState.gameOver) {
        showTemporaryMessage(`${GameState.turn.faction} AI is thinking...`, 1500); // XX AI is thinking...
        setTimeout(handleAIturn, 1000); // AI开始行动
    }
}

/**
 * 获取当前AI阵营的所有单位
 */
function getAIUnits() {
    const aiUnits = [];
    const currentFaction = GameState.turn.faction;
    for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
        for (let c = 0; c < CONFIG.MAP.COLS; c++) {
            const hex = GameState.map.grid[r][c];
            if (hex.unit && hex.unit.faction === currentFaction && !hex.unit.isNewlyCreated && !GameState.turn.actionsTaken.includes(`${r},${c}`)) {
                aiUnits.push({ unit: hex.unit, row: r, col: c });
            }
        }
    }
    return aiUnits;
}

/**
 * 处理AI回合的行动
 */
async function handleAIturn() {
    if (GameState.gameOver) {
        GameState.processingAITurn = false; // 确保在游戏结束时重置
        return;
    }
    GameState.processingAITurn = true;
    GameError.log(`AI (${GameState.turn.faction}) turn starts. Player input disabled.`);

    const aiUnits = getAIUnits();
    if (aiUnits.length === 0) {
        GameError.log(`AI (${GameState.turn.faction}) has no units to act or all have acted.`);
        GameState.processingAITurn = false; // 重置标志
        endTurn(); // 如果AI没有单位可以行动，则直接结束其回合
        return;
    }

    // 简单的AI：依次处理每个单位
    for (const unitData of aiUnits) {
        if (GameState.gameOver) break;
        if (GameState.turn.actionsTaken.includes(`${unitData.row},${unitData.col}`)) continue;

        // 模拟选择AI单位
        GameState.map.selectedUnit = unitData;
        // AI单位不需要计算possibleMoves和possibleAttacks，直接在决策时判断

        let actionTaken = false;

        // 1. 尝试攻击
        // 查找攻击范围内的所有敌方单位
        const enemiesInRange = [];
        for (let r_target = 0; r_target < CONFIG.MAP.ROWS; r_target++) {
            for (let c_target = 0; c_target < CONFIG.MAP.COLS; c_target++) {
                const targetHex = GameState.map.grid[r_target][c_target];
                if (targetHex.unit && targetHex.unit.faction !== unitData.unit.faction) {
                    const distance = calculateHexDistance(unitData.row, unitData.col, r_target, c_target);
                    if (distance <= unitData.unit.stats.range && !isAttackBlocked(unitData.row, unitData.col, r_target, c_target)) {
                        enemiesInRange.push({ unit: targetHex.unit, row: r_target, col: c_target });
                    }
                }
            }
        }

        if (enemiesInRange.length > 0) {
            // 攻击生命值最低的敌人
            enemiesInRange.sort((a, b) => a.unit.health - b.unit.health);
            const targetToAttack = enemiesInRange[0];
            
            GameError.log(`AI unit at [${unitData.row},${unitData.col}] attacks target at [${targetToAttack.row},${targetToAttack.col}]`);
            // 直接调用攻击逻辑，这里假设有一个通用的攻击函数
            // 为了演示，我们直接修改游戏状态，实际应用中应该有更复杂的函数调用
            const attackerUnit = unitData.unit;
            const defenderUnit = targetToAttack.unit;
            const damage = calculateDamage(attackerUnit, defenderUnit);
            defenderUnit.health -= damage;
            showTemporaryMessage(`AI ${attackerUnit.type} attacks ${defenderUnit.type}, deals ${damage} damage.`); // AI XX 攻击 XX, 造成 X 伤害。
            if (defenderUnit.health <= 0) {
                GameState.map.grid[targetToAttack.row][targetToAttack.col].unit = null;
                showTemporaryMessage(`AI destroyed ${defenderUnit.faction}'s ${defenderUnit.type}`); // AI destroyed XX's XX
                checkVictoryConditions(); 
                if(GameState.gameOver) break;
            }
            GameState.turn.actionsTaken.push(`${unitData.row},${unitData.col}`);
            actionTaken = true;
        } else {
            // 2. 尝试移动：向最近的敌人移动
            const allEnemies = [];
            for (let r_enemy = 0; r_enemy < CONFIG.MAP.ROWS; r_enemy++) {
                for (let c_enemy = 0; c_enemy < CONFIG.MAP.COLS; c_enemy++) {
                    const enemyHex = GameState.map.grid[r_enemy][c_enemy];
                    if (enemyHex.unit && enemyHex.unit.faction !== unitData.unit.faction) {
                        allEnemies.push({ unit: enemyHex.unit, row: r_enemy, col: c_enemy, distance: calculateHexDistance(unitData.row, unitData.col, r_enemy, c_enemy) });
                    }
                }
            }

            if (allEnemies.length > 0) {
                allEnemies.sort((a, b) => a.distance - b.distance);
                const nearestEnemy = allEnemies[0];

                // 找到朝向最近敌人的最佳移动位置 (简单地只移动一步)
                const path = getHexLine(unitData.row, unitData.col, nearestEnemy.row, nearestEnemy.col);
                if (path.length > 1) {
                    const moveTo = path[1]; // 移动路径上的下一个点
                    const targetHex = GameState.map.grid[moveTo.row]?.[moveTo.col];
                    if (targetHex && !targetHex.unit && targetHex.terrain !== 'rock') {
                        GameError.log(`AI unit at [${unitData.row},${unitData.col}] moves to [${moveTo.row},${moveTo.col}] towards enemy at [${nearestEnemy.row},${nearestEnemy.col}]`);
                        moveUnit(unitData.row, unitData.col, moveTo.row, moveTo.col);
                        // AI移动后也需要检查占领和合并
                        if (targetHex.owner !== unitData.unit.faction) {
                            const oldOwner = targetHex.owner;
                            targetHex.owner = unitData.unit.faction;
                            if (oldOwner === null) {
                                const validAdjacentHexes = getAdjacentHexes(moveTo.row, moveTo.col).filter(hex => 
                                    GameState.map.grid[hex.row]?.[hex.col] && 
                                    !GameState.map.grid[hex.row][hex.col].unit && 
                                    GameState.map.grid[hex.row][hex.col].terrain !== 'rock'
                                );
                                if (validAdjacentHexes.length > 0) {
                                    const newUnitHex = validAdjacentHexes[Math.floor(Math.random() * validAdjacentHexes.length)];
                                    GameState.map.grid[newUnitHex.row][newUnitHex.col].unit = createUnit('infantry', unitData.unit.faction, true);
                                }
                            }
                        }
                        checkAndMergeUnits(moveTo.row, moveTo.col);
                        GameState.turn.actionsTaken.push(`${moveTo.row},${moveTo.col}`); // 注意是移动后的位置
                        actionTaken = true;
                    }
                }
            }
        }

        if (!actionTaken) {
            GameError.log(`AI unit at [${unitData.row},${unitData.col}] cannot take any action.`);
        }
        
        GameState.map.selectedUnit = null; // 清除AI的选择
        renderMap(); // 每次AI单位行动后都渲染一次地图
        await new Promise(resolve => setTimeout(resolve, 500)); // 每个单位行动后暂停0.5秒
    }

    if (!GameState.gameOver) {
        GameError.log(`AI (${GameState.turn.faction}) turn ends.`);
    }
    GameState.processingAITurn = false; // 在AI回合所有行动处理完毕后，或游戏结束后重置标志
    // AI回合结束后，轮到下一个阵营
    endTurn(); 
}

/**
 * 更新状态信息
 */
function updateStatusMessage(message) {
    const statusElement = document.getElementById('status-message');
    if (statusElement) {
        statusElement.textContent = message;
    }
}

/**
 * 检查胜利条件 (新规则：消灭所有敌方单位即胜利)
 */
function checkVictoryConditions() {
    const factionUnitCounts = {};
    CONFIG.GAME.FACTIONS.forEach(faction => {
        factionUnitCounts[faction] = 0;
    });

    // 计算每个阵营的单位数量
    for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
        for (let c = 0; c < CONFIG.MAP.COLS; c++) {
            const hex = GameState.map.grid[r][c];
            if (hex.unit && factionUnitCounts[hex.unit.faction] !== undefined) {
                factionUnitCounts[hex.unit.faction]++;
            }
        }
    }

    const survivingFactionsWithUnits = [];
    CONFIG.GAME.FACTIONS.forEach(faction => {
        if (factionUnitCounts[faction] > 0) {
            survivingFactionsWithUnits.push(faction);
        } else {
            // 阵营单位数为0，检查是否是刚被消灭（用于提示，不影响胜利判断）
            if (!GameState.eliminatedFactions.has(faction) && GameState.init.isInitialized) {
                 // 只有在游戏初始化后，某个阵营的单位首次变为0才提示
                let factionStillHasTerritory = false;
                for (let r = 0; r < CONFIG.MAP.ROWS; r++) {
                    for (let c = 0; c < CONFIG.MAP.COLS; c++) {
                        if (GameState.map.grid[r][c].owner === faction) {
                            factionStillHasTerritory = true;
                            break;
                        }
                    }
                    if (factionStillHasTerritory) break;
                }
                
                if (!factionStillHasTerritory) { // 如果单位和领土都没了，算是彻底消灭
                    showTemporaryMessage(`${faction} faction has been completely eliminated!`, 3500); // XX 阵营已被彻底消灭!
                    GameState.eliminatedFactions.add(faction);
                    GameError.log(`${faction} 阵营已被彻底消灭 (无单位，无领土).`);
                } else if (factionUnitCounts[faction] === 0 && !GameState.eliminatedFactions.has(faction + '_units_eliminated')) {
                    // 仅单位被消灭，但仍有领土
                    showTemporaryMessage(`All units of ${faction} faction have been eliminated!`, 3500); // XX 阵营所有单位已被消灭!
                    GameState.eliminatedFactions.add(faction + '_units_eliminated'); // 特殊标记，避免重复提示单位消灭
                    GameError.log(`${faction} 阵营所有单位已被消灭.`);
                }
            }
        }
    });

    // 新的胜利条件：如果只剩下一个阵营拥有单位
    if (survivingFactionsWithUnits.length === 1 && GameState.init.isInitialized) {
        GameState.gameOver = true;
        GameState.winner = survivingFactionsWithUnits[0];
        GameError.log(`胜利判定: 唯一幸存有单位的阵营是 ${GameState.winner}`);
        showGameOverScreen();
    } else if (survivingFactionsWithUnits.length === 0 && GameState.init.isInitialized) {
        // 所有阵营的单位都被消灭（例如互相摧毁最后一个单位）
        GameState.gameOver = true;
        GameState.winner = null; // 平局
        GameError.log(`胜利判定: 所有阵营单位均被消灭，平局。`);
        // showTemporaryMessage("All factions eliminated, game is a draw!", 5000); // 所有阵营单位均已被消灭，游戏平局！
        const gameOverDiv = document.createElement('div');
        gameOverDiv.className = 'game-over-screen';
        gameOverDiv.innerHTML = `
            <div class="game-over-content">
                <h2>Game Over</h2>
                <p>${GameState.winner === null ? "Game is a Draw!" : GameState.winner + " is victorious!"}</p>
                <button id="restart-game" class="pixel-button">Restart Game</button>
            </div>
        `;
        document.body.appendChild(gameOverDiv);
        document.getElementById('restart-game').addEventListener('click', () => {
            location.reload();
        });
    }
}

/**
 * 显示游戏结束画面
 */
function showGameOverScreen() {
    const gameOverDiv = document.createElement('div');
    gameOverDiv.className = 'game-over-screen';
    gameOverDiv.innerHTML = `
        <div class="game-over-content">
            <h2>Game Over</h2>
            <p>${GameState.winner} is victorious!</p>
            <button id="restart-game" class="pixel-button">Restart Game</button>
        </div>
    `;
    
    document.body.appendChild(gameOverDiv);
    
    // 添加重新开始按钮的事件监听
    document.getElementById('restart-game').addEventListener('click', () => {
        location.reload();
    });
}

/**
 * 计算六边形位置
 */
function calculateHexPosition(row, col) {
    const hexSize = CONFIG.MAP.HEX_SIZE;
    const hexWidth = Math.sqrt(3) * hexSize;
    const hexHeight = 2 * hexSize;
    
    let xOffset = 0;
    if (row % 2 !== 0) {
        xOffset = hexWidth / 2;
    }
    
    const x = col * hexWidth + xOffset;
    const y = row * (hexHeight * 0.75);
    
    return { x, y };
}

/**
 * 加载状态控制
 */
function updateLoadingText(text) {
    const loadingText = document.querySelector('#loading-screen p');
    if (loadingText) {
        loadingText.textContent = text;
    }
}

function showLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'flex';
        GameState.loading.isLoading = true;
        GameError.log('显示加载屏幕');
    } else {
        GameError.log('未找到加载屏幕元素', 'error');
    }
}

function hideLoadingScreen() {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
        loadingScreen.style.display = 'none';
        GameState.loading.isLoading = false;
        GameError.log('隐藏加载屏幕');
    } else {
        GameError.log('未找到加载屏幕元素', 'error');
    }
}

function updateLoadingStatus(status, progress = null) {
    GameState.loading.status = status;
    updateLoadingText(status);
    GameError.log(`加载状态更新: ${status}`, 'info');
}

function handleLoadingError(error, context) {
    GameState.loading.error = {
        message: error.message,
        context: context,
        timestamp: new Date().toISOString()
    };
    GameError.log(`加载错误 [${context}]: ${error.message}`, 'error');
    updateLoadingText(`加载出错: ${error.message}`);
}

/**
 * 显示游戏界面
 */
function showGameInterface() {
    const gameInterface = document.getElementById('game-interface');
    if (gameInterface) {
        gameInterface.style.display = 'flex';
        GameError.log('显示游戏主界面');
    } else {
        GameError.log('未找到游戏主界面元素', 'error');
    }
}

/**
 * 临时消息显示
 */
function showTemporaryMessage(message, duration = 3000) {
    const messageElement = document.createElement('div');
    messageElement.className = 'temporary-message';
    messageElement.textContent = message;
    messageElement.style.position = 'fixed';
    messageElement.style.top = '20px';
    messageElement.style.left = '50%';
    messageElement.style.transform = 'translateX(-50%)';
    messageElement.style.backgroundColor = 'rgba(231, 76, 60, 0.8)';
    messageElement.style.color = 'white';
    messageElement.style.padding = '10px 20px';
    messageElement.style.borderRadius = '5px';
    messageElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    messageElement.style.zIndex = '9999';
    messageElement.style.fontWeight = 'bold';
    messageElement.style.textAlign = 'center';
    messageElement.style.minWidth = '200px';
    
    document.body.appendChild(messageElement);
    
    messageElement.style.opacity = '0';
    messageElement.style.transition = 'opacity 0.3s ease-in-out';
    setTimeout(() => messageElement.style.opacity = '1', 10);
    
    setTimeout(() => {
        messageElement.style.opacity = '0';
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 300);
    }, duration);
}

GameError.log('脚本加载完成，等待DOM加载...');