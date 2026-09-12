(function () {
    'use strict';

    // ==========================================
    // 1. 定数・設定・変数の定義
    // ==========================================
    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'image_display_settings';
    const DEFAULT_WIDTH = 300;
    const DEFAULT_HEIGHT = 400;
    const DEFAULT_LEFT = 20;
    const DEFAULT_TOP = 20;
    const DEFAULT_BG_COLOR = '#000000';
    const DEFAULT_EXT = '.mp4'; // 拡張子がない場合の即時補完用

    const defaultImageMap = {
        default: 'addchara/default/default.mp4'
    };

    let currentCharacter = null;
    let currentImageMap = null;
    let imageMapCache = new Map();
    let currentMode = 'normal'; // 'normal' | 'maximized' | 'halfMaximized'
    let preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let currentTextMode = 'ai'; // 'ai' | 'user'
    let isCustomWindowOpen = false;
    let isDragging = false;
    let isResizing = false;
    let offsetX = 0;
    let offsetY = 0;
    let currentDisplayedSrc = '';

    // ==========================================
    // 2. CSSスタイルの動的注入
    // ==========================================
    const styleElement = document.createElement('style');
    styleElement.id = 'image-display-styles';
    styleElement.textContent = `
        #image-display-container {
            position: absolute;
            width: ${DEFAULT_WIDTH}px;
            height: ${DEFAULT_HEIGHT}px;
            left: ${DEFAULT_LEFT}px;
            top: ${DEFAULT_TOP}px;
            background-color: ${DEFAULT_BG_COLOR};
            z-index: 9999;
            display: flex;
            flex-direction: column;
            border: 1px solid #444;
            box-sizing: border-box;
            overflow: hidden;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.6);
            transition: border-color 0.2s ease;
        }
        #image-display-container.dragging {
            opacity: 0.85;
            user-select: none;
        }
        #image-display-container.resizing {
            user-select: none;
        }
        #image-display-header {
            height: 28px;
            background: rgba(30, 30, 30, 0.9);
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding: 0 6px;
            cursor: grab;
            user-select: none;
            gap: 6px;
            border-bottom: 1px solid #333;
            box-sizing: border-box;
        }
        #image-display-header:active {
            cursor: grabbing;
        }
        .image-display-btn {
            background: #333;
            color: #eee;
            border: 1px solid #555;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
            padding: 2px 6px;
            line-height: 1;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: background 0.15s ease, border-color 0.15s ease;
        }
        .image-display-btn:hover {
            background: #444;
            border-color: #777;
            color: #fff;
        }
        .image-display-btn.disabled {
            opacity: 0.4;
            cursor: default;
        }
        .image-display-btn.enabled {
            opacity: 1;
            cursor: pointer;
        }
        #image-display-media-wrapper {
            flex: 1;
            width: 100%;
            height: calc(100% - 28px);
            position: relative;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: transparent;
        }
        #image-display-media-wrapper img,
        #image-display-media-wrapper video {
            width: 100%;
            height: 100%;
            object-fit: contain;
            pointer-events: none;
            display: block;
        }
        #image-display-resize-handle {
            position: absolute;
            right: 0;
            bottom: 0;
            width: 14px;
            height: 14px;
            cursor: se-resize;
            z-index: 10000;
            background: linear-gradient(135deg, transparent 50%, #888 50%);
            border-bottom-right-radius: 5px;
        }
        #image-display-custom-window {
            position: absolute;
            top: 35px;
            right: 10px;
            background: rgba(20, 20, 20, 0.95);
            border: 1px solid #555;
            border-radius: 6px;
            padding: 10px;
            color: #fff;
            font-size: 12px;
            z-index: 10001;
            display: none;
            flex-direction: column;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.8);
            width: 180px;
            box-sizing: border-box;
        }
        .custom-window-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 6px;
        }
        .custom-window-input {
            width: 65px;
            background: #2a2a2a;
            color: #fff;
            border: 1px solid #555;
            border-radius: 3px;
            padding: 2px 4px;
            font-size: 11px;
            text-align: right;
        }
        .custom-window-input:focus {
            outline: none;
            border-color: #888;
        }
    `;
    document.head.appendChild(styleElement);

    // ==========================================
    // 3. UIコンポーネントの構築
    // ==========================================
    const imageContainer = document.createElement('div');
    imageContainer.id = 'image-display-container';

    const header = document.createElement('div');
    header.id = 'image-display-header';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = DEFAULT_BG_COLOR;
    colorPicker.title = '背景色を変更';
    colorPicker.style.cssText = 'width: 20px; height: 20px; border: none; background: none; cursor: pointer; padding: 0;';

    const textModeButton = document.createElement('button');
    textModeButton.className = 'image-display-btn';
    textModeButton.textContent = 'AI';
    textModeButton.title = 'クリックでテキストモード切り替え（現在: AI）';

    const customButton = document.createElement('button');
    customButton.className = 'image-display-btn';
    customButton.textContent = '⚙';
    customButton.title = 'カスタムサイズ設定';

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.className = 'image-display-btn enabled';
    halfMaximizeButton.textContent = '◐';
    halfMaximizeButton.title = '画面左半分に固定';

    const maximizeButton = document.createElement('button');
    maximizeButton.className = 'image-display-btn enabled';
    maximizeButton.textContent = '⛶';
    maximizeButton.title = '全画面表示';

    header.appendChild(colorPicker);
    header.appendChild(textModeButton);
    header.appendChild(customButton);
    header.appendChild(halfMaximizeButton);
    header.appendChild(maximizeButton);

    const mediaWrapper = document.createElement('div');
    mediaWrapper.id = 'image-display-media-wrapper';

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'image-display-resize-handle';

    imageContainer.appendChild(header);
    imageContainer.appendChild(mediaWrapper);
    imageContainer.appendChild(resizeHandle);

    // カスタムウィンドウ作成
    const customWindow = document.createElement('div');
    customWindow.id = 'image-display-custom-window';
    customWindow.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; font-weight:bold; margin-bottom:4px; border-bottom:1px solid #444; padding-bottom:4px;">
            <span>サイズ・位置指定</span>
            <span id="close-custom-window" style="cursor:pointer; padding:0 4px; font-size:14px; color:#aaa;">×</span>
        </div>
        <div class="custom-window-row"><span>幅 (W):</span><input type="number" id="custom-width" class="custom-window-input"> px</div>
        <div class="custom-window-row"><span>高 (H):</span><input type="number" id="custom-height" class="custom-window-input"> px</div>
        <div class="custom-window-row"><span>左 (L):</span><input type="number" id="custom-left" class="custom-window-input"> px</div>
        <div class="custom-window-row"><span>上 (T):</span><input type="number" id="custom-top" class="custom-window-input"> px</div>
    `;
    imageContainer.appendChild(customWindow);
    document.body.appendChild(imageContainer);

    // ==========================================
    // 4. パスの正規化・探査無効化ロジック (404探査完全無効化)
    // ==========================================
    function normalizeMediaPath(path) {
        if (!path || typeof path !== 'string') return '';
        const trimmed = path.trim();
        if (!trimmed) return '';

        // 拡張子が既にある場合は fetch/HEAD 等の探査を行わず即時返却
        const hasExtension = /\.(mp4|webm|png|jpg|jpeg|webp|gif|avif|bmp)$/i.test(trimmed);
        if (hasExtension) {
            return trimmed;
        }

        // 拡張子がない場合は探査を行わず即座にデフォルト拡張子(.mp4)を直接補完
        return `${trimmed}${DEFAULT_EXT}`;
    }

    // 総当たり探査を行わない高速化マップ変換処理
    async function detectImageMapExtensions(map) {
        if (!map || typeof map !== 'object') return null;
        const normalized = {};
        for (const key in map) {
            if (Object.prototype.hasOwnProperty.call(map, key)) {
                const val = map[key];
                if (Array.isArray(val)) {
                    normalized[key] = val.map(p => normalizeMediaPath(p)).filter(Boolean);
                } else if (typeof val === 'string') {
                    normalized[key] = normalizeMediaPath(val);
                } else {
                    normalized[key] = val;
                }
            }
        }
        return normalized;
    }

    // ==========================================
    // 5. メディア描画＆空URI完全ガード
    // ==========================================
    function setMediaSource(srcPath) {
        // 【空文字・空白・null・undefinedの完全ガード】
        if (!srcPath || typeof srcPath !== 'string' || !srcPath.trim()) {
            console.warn('[Image Display] 空のURIまたは無効なパスが指定されたため設定をスキップしました。');
            return;
        }

        const cleanSrc = srcPath.trim();
        if (currentDisplayedSrc === cleanSrc) return;

        currentDisplayedSrc = cleanSrc;
        mediaWrapper.innerHTML = '';

        const isVideo = /\.(mp4|webm)$/i.test(cleanSrc);

        if (isVideo) {
            const video = document.createElement('video');
            video.src = cleanSrc;
            video.autoplay = true;
            video.loop = true;
            video.muted = true;
            video.playsInline = true;
            video.play().catch(e => console.warn('[Image Display] 動画再生エラー:', e));
            mediaWrapper.appendChild(video);
        } else {
            const img = document.createElement('img');
            img.src = cleanSrc;
            mediaWrapper.appendChild(img);
        }
    }

    // ==========================================
    // 6. テキスト解析・画像選択
    // ==========================================
    function selectImageFromText(text) {
        if (!currentImageMap) return null;

        for (const key in currentImageMap) {
            if (key === 'default') continue;
            if (text && text.includes(key)) {
                const item = currentImageMap[key];
                if (Array.isArray(item) && item.length > 0) {
                    return item[Math.floor(Math.random() * item.length)];
                } else if (typeof item === 'string') {
                    return item;
                }
            }
        }

        const def = currentImageMap.default;
        if (Array.isArray(def) && def.length > 0) {
            return def[0];
        } else if (typeof def === 'string') {
            return def;
        }
        return null;
    }

    function safeUpdateImage() {
        let textToAnalyze = '';
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;

        if (context && context.chat && context.chat.length > 0) {
            const lastMsg = context.chat[context.chat.length - 1];
            if (lastMsg) {
                if (currentTextMode === 'ai' && !lastMsg.is_user) {
                    textToAnalyze = lastMsg.text || '';
                } else if (currentTextMode === 'user' && lastMsg.is_user) {
                    textToAnalyze = lastMsg.text || '';
                }
            }
        }

        const targetSrc = selectImageFromText(textToAnalyze);
        if (targetSrc) {
            setMediaSource(targetSrc);
        }
    }

    function handleStreamingUpdate(data) {
        if (currentTextMode !== 'ai') return;
        const text = typeof data === 'string' ? data : (data && data.text ? data.text : '');
        if (text) {
            const targetSrc = selectImageFromText(text);
            if (targetSrc) setMediaSource(targetSrc);
        }
    }

    function setupChatDomObserver() {
        const chatEl = document.querySelector('#chat, .chat-scroll, #chat-body');
        if (!chatEl) return;
        const observer = new MutationObserver(() => {
            safeUpdateImage();
        });
        observer.observe(chatEl, { childList: true, subtree: true });
    }

    // ==========================================
    // 7. キャラクターデータの読み込み (_ext.json 優先取得)
    // ==========================================
    function findImageMapInData(data) {
        if (data === null || typeof data !== 'object') return null;
        if (data.hasOwnProperty('image_display_extension')) {
            const potentialMap = data.image_display_extension;
            if (typeof potentialMap === 'object' && potentialMap !== null) {
                return potentialMap;
            }
        }
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                const result = findImageMapInData(data[key]);
                if (result !== null) return result;
            }
        }
        return null;
    }

    function getCharacterNameFromDOM() {
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        const userName = (context && (context.name1 || context.user_name)) || 'ユーザー';

        if (context && context.character && context.character.name && context.character.name !== userName) {
            return context.character.name;
        }

        if (context && context.characters && typeof context.characterId !== 'undefined' && context.characters[context.characterId]) {
            const cName = context.characters[context.characterId].name;
            if (cName && cName !== userName) return cName;
        }

        const selectedOption = document.querySelector('#character_select option:checked, select[name="character"] option:checked');
        if (selectedOption && selectedOption.textContent.trim()) {
            const val = selectedOption.textContent.trim();
            if (val !== userName) return val;
        }

        const nameEl = document.querySelector('#character_name_holder, #character_name_id, .character_name, .ch_name');
        if (nameEl && nameEl.textContent.trim()) {
            const val = nameEl.textContent.trim();
            if (val !== userName) return val;
        }

        const navBlock = document.querySelector('.right-nav-char-block[data-name]');
        if (navBlock && navBlock.dataset && navBlock.dataset.name) {
            const val = navBlock.dataset.name;
            if (val !== userName) return val;
        }

        return null;
    }

    async function loadCharacterData(forceRefresh = false) {
        const charName = getCharacterNameFromDOM();

        if (!charName) {
            if (currentImageMap === defaultImageMap || !currentImageMap) {
                currentImageMap = await detectImageMapExtensions(defaultImageMap);
                safeUpdateImage();
            }
            return;
        }

        if (!forceRefresh && currentCharacter === charName && currentImageMap !== defaultImageMap && currentImageMap) {
            return;
        }

        currentCharacter = charName;
        console.log(`👤 キャラクター検出: ${charName}`);

        if (!forceRefresh && imageMapCache.has(charName)) {
            currentImageMap = imageMapCache.get(charName);
            safeUpdateImage();
            return;
        }

        let loadedMap = null;
        try {
            // _ext.json の優先・先行直接取得
            const extPath = `addchara/${charName}/${charName}_ext.json`;
            const resp = await fetch(extPath);
            if (resp.ok) {
                const data = await resp.json();
                loadedMap = findImageMapInData(data);
            }
        } catch (e) {
            console.warn(`[Image Display] ${charName}_ext.json の読み込みをスキップ:`, e);
        }

        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        if (!loadedMap && context && context.character && context.character.data) {
            loadedMap = findImageMapInData(context.character.data);
        }

        if (loadedMap) {
            const detectedMap = await detectImageMapExtensions(loadedMap);
            currentImageMap = detectedMap;
            imageMapCache.set(charName, detectedMap);
            console.log(`✅ キャラクター設定マップをロードしました (${charName}):`, currentImageMap);
        } else {
            console.warn(`⚠ ${charName} の拡張設定が見つかりませんでした。デフォルト画像を使用します。`);
            currentImageMap = await detectImageMapExtensions(defaultImageMap);
        }
        safeUpdateImage();
    }

    // ==========================================
    // 8. カスタムウィンドウの制御
    // ==========================================
    function toggleCustomWindow() {
        if (isCustomWindowOpen) {
            closeCustomWindow();
        } else {
            openCustomWindow();
        }
    }

    function openCustomWindow() {
        if (currentMode !== 'normal') return;
        document.getElementById('custom-width').value = imageContainer.offsetWidth;
        document.getElementById('custom-height').value = imageContainer.offsetHeight;
        document.getElementById('custom-left').value = parseInt(imageContainer.style.left) || DEFAULT_LEFT;
        document.getElementById('custom-top').value = parseInt(imageContainer.style.top) || DEFAULT_TOP;
        customWindow.style.display = 'flex';
        isCustomWindowOpen = true;
    }

    function closeCustomWindow() {
        customWindow.style.display = 'none';
        isCustomWindowOpen = false;
    }

    function updateCustomWindow() {
        if (!isCustomWindowOpen) return;
        document.getElementById('custom-width').value = imageContainer.offsetWidth;
        document.getElementById('custom-height').value = imageContainer.offsetHeight;
        document.getElementById('custom-left').value = parseInt(imageContainer.style.left) || 0;
        document.getElementById('custom-top').value = parseInt(imageContainer.style.top) || 0;
    }

    customButton.addEventListener('click', toggleCustomWindow);
    document.getElementById('close-custom-window').addEventListener('click', closeCustomWindow);

    textModeButton.addEventListener('click', () => {
        currentTextMode = currentTextMode === 'ai' ? 'user' : 'ai';
        textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
        textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
        saveDisplayState();
        safeUpdateImage();
    });

    ['custom-width', 'custom-height', 'custom-left', 'custom-top'].forEach(id => {
        document.getElementById(id).addEventListener('input', () => {
            if (currentMode !== 'normal') return;
            const w = parseInt(document.getElementById('custom-width').value) || DEFAULT_WIDTH;
            const h = parseInt(document.getElementById('custom-height').value) || DEFAULT_HEIGHT;
            const l = parseInt(document.getElementById('custom-left').value) || DEFAULT_LEFT;
            const t = parseInt(document.getElementById('custom-top').value) || DEFAULT_TOP;

            imageContainer.style.width = `${w}px`;
            imageContainer.style.height = `${h}px`;
            imageContainer.style.left = `${l}px`;
            imageContainer.style.top = `${t}px`;
            preNormalState = { width: w, height: h, left: l, top: t };
            saveDisplayState();
        });
    });

    // ==========================================
    // 9. 状態の永続化・復元・モード切替
    // ==========================================
    function saveDisplayState() {
        const state = {
            preNormalState,
            bgColor: colorPicker.value,
            currentMode,
            textMode: currentTextMode
        };
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        if (context && context.extensionSettings) {
            context.extensionSettings[MODULE_NAME] = state;
            if (typeof context.saveSettingsDebounced === 'function') {
                context.saveSettingsDebounced();
            }
        }
    }

    function restoreDisplayState() {
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        let state = context && context.extensionSettings ? context.extensionSettings[MODULE_NAME] : null;

        if (!state) {
            const oldSaved = localStorage.getItem(OLD_STORAGE_KEY);
            if (oldSaved) {
                try {
                    state = JSON.parse(oldSaved);
                    if (context && context.extensionSettings) {
                        context.extensionSettings[MODULE_NAME] = state;
                        if (typeof context.saveSettingsDebounced === 'function') {
                            context.saveSettingsDebounced();
                        }
                        localStorage.removeItem(OLD_STORAGE_KEY);
                    }
                } catch (e) {
                    console.error('[Image Display] 旧データの移行に失敗しました:', e);
                }
            }
        }

        if (state) {
            try {
                if (state.preNormalState) preNormalState = state.preNormalState;
                if (state.bgColor) {
                    imageContainer.style.backgroundColor = state.bgColor;
                    colorPicker.value = state.bgColor;
                }
                currentMode = state.currentMode || 'normal';
                if (state.textMode) {
                    currentTextMode = state.textMode;
                    textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
                    textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
                }
                switch (currentMode) {
                    case 'maximized':
                        applyMaximizeMode();
                        break;
                    case 'halfMaximized':
                        applyHalfMaximizeMode();
                        break;
                    default:
                        applyNormalMode();
                        break;
                }
            } catch (e) {
                console.error('状態復元エラー:', e);
                setDefaultDisplayState();
            }
        } else {
            setDefaultDisplayState();
        }
    }

    function setDefaultDisplayState() {
        preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
        imageContainer.style.backgroundColor = DEFAULT_BG_COLOR;
        colorPicker.value = DEFAULT_BG_COLOR;
        applyNormalMode();
    }

    function applyNormalMode() {
        imageContainer.style.width = `${preNormalState.width}px`;
        imageContainer.style.height = `${preNormalState.height}px`;
        imageContainer.style.left = `${preNormalState.left}px`;
        imageContainer.style.top = `${preNormalState.top}px`;
        imageContainer.style.position = 'absolute';
        resizeHandle.style.display = 'block';
        header.style.cursor = 'grab';
        imageContainer.classList.remove('half-maximized');
        maximizeButton.classList.remove('disabled');
        maximizeButton.classList.add('enabled');
        halfMaximizeButton.classList.remove('disabled');
        halfMaximizeButton.classList.add('enabled');
        currentMode = 'normal';
    }

    function applyMaximizeMode() {
        if (currentMode === 'normal') {
            preNormalState = {
                width: imageContainer.offsetWidth,
                height: imageContainer.offsetHeight,
                left: parseInt(imageContainer.style.left) || DEFAULT_LEFT,
                top: parseInt(imageContainer.style.top) || DEFAULT_TOP
            };
        }
        imageContainer.style.width = '100%';
        imageContainer.style.height = '100%';
        imageContainer.style.left = '0';
        imageContainer.style.top = '0';
        imageContainer.style.position = 'fixed';
        resizeHandle.style.display = 'none';
        header.style.cursor = 'default';
        imageContainer.classList.remove('half-maximized');
        maximizeButton.classList.remove('enabled');
        maximizeButton.classList.add('disabled');
        halfMaximizeButton.classList.remove('disabled');
        halfMaximizeButton.classList.add('enabled');
        currentMode = 'maximized';
    }

    function applyHalfMaximizeMode() {
        if (currentMode === 'normal') {
            preNormalState = {
                width: imageContainer.offsetWidth,
                height: imageContainer.offsetHeight,
                left: parseInt(imageContainer.style.left) || DEFAULT_LEFT,
                top: parseInt(imageContainer.style.top) || DEFAULT_TOP
            };
        }
        imageContainer.style.width = '50vw';
        imageContainer.style.height = '100vh';
        imageContainer.style.left = '0';
        imageContainer.style.top = '0';
        imageContainer.style.position = 'fixed';
        resizeHandle.style.display = 'none';
        header.style.cursor = 'default';
        imageContainer.classList.add('half-maximized');
        maximizeButton.classList.remove('disabled');
        maximizeButton.classList.add('enabled');
        halfMaximizeButton.classList.remove('disabled');
        halfMaximizeButton.classList.add('disabled');
        currentMode = 'halfMaximized';
    }

    restoreDisplayState();

    // ==========================================
    // 10. イベントリスナー・操作イベントの設定
    // ==========================================
    colorPicker.addEventListener('input', () => {
        imageContainer.style.backgroundColor = colorPicker.value;
        saveDisplayState();
    });

    maximizeButton.addEventListener('click', () => {
        if (currentMode === 'maximized') return;
        closeCustomWindow();
        applyMaximizeMode();
        saveDisplayState();
    });

    halfMaximizeButton.addEventListener('click', () => {
        if (currentMode === 'halfMaximized') return;
        closeCustomWindow();
        applyHalfMaximizeMode();
        saveDisplayState();
    });

    header.addEventListener('mousedown', (e) => {
        if (e.target === colorPicker || e.target.tagName === 'BUTTON' || currentMode !== 'normal') return;
        isDragging = true;
        offsetX = e.clientX - imageContainer.getBoundingClientRect().left;
        offsetY = e.clientY - imageContainer.getBoundingClientRect().top;
        imageContainer.classList.add('dragging');
        header.style.cursor = 'grabbing';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging && currentMode === 'normal') {
            imageContainer.style.left = `${e.clientX - offsetX}px`;
            imageContainer.style.top = `${e.clientY - offsetY}px`;
            if (isCustomWindowOpen) updateCustomWindow();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            imageContainer.classList.remove('dragging');
            if (currentMode === 'normal') header.style.cursor = 'grab';
            saveDisplayState();
        }
    });

    resizeHandle.addEventListener('mousedown', (e) => {
        if (currentMode !== 'normal') return;
        e.stopPropagation();
        isResizing = true;
        imageContainer.classList.add('resizing');
        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = imageContainer.offsetWidth;
        const startHeight = imageContainer.offsetHeight;

        function handleResize(e) {
            if (isResizing) {
                const newWidth = Math.max(100, startWidth + (e.clientX - startX));
                const newHeight = Math.max(100, startHeight + (e.clientY - startY));
                imageContainer.style.width = `${newWidth}px`;
                imageContainer.style.height = `${newHeight}px`;
                if (isCustomWindowOpen) updateCustomWindow();
            }
        }

        function stopResize() {
            if (isResizing) {
                isResizing = false;
                imageContainer.classList.remove('resizing');
                saveDisplayState();
                document.removeEventListener('mousemove', handleResize);
                document.removeEventListener('mouseup', stopResize);
            }
        }

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });

    window.addEventListener('resize', () => {
        if (currentMode === 'maximized') {
            imageContainer.style.width = '100%';
            imageContainer.style.height = '100%';
        } else if (currentMode === 'halfMaximized') {
            imageContainer.style.width = '50vw';
            imageContainer.style.height = '100vh';
        }
    });

    // ==========================================
    // 11. EventSource 安全監視＆初期化
    // ==========================================
    function setupEventSourceListeners() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            if (context && context.eventSource && context.eventTypes) {
                const { eventSource, eventTypes } = context;

                const safeOn = (eventType, handler) => {
                    if (eventType && typeof eventSource.on === 'function') {
                        eventSource.on(eventType, handler);
                    }
                };

                safeOn(eventTypes.STREAM_TOKEN_RECEIVED, handleStreamingUpdate);
                safeOn(eventTypes.CHARACTER_MESSAGE_RENDERED, safeUpdateImage);
                safeOn(eventTypes.USER_MESSAGE_RENDERED, safeUpdateImage);

                const onCharacterOrChatChanged = () => {
                    loadCharacterData(true);
                };

                safeOn(eventTypes.CHAT_CHANGED, onCharacterOrChatChanged);
                safeOn(eventTypes.CHARACTER_SELECTED, onCharacterOrChatChanged);

                console.log("✅ SillyTavern EventSource による監視を開始しました。");
            }
        }
    }

    // 初期ロード実行
    setupEventSourceListeners();
    loadCharacterData(true);
    setupChatDomObserver();

    let pollCount = 0;
    const initialPoll = setInterval(() => {
        loadCharacterData();
        pollCount++;
        if (pollCount > 10) clearInterval(initialPoll);
    }, 1000);
})();
