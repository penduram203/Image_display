(function () {
    console.log("Image Display: 初期化を開始します。");
    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'imageDisplayState';

    // メディアの存在確認・読み込み用キャッシュマップ
    const mediaExistsCache = new Map();

    // --- デフォルト値とグローバル変数の定義 ---
    const DEFAULT_WIDTH = 300, DEFAULT_HEIGHT = 200, DEFAULT_LEFT = 100, DEFAULT_TOP = 100, DEFAULT_BG_COLOR = '#000000';
    const defaultImageMap = { "default": "addchara/default" };
    let currentCharacter = null;
    let currentImageMap = defaultImageMap;
    let currentImageUrl = null;
    let currentMode = 'normal';
    let preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let isDragging = false, isResizing = false, offsetX, offsetY, isCustomWindowOpen = false;
    const imageMapCache = new Map();
    let isDefaultImageFailed = false;
    let currentTextMode = 'user'; // 'user' または 'ai'
    let streamingTimer = null;
    let lastStreamingText = '';
    const STREAMING_DELAY = 100; // 応答性を上げるため遅延を短縮
    let chatDomObserver = null;

    // デバウンス処理
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    // --- 拡張子自動検出関数（動画・画像対応） ---
    const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp', 'mp4', 'webm'];

    function isVideoUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return !!url.match(/\.(mp4|webm)$/i);
    }

    async function detectImageExtension(imagePath) {
        if (!imagePath || typeof imagePath !== 'string' || !imagePath.trim()) return null;
        const cleanPath = imagePath.trim();
        if (cleanPath.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            return cleanPath;
        }
        for (const ext of ALLOWED_EXTENSIONS) {
            const imagePathWithExt = `${cleanPath}.${ext}`;
            const exists = await checkMediaExists(imagePathWithExt);
            if (exists) {
                console.log(`✅ 拡張子自動検出: ${imagePathWithExt}`);
                return imagePathWithExt;
            }
        }
        console.warn(`⚠ メディアが見つかりません: ${cleanPath}`);
        return null;
    }

    // 高速チェック＆キャッシュ付きメディア確認
    function checkMediaExists(mediaUrl) {
        if (mediaExistsCache.has(mediaUrl)) {
            return Promise.resolve(mediaExistsCache.get(mediaUrl));
        }

        return new Promise((resolve) => {
            if (!mediaUrl || typeof mediaUrl !== 'string' || !mediaUrl.trim()) {
                mediaExistsCache.set(mediaUrl, false);
                return resolve(false);
            }
            const cleanUrl = mediaUrl.trim();

            if (isVideoUrl(cleanUrl)) {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.onloadedmetadata = () => {
                    mediaExistsCache.set(cleanUrl, true);
                    resolve(true);
                };
                video.onerror = () => {
                    mediaExistsCache.set(cleanUrl, false);
                    resolve(false);
                };
                video.src = cleanUrl;
            } else {
                const img = new Image();
                img.onload = () => {
                    mediaExistsCache.set(cleanUrl, true);
                    resolve(true);
                };
                img.onerror = () => {
                    mediaExistsCache.set(cleanUrl, false);
                    resolve(false);
                };
                img.src = cleanUrl;
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
        
        // カンマ区切りによるOR評価に対応 (例: "www,ttt")
        const terms = trimmed.split(',').map(t => t.trim()).filter(t => t);
        const matches = terms.some(term => text.toLowerCase().includes(term.toLowerCase()));
        
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
            const validSources = imageSource.filter(src => typeof src === 'string' && src.trim() !== '');
            if (validSources.length === 0) return null;
            const randomIndex = Math.floor(Math.random() * validSources.length);
            return validSources[randomIndex];
        }
        return (typeof imageSource === 'string' && imageSource.trim() !== '') ? imageSource : null;
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

    function findLastKeywordImage(overrideText = null) {
        // 直接テキストが渡された場合は最優先で評価（送信直前/直後のテキスト）
        if (overrideText) {
            const mediaUrl = findMatchingImageUrl(overrideText);
            if (mediaUrl) return mediaUrl;
        }

        const isUserMode = currentTextMode === 'user';
        const selector = `.mes[is_user="${isUserMode}"] .mes_text`;
        const messages = Array.from(document.querySelectorAll(selector));
        for (let i = messages.length - 1; i >= 0; i--) {
            const textContent = messages[i].textContent || messages[i].innerText || "";
            const mediaUrl = findMatchingImageUrl(textContent);
            if (mediaUrl) return mediaUrl;
        }
        return null;
    }

    // --- メディア表示更新処理（即時更新・前倒し対応版） ---
    async function updateImage(overrideText = null) {
        if (isDefaultImageFailed) return;
        const keywordMedia = findLastKeywordImage(overrideText);
        let newUrl = keywordMedia || getRandomImageSource(currentImageMap.default) || currentImageMap.default;

        if (!newUrl || typeof newUrl !== 'string' || newUrl.trim() === '') {
            return;
        }
        newUrl = newUrl.trim();

        // 拡張子が含まれていない場合は自動検出を実施
        if (!newUrl.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            const detected = await detectImageExtension(newUrl);
            if (detected) {
                newUrl = detected;
            }
        }

        // 表示パスが変わらない場合、かつコンテナ内に既にメディアが存在する場合はスキップ
        if (currentImageUrl === newUrl && mediaContainer.children.length > 0) {
            return;
        }

        console.log(`🖼 メディアを更新 (前倒しトリガー): ${newUrl}`);
        currentImageUrl = newUrl;

        // 描画前にコンテナを一旦空にして切り替え準備
        mediaContainer.innerHTML = '';

        if (isVideoUrl(newUrl)) {
            const videoElement = document.createElement('video');
            videoElement.src = newUrl;
            videoElement.autoplay = true;
            videoElement.loop = true;
            videoElement.muted = true;
            videoElement.playsInline = true;
            videoElement.preload = 'auto';
            videoElement.style.width = '100%';
            videoElement.style.height = '100%';
            videoElement.style.objectFit = 'contain';
            videoElement.onerror = () => handleMediaError(videoElement, newUrl);
            mediaContainer.appendChild(videoElement);
            videoElement.play().catch(() => {});
        } else {
            const imgElement = document.createElement('img');
            imgElement.style.width = '100%';
            imgElement.style.height = '100%';
            imgElement.style.objectFit = 'contain';

            imgElement.onload = () => {
                if (currentImageUrl === newUrl) {
                    mediaContainer.innerHTML = '';
                    mediaContainer.appendChild(imgElement);
                }
            };
            imgElement.onerror = () => handleMediaError(imgElement, newUrl);
            imgElement.src = newUrl;
        }
    }

    // 描画更新の即時呼び出し用関数
    function safeUpdateImage(overrideText = null) {
        updateImage(overrideText);
    }

    // --- 送信直後の前倒し切り替えトリガーの準備 ---
    function setupFastSubmitTrigger() {
        const sendButton = document.querySelector('#send_textarea, #send_btn, .send_btn');
        const sendTextarea = document.querySelector('#send_textarea, textarea');

        const triggerImmediateUpdate = () => {
            if (currentTextMode !== 'user' || !sendTextarea) return;
            const text = sendTextarea.value;
            if (text && text.trim() !== '') {
                console.log("⚡ 送信前倒しトリガー検知:", text);
                safeUpdateImage(text);
            }
        };

        if (sendButton) {
            sendButton.addEventListener('click', triggerImmediateUpdate, { capture: true });
        }

        if (sendTextarea) {
            sendTextarea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    triggerImmediateUpdate();
                }
            }, { capture: true });
        }

        // SillyTavern EventSource イベントに連動
        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            eventSource.on(event_types.USER_MESSAGE_RENDERED || 'user_message_rendered', () => {
                if (currentTextMode === 'user') {
                    safeUpdateImage();
                }
            });
        }
    }

    async function handleMediaError(element, src) {
        console.error("メディアの読み込みに失敗しました:", src);
        if (src && !src.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp|mp4|webm)$/i)) {
            const detectedPath = await detectImageExtension(src);
            if (detectedPath) {
                element.src = detectedPath;
                if (isVideoUrl(detectedPath) && element.tagName.toLowerCase() === 'video') {
                    element.play().catch(() => {});
                }
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
                if (isVideoUrl(fallback) && element.tagName.toLowerCase() === 'video') {
                    element.play().catch(() => {});
                }
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
        safeUpdateImage();
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
            safeUpdateImage();
        }, STREAMING_DELAY);
    }

    function setupChatDomObserver() {
        const chatContainer = document.querySelector('#chat');
        if (!chatContainer) return;
        if (chatDomObserver) chatDomObserver.disconnect();

        const debouncedUpdate = debounce(() => {
            handleStreamingUpdate();
            safeUpdateImage();
        }, 100);

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
            if (currentImageMap === defaultImageMap) {
                currentImageMap = await detectImageMapExtensions(defaultImageMap);
                safeUpdateImage();
            }
            return;
        }

        if (!forceRefresh && currentCharacter === charName && currentImageMap !== defaultImageMap) {
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
        maximizeButton.classList.remove('enabled');
        maximizeButton.classList.add('enabled');
        halfMaximizeButton.classList.remove('disabled');
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

    // 初期化と各トリガーの適用
    setupFastSubmitTrigger();
    setupChatDomObserver();
    loadCharacterData();

})();
