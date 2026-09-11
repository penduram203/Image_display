function initImageDisplay() {
    console.log("Image Display: 初期化を開始します。");
    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'imageDisplayState';

    // --- デフォルト値とグローバル変数の定義 ---
    const DEFAULT_WIDTH = 300, DEFAULT_HEIGHT = 200, DEFAULT_LEFT = 100, DEFAULT_TOP = 100, DEFAULT_BG_COLOR = '#000000';
    const defaultImageMap = { "default": "addchara/default" };
    let currentCharacter = null, currentImageMap = defaultImageMap, currentImageUrl = currentImageMap.default;
    let currentMode = 'normal', preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let isDragging = false, isResizing = false, offsetX, offsetY, isCustomWindowOpen = false;
    const imageMapCache = new Map();
    let isDefaultImageFailed = false;
    let currentTextMode = 'user'; // 'user' または 'ai'
    let streamingTimer = null;
    let lastStreamingText = '';
    const STREAMING_DELAY = 1000;
    let chatDomObserver = null;

    // デバウンス処理
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    // --- 拡張子自動検出関数（動画対応） ---
    const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'webm'];

    function isVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return !!url.match(/\.(mp4|webm)$/i);
    }

    async function detectImageExtension(imagePath) {
        if (!imagePath) return null;
        if (imagePath.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            return imagePath;
        }
        for (const ext of ALLOWED_EXTENSIONS) {
            const imagePathWithExt = `${imagePath}.${ext}`;
            const exists = await checkMediaExists(imagePathWithExt);
            if (exists) {
                console.log(`✅ 拡張子自動検出: ${imagePathWithExt}`);
                return imagePathWithExt;
            }
        }
        console.warn(`⚠ メディアが見つかりません: ${imagePath}`);
        return null;
    }

    function checkMediaExists(mediaUrl) {
        return new Promise((resolve) => {
            if (!mediaUrl) return resolve(false);
            if (isVideoUrl(mediaUrl)) {
                const video = document.createElement('video');
                video.onloadedmetadata = () => resolve(true);
                video.onerror = () => resolve(false);
                video.src = mediaUrl;
            } else {
                const img = new Image();
                img.onload = () => resolve(true);
                img.onerror = () => resolve(false);
                img.src = mediaUrl;
            }
        });
    }

    async function detectImageMapExtensions(imageMap) {
        if (!imageMap) return imageMap;
        const detectedMap = {};
        for (const [key, value] of Object.entries(imageMap)) {
            if (Array.isArray(value)) {
                const detectedArray = [];
                for (const imagePath of value) {
                    const detectedPath = await detectImageExtension(imagePath);
                    if (detectedPath) {
                        detectedArray.push(detectedPath);
                    }
                }
                detectedMap[key] = detectedArray.length > 0 ? detectedArray : value;
            } else if (typeof value === 'string') {
                const detectedPath = await detectImageExtension(value);
                detectedMap[key] = detectedPath || value;
            } else {
                detectedMap[key] = value;
            }
        }
        return detectedMap;
    }

    // --- UI要素の作成 ---
    const imageContainer = document.createElement('div');
    imageContainer.id = 'image-display-container';
    document.body.appendChild(imageContainer);

    const header = document.createElement('div');
    header.id = 'image-display-header';
    header.textContent = 'メディア表示エリア (ドラッグで移動)';
    imageContainer.appendChild(header);

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = 'bg-color-picker';
    colorPicker.value = DEFAULT_BG_COLOR;
    colorPicker.title = '背景色を変更';
    header.appendChild(colorPicker);

    // メディア表示用コンテナ
    const mediaContainer = document.createElement('div');
    mediaContainer.id = 'media-element-container';
    mediaContainer.style.width = '100%';
    mediaContainer.style.height = 'calc(100% - 30px)';
    imageContainer.appendChild(mediaContainer);

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'resize-handle';
    imageContainer.appendChild(resizeHandle);

    // コントロールボタンコンテナ
    const controlContainer = document.createElement('div');
    controlContainer.id = 'image-control-container';
    document.body.appendChild(controlContainer);

    const textModeButton = document.createElement('button');
    textModeButton.id = 'text-mode-button';
    textModeButton.textContent = 'UT';
    textModeButton.title = 'クリックでテキストモード切り替え（現在: ユーザー）';
    controlContainer.appendChild(textModeButton);

    const customButton = document.createElement('button');
    customButton.id = 'custom-button';
    customButton.textContent = 'カスタム';
    customButton.title = '位置とサイズを手動設定';
    controlContainer.appendChild(customButton);

    const maximizeButton = document.createElement('button');
    maximizeButton.id = 'maximize-button';
    maximizeButton.textContent = '全画面';
    maximizeButton.title = '全画面モードに切替';
    maximizeButton.classList.add('enabled');
    controlContainer.appendChild(maximizeButton);

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.id = 'half-maximize-button';
    halfMaximizeButton.textContent = '左半分';
    halfMaximizeButton.title = '左半分モードに切替';
    halfMaximizeButton.classList.add('enabled');
    controlContainer.appendChild(halfMaximizeButton);

    // カスタム設定ウィンドウ
    const customWindow = document.createElement('div');
    customWindow.id = 'custom-window';
    customWindow.innerHTML = `
        <h3>位置・サイズの設定</h3>
        <label>幅 (px): <input type="number" id="custom-width" min="100"></label>
        <label>高さ (px): <input type="number" id="custom-height" min="100"></label>
        <label>X位置 (px): <input type="number" id="custom-left"></label>
        <label>Y位置 (px): <input type="number" id="custom-top"></label>
        <button class="close-button" id="close-custom-window">閉じる</button>
    `;
    document.body.appendChild(customWindow);

    // --- 条件評価・キーワードロジック ---
    function evaluateBasicCondition(condStr, text) {
        let trimmed = condStr.trim();
        if (!trimmed) return false;
        let isNegative = false;
        if (trimmed.startsWith('NOT ') || trimmed.startsWith('not ')) {
            isNegative = true;
            trimmed = trimmed.substring(4).trim();
        }
        const matches = text.toLowerCase().includes(trimmed.toLowerCase());
        return isNegative ? !matches : matches;
    }

    function processAnd(expr, text) {
        const parts = expr.split(/\s+and\s+/i);
        for (const part of parts) {
            if (!evaluateBasicCondition(part, text)) return false;
        }
        return true;
    }

    function processOr(expr, text) {
        const parts = expr.split(/\s+or\s+/i);
        for (const part of parts) {
            if (processAnd(part, text)) return true;
        }
        return false;
    }

    function evaluateCondition(condStr, text) {
        if (!condStr || !text) return false;
        let processed = condStr;
        if (processed.includes('or')) return processOr(processed, text);
        if (processed.includes('and')) return processAnd(processed, text);
        return evaluateBasicCondition(processed, text);
    }

    function getRandomImageSource(imageSource) {
        if (Array.isArray(imageSource)) {
            if (imageSource.length === 0) return null;
            const randomIndex = Math.floor(Math.random() * imageSource.length);
            return imageSource[randomIndex];
        }
        return imageSource;
    }

    function findMatchingImageUrl(text) {
        if (!text || !currentImageMap) return null;
        const keywordEntries = Object.entries(currentImageMap)
            .filter(([key]) => key !== "default" && key !== "thumbnail")
            .map(([key, url]) => ({
                condition: key,
                url: url,
                complexity: (key.match(/and/g) || []).length * 10 + (key.match(/or/g) || []).length * 5 + key.length
            }))
            .sort((a, b) => b.complexity - a.complexity);

        for (const entry of keywordEntries) {
            try {
                if (evaluateCondition(entry.condition, text)) {
                    const selected = getRandomImageSource(entry.url);
                    if (selected) return selected;
                }
            } catch (error) {
                console.error(`❌ 条件評価エラー "${entry.condition}":`, error);
            }
        }
        return null;
    }

    function findLastKeywordImage() {
        const isUserMode = currentTextMode === 'user';
        const selector = `.mes[is_user="${isUserMode}"] .mes_text`;
        const messages = Array.from(document.querySelectorAll(selector));
        for (let i = messages.length - 1; i >= 0; i--) {
            const mediaUrl = findMatchingImageUrl(messages[i].textContent);
            if (mediaUrl) return mediaUrl;
        }
        return null;
    }

    // --- メディア表示更新処理 ---
    function updateImage() {
        if (isDefaultImageFailed) return;
        const keywordMedia = findLastKeywordImage();
        let newUrl = keywordMedia || getRandomImageSource(currentImageMap.default) || currentImageMap.default;

        if (currentImageUrl !== newUrl || mediaContainer.children.length === 0) {
            console.log(`🖼 メディアを更新: ${newUrl}`);
            currentImageUrl = newUrl;
            mediaContainer.innerHTML = '';

            if (isVideoUrl(newUrl)) {
                const videoElement = document.createElement('video');
                videoElement.src = newUrl;
                videoElement.autoplay = true;
                videoElement.loop = true;
                videoElement.muted = true;
                videoElement.playsInline = true;
                videoElement.style.width = '100%';
                videoElement.style.height = '100%';
                videoElement.style.objectFit = 'contain';
                videoElement.onerror = () => handleMediaError(videoElement, newUrl);
                mediaContainer.appendChild(videoElement);
            } else {
                const imgElement = document.createElement('img');
                imgElement.src = newUrl;
                imgElement.style.width = '100%';
                imgElement.style.height = '100%';
                imgElement.style.objectFit = 'contain';
                imgElement.onerror = () => handleMediaError(imgElement, newUrl);
                mediaContainer.appendChild(imgElement);
            }
        }
    }

    async function handleMediaError(element, src) {
        console.error("メディアの読み込みに失敗しました:", src);
        if (src && !src.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            console.log("🔄 拡張子自動検出を試みます:", src);
            const detectedPath = await detectImageExtension(src);
            if (detectedPath) {
                console.log(`✅ 拡張子を検出: ${detectedPath}`);
                element.src = detectedPath;
                return;
            }
        }
        if (src && (src.match(/default\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i) || src.endsWith('/default'))) {
            isDefaultImageFailed = true;
            console.warn("⚠ デフォルトメディアが見つかりません。表示を無効化します");
            mediaContainer.style.display = 'none';
        } else {
            const fallback = getRandomImageSource(currentImageMap.default) || currentImageMap.default;
            if (fallback && fallback !== src) {
                element.src = fallback;
            }
        }
    }

    // --- テキストモード切り替え ---
    function toggleTextMode() {
        currentTextMode = currentTextMode === 'user' ? 'ai' : 'user';
        textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
        textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
        console.log(`🔄 テキストモード切替: ${currentTextMode}`);
        saveDisplayState();
        updateImage();
    }
    textModeButton.addEventListener('click', toggleTextMode);

    // --- ストリーミング監視 ---
    function handleStreamingUpdate() {
        if (currentTextMode !== 'ai') return;
        const lastAiMessage = document.querySelector('.mes[is_user="false"]:last-child .mes_text');
        if (!lastAiMessage) return;

        const currentText = lastAiMessage.textContent;
        if (currentText === lastStreamingText) return;
        lastStreamingText = currentText;

        if (streamingTimer) clearTimeout(streamingTimer);
        streamingTimer = setTimeout(() => {
            updateImage();
        }, STREAMING_DELAY);
    }

    function setupChatDomObserver() {
        const chatContainer = document.querySelector('#chat');
        if (!chatContainer) return;
        if (chatDomObserver) chatDomObserver.disconnect();

        const debouncedUpdate = debounce(() => {
            handleStreamingUpdate();
            updateImage();
        }, 200);

        chatDomObserver = new MutationObserver((mutations) => {
            debouncedUpdate();
        });

        chatDomObserver.observe(chatContainer, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    // --- キャラクターデータの読み込み ---
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
        const nameEl = document.querySelector('#character_name_holder') || document.querySelector('#character_name_id') || document.querySelector('.character_name');
        if (nameEl && nameEl.textContent.trim()) {
            return nameEl.textContent.trim();
        }
        return null;
    }

    async function loadCharacterData() {
        const context = typeof SillyTavern !== 'undefined' ? SillyTavern.getContext() : null;
        let charName = null;

        if (context && context.character) {
            charName = context.character.name;
        }
        if (!charName) {
            charName = getCharacterNameFromDOM();
        }

        if (!charName) {
            currentImageMap = await detectImageMapExtensions(defaultImageMap);
            updateImage();
            return;
        }

        if (currentCharacter === charName && currentImageMap !== defaultImageMap) {
            return;
        }

        currentCharacter = charName;
        console.log(`👤 キャラクター検出: ${charName}`);

        if (imageMapCache.has(charName)) {
            currentImageMap = imageMapCache.get(charName);
            updateImage();
            return;
        }

        let loadedMap = null;
        try {
            const extPath = `addchara/${charName}/${charName}_ext.json`;
            const resp = await fetch(extPath);
            if (resp.ok) {
                const data = await resp.json();
                loadedMap = findImageMapInData(data);
            }
        } catch (e) {
            console.warn(`[Image Display] ${charName}_ext.json の読み込みをスキップ:`, e);
        }

        if (!loadedMap && context && context.character && context.character.data) {
            loadedMap = findImageMapInData(context.character.data);
        }

        if (loadedMap) {
            const detectedMap = await detectImageMapExtensions(loadedMap);
            currentImageMap = detectedMap;
            imageMapCache.set(charName, detectedMap);
        } else {
            currentImageMap = await detectImageMapExtensions(defaultImageMap);
        }
        updateImage();
    }

    // --- カスタムウィンドウの制御 ---
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
        customWindow.style.display = 'block';
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

    // --- 状態の永続化・復元 ---
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
        halfMaximizeButton.classList.remove('enabled');
        halfMaximizeButton.classList.add('disabled');
        currentMode = 'halfMaximized';
    }

    restoreDisplayState();

    // --- イベントリスナー設定 ---
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
        if (e.target === colorPicker || currentMode !== 'normal') return;
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

    // --- SillyTavern EventSource イベント安全化登録（修正箇所） ---
    function setupEventSourceListeners() {
        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext) {
            const context = SillyTavern.getContext();
            if (context && context.eventSource && context.eventTypes) {
                const { eventSource, eventTypes } = context;

                // 安全にリスナー登録を行うヘルパー
                const safeOn = (eventType, handler) => {
                    if (eventType && typeof eventSource.on === 'function') {
                        eventSource.on(eventType, handler);
                    }
                };

                safeOn(eventTypes.STREAM_TOKEN_RECEIVED, handleStreamingUpdate);
                safeOn(eventTypes.CHARACTER_MESSAGE_RENDERED, handleStreamingUpdate);
                safeOn(eventTypes.USER_MESSAGE_RENDERED, updateImage);

                const onCharacterOrChatChanged = () => {
                    loadCharacterData();
                };

                safeOn(eventTypes.CHAT_CHANGED, onCharacterOrChatChanged);
                safeOn(eventTypes.CHARACTER_SELECTED, onCharacterOrChatChanged);

                console.log("✅ SillyTavern EventSource による監視を開始しました。");
            }
        }
    }

    // --- 初期ロードと定期監視の設定 ---
    setupEventSourceListeners();
    loadCharacterData();
    setupChatDomObserver();
    setInterval(loadCharacterData, 2000);
}

// DOMコンテンツロード時または動的読み込み時の初期化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initImageDisplay);
} else {
    initImageDisplay();
}
