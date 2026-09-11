function initImageDisplay() {
    console.log("Image Display: 初期化を開始します。");

    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'imageDisplayState';

    // --- デフォルト値とグローバル変数の定義 ---
    const DEFAULT_WIDTH = 300, DEFAULT_HEIGHT = 200, DEFAULT_LEFT = 100, DEFAULT_TOP = 100, DEFAULT_BG_COLOR = '#000000';
    const defaultImageMap = { "default": "addchara/default" };

    let currentCharacter = null,
        currentImageMap = defaultImageMap,
        currentImageUrl = currentImageMap.default;

    let currentMode = 'normal',
        preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };

    let isDragging = false, isResizing = false, offsetX, offsetY, isCustomWindowOpen = false;
    const imageMapCache = new Map();
    let isDefaultImageFailed = false;

    let currentTextMode = 'user'; // 'user' または 'ai'
    let streamingTimer = null;
    let lastStreamingText = '';
    const STREAMING_DELAY = 1000;

    // --- 拡張子自動検出関数 ---
    const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'];

    async function detectImageExtension(imagePath) {
        if (!imagePath) return null;
        if (imagePath.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i)) {
            return imagePath;
        }
        for (const ext of ALLOWED_EXTENSIONS) {
            const imagePathWithExt = `${imagePath}.${ext}`;
            const exists = await checkImageExists(imagePathWithExt);
            if (exists) {
                console.log(`✅ 拡張子自動検出: ${imagePathWithExt}`);
                return imagePathWithExt;
            }
        }
        console.warn(`⚠ 画像が見つかりません: ${imagePath}`);
        return null;
    }

    function checkImageExists(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = imageUrl;
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
    header.textContent = '画像表示エリア (ドラッグで移動)';
    imageContainer.appendChild(header);

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = 'bg-color-picker';
    colorPicker.value = DEFAULT_BG_COLOR;
    colorPicker.title = '背景色を変更';
    header.appendChild(colorPicker);

    const imgElement = document.createElement('img');
    imgElement.id = 'displayed-image';
    imgElement.src = currentImageMap.default;
    imageContainer.appendChild(imgElement);

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'resize-handle';
    imageContainer.appendChild(resizeHandle);

    const controlContainer = document.createElement('div');
    controlContainer.id = 'image-control-container';
    document.body.appendChild(controlContainer);

    const textModeButton = document.createElement('button');
    textModeButton.id = 'text-mode-button';
    textModeButton.textContent = 'UT';
    textModeButton.title = 'クリックでテキストモード切り替え（ユーザー / AI）';
    controlContainer.appendChild(textModeButton);

    const customButton = document.createElement('button');
    customButton.id = 'custom-button';
    customButton.textContent = 'カスタム';
    customButton.title = 'カスタムモードに切り替え / 設定を開く';
    controlContainer.appendChild(customButton);

    const maximizeButton = document.createElement('button');
    maximizeButton.id = 'maximize-button';
    maximizeButton.textContent = '最大化';
    maximizeButton.title = '画像表示エリアを最大化';
    controlContainer.appendChild(maximizeButton);

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.id = 'half-maximize-button';
    halfMaximizeButton.textContent = '左半分';
    halfMaximizeButton.title = '画像表示エリアを左半分に最大化';
    controlContainer.appendChild(halfMaximizeButton);

    const customWindow = document.createElement('div');
    customWindow.id = 'custom-window';
    document.body.appendChild(customWindow);

    const customWindowTitle = document.createElement('h3');
    customWindowTitle.textContent = 'カスタム設定';
    customWindow.appendChild(customWindowTitle);

    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = '×';
    customWindow.appendChild(closeButton);

    const xLabel = document.createElement('label');
    xLabel.htmlFor = 'custom-x';
    xLabel.textContent = 'X座標 (px)';
    customWindow.appendChild(xLabel);

    const xInput = document.createElement('input');
    xInput.type = 'number';
    xInput.id = 'custom-x';
    customWindow.appendChild(xInput);

    const yLabel = document.createElement('label');
    yLabel.htmlFor = 'custom-y';
    yLabel.textContent = 'Y座標 (px)';
    customWindow.appendChild(yLabel);

    const yInput = document.createElement('input');
    yInput.type = 'number';
    yInput.id = 'custom-y';
    customWindow.appendChild(yInput);

    const widthLabel = document.createElement('label');
    widthLabel.htmlFor = 'custom-width';
    widthLabel.textContent = '幅 (px)';
    customWindow.appendChild(widthLabel);

    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.id = 'custom-width';
    customWindow.appendChild(widthInput);

    const heightLabel = document.createElement('label');
    heightLabel.htmlFor = 'custom-height';
    heightLabel.textContent = '高さ (px)';
    customWindow.appendChild(heightLabel);

    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.id = 'custom-height';
    customWindow.appendChild(heightInput);

    // --- UI操作のための関数群 ---
    function updateCustomWindow() {
        xInput.value = parseInt(imageContainer.style.left) || DEFAULT_LEFT;
        yInput.value = parseInt(imageContainer.style.top) || DEFAULT_TOP;
        widthInput.value = imageContainer.offsetWidth;
        heightInput.value = imageContainer.offsetHeight;
    }

    function handleCustomInput() {
        if (currentMode === 'normal') {
            imageContainer.style.left = `${xInput.value}px`;
            imageContainer.style.top = `${yInput.value}px`;
            imageContainer.style.width = `${widthInput.value}px`;
            imageContainer.style.height = `${heightInput.value}px`;
            saveDisplayState();
        }
    }

    xInput.addEventListener('input', handleCustomInput);
    yInput.addEventListener('input', handleCustomInput);
    widthInput.addEventListener('input', handleCustomInput);
    heightInput.addEventListener('input', handleCustomInput);

    function toggleCustomWindow() {
        isCustomWindowOpen = !isCustomWindowOpen;
        if (isCustomWindowOpen) {
            customWindow.style.display = 'block';
            updateCustomWindow();
        } else {
            customWindow.style.display = 'none';
        }
    }

    function closeCustomWindow() {
        if (isCustomWindowOpen) {
            isCustomWindowOpen = false;
            customWindow.style.display = 'none';
        }
    }

    closeButton.addEventListener('click', toggleCustomWindow);
    customButton.addEventListener('click', () => {
        if (currentMode !== 'normal') {
            applyNormalMode();
            saveDisplayState();
        }
        toggleCustomWindow();
    });

    function toggleTextMode() {
        currentTextMode = currentTextMode === 'user' ? 'ai' : 'user';
        textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
        textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
        console.log(`🔄 テキストモードを切り替え: ${currentTextMode}`);
        saveDisplayState();
        updateImage();
    }

    textModeButton.addEventListener('click', toggleTextMode);

    // --- 設定保存・復元（SillyTavern extensionSettings 統合） ---
    function saveDisplayState() {
        if (currentMode === 'normal') {
            preNormalState = {
                width: imageContainer.offsetWidth,
                height: imageContainer.offsetHeight,
                left: parseInt(imageContainer.style.left) || DEFAULT_LEFT,
                top: parseInt(imageContainer.style.top) || DEFAULT_TOP
            };
        }
        const state = {
            bgColor: colorPicker.value,
            currentMode: currentMode,
            preNormalState: preNormalState,
            textMode: currentTextMode
        };

        const context = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;

        if (context && context.extensionSettings) {
            context.extensionSettings[MODULE_NAME] = state;
            if (typeof context.saveSettingsDebounced === 'function') {
                context.saveSettingsDebounced();
            }
        } else {
            localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(state));
        }
    }

    function restoreDisplayState() {
        const context = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;

        let state = context && context.extensionSettings ? context.extensionSettings[MODULE_NAME] : null;

        // 旧localStorageからの自動マイグレーション
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
                        console.log('[Image Display] localStorage から extensionSettings に移行しました。');
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
                    case 'maximized': applyMaximizeMode(); break;
                    case 'halfMaximized': applyHalfMaximizeMode(); break;
                    default: applyNormalMode(); break;
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
                left: parseInt(imageContainer.style.left),
                top: parseInt(imageContainer.style.top)
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
                left: parseInt(imageContainer.style.left),
                top: parseInt(imageContainer.style.top)
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

    document.addEventListener('mouseup', () => {
        if ((isDragging || isResizing) && currentMode === 'normal') {
            setTimeout(() => {
                saveDisplayState();
                if (isCustomWindowOpen) updateCustomWindow();
            }, 50);
        }
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

    // 画像エラーハンドラー
    imgElement.onerror = async function() {
        console.error("画像の読み込みに失敗しました:", this.src);
        if (this.src && !this.src.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i)) {
            console.log("🔄 拡張子自動検出を試みます:", this.src);
            const detectedPath = await detectImageExtension(this.src);
            if (detectedPath) {
                console.log(`✅ 拡張子を検出: ${detectedPath}`);
                this.src = detectedPath;
                return;
            }
        }
        if (this.src.match(/default\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i) || this.src.endsWith('/default')) {
            isDefaultImageFailed = true;
            console.warn("⚠ デフォルト画像が見つかりません。画像表示を無効化します");
            this.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            this.style.display = 'none';
        } else {
            this.src = currentImageMap.default;
        }
    };

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
            isResizing = false;
            imageContainer.classList.remove('resizing');
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        }

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });

    // 唯一の信頼できるキャラクター名検出器
    function detectCharacterNameFromDOM() {
        const nameHolder = document.querySelector('#character_name_holder');
        if (nameHolder && nameHolder.textContent) return nameHolder.textContent;
        const greetingMessage = document.querySelector('.mes[mesid="0"][is_user="false"]');
        if (greetingMessage && greetingMessage.getAttribute('ch_name')) return greetingMessage.getAttribute('ch_name');
        return null;
    }

    // 条件評価ロジック
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
        if (processed.includes('or')) {
            return processOr(processed, text);
        }
        if (processed.includes('and')) {
            return processAnd(processed, text);
        }
        return evaluateBasicCondition(processed, text);
    }

    function getRandomImageSource(imageSource) {
        if (Array.isArray(imageSource)) {
            if (imageSource.length === 0) {
                console.warn("画像配列が空です");
                return null;
            }
            const randomIndex = Math.floor(Math.random() * imageSource.length);
            const selectedImage = imageSource[randomIndex];
            console.log(`🎲 ランダム選択: ${selectedImage} (${randomIndex + 1}/${imageSource.length})`);
            return selectedImage;
        } else {
            return imageSource;
        }
    }

    function findMatchingImageUrl(text) {
        if (!text || !currentImageMap) return null;
        const keywordEntries = Object.entries(currentImageMap)
            .filter(([key]) => key !== "default")
            .map(([key, url]) => {
                return {
                    condition: key,
                    url: url,
                    complexity: (key.match(/and/g) || []).length * 10 + (key.match(/or/g) || []).length * 5 + (key.match(/[()]/g) || []).length * 3 + key.length
                };
            })
            .sort((a, b) => b.complexity - a.complexity);

        console.log(`🔍 テキスト検索: "${text}"`);
        console.log("評価する条件:", keywordEntries.map(e => e.condition));

        for (const entry of keywordEntries) {
            try {
                console.log(`--- 条件評価開始: "${entry.condition}" ---`);
                const conditionMet = evaluateCondition(entry.condition, text);
                console.log(`条件 "${entry.condition}" -> ${conditionMet}`);
                if (conditionMet) {
                    const imageSource = entry.url;
                    console.log(`✅ 条件 "${entry.condition}" にマッチ`);
                    const selectedImage = getRandomImageSource(imageSource);
                    if (selectedImage) {
                        console.log(`🖼 選択画像: ${selectedImage}`);
                        return selectedImage;
                    }
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
        console.log(`🔍 ${isUserMode ? 'ユーザー' : 'AI'}メッセージを検索: ${messages.length}件見つかりました`);

        for (let i = messages.length - 1; i >= 0; i--) {
            const text = messages[i].textContent;
            const imageUrl = findMatchingImageUrl(text);
            if (imageUrl) {
                console.log(`✅ ${isUserMode ? 'ユーザー' : 'AI'}メッセージから画像を発見: ${imageUrl}`);
                return imageUrl;
            }
        }
        console.log(`❌ ${isUserMode ? 'ユーザー' : 'AI'}メッセージにマッチする画像は見つかりませんでした`);
        return null;
    }

    function findImageMapInData(data) {
        if (data === null || typeof data !== 'object') return null;
        if (data.hasOwnProperty('image_display_extension')) {
            const potentialMap = data.image_display_extension;
            if (typeof potentialMap === 'object' && potentialMap !== null) {
                console.log("✅ 再帰探索により 'image_display_extension' を発見しました。");
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

    async function getCharacterData(characterName) {
        const context = await new Promise(resolve => {
            let retries = 2;
            const interval = setInterval(() => {
                const ctx = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') ? window.SillyTavern.getContext() : null;
                if ((ctx && ctx.character && ctx.character.name === characterName) || retries <= 0) {
                    clearInterval(interval);
                    resolve(ctx);
                }
                retries--;
            }, 500);
        });

        if (context && context.character && context.character.data && context.character.data.extensions && context.character.data.extensions.image_display_extension) {
            console.log(`✅ context APIから拡張データを検出しました: ${characterName}`);
            const imageMap = context.character.data.extensions.image_display_extension;
            return await detectImageMapExtensions(imageMap);
        }

        try {
            const url = `addchara/${characterName}/${characterName}_ext.json`;
            const response = await fetch(url);
            if (response.ok) {
                const jsonData = await response.json();
                const imageMap = findImageMapInData(jsonData);
                if (imageMap) {
                    console.log(`✅ ${characterName}_ext.json から拡張データを検出しました`);
                    return await detectImageMapExtensions(imageMap);
                }
            }
        } catch (e) {
            /* エラーは無視 */
        }
        console.warn(`⚠ ${characterName} のカスタム画像マップは見つかりませんでした。`);
        return null;
    }

    async function handleCharacterChange(newCharacter) {
        if (newCharacter === currentCharacter) return;
        console.log(`🔍 キャラクター変更を処理中: ${newCharacter || 'デフォルト画面'}`);
        currentCharacter = newCharacter;

        if (!newCharacter) {
            currentImageMap = await detectImageMapExtensions(defaultImageMap);
            updateImage();
            return;
        }

        console.log(`初めてのキャラクターです。データ取得を開始します: ${newCharacter}`);
        const customMap = await getCharacterData(newCharacter);
        currentImageMap = customMap ? { ...defaultImageMap, ...customMap } : defaultImageMap;
        imageMapCache.set(newCharacter, currentImageMap);
        updateImage();
    }

    function handleStreamingUpdate() {
        if (currentTextMode !== 'ai') {
            updateImage();
            return;
        }
        const aiMessages = Array.from(document.querySelectorAll('.mes[is_user="false"] .mes_text'));
        if (aiMessages.length === 0) return;
        const latestMessage = aiMessages[aiMessages.length - 1];
        const currentText = latestMessage.textContent;

        if (currentText === lastStreamingText) return;
        console.log(`🔄 ストリーミング中: テキスト長 ${currentText.length}文字`);
        lastStreamingText = currentText;

        if (streamingTimer) {
            clearTimeout(streamingTimer);
        }
        streamingTimer = setTimeout(() => {
            console.log(`✅ ストリーミング終了: 最終テキスト長 ${currentText.length}文字`);
            updateImage();
            streamingTimer = null;
        }, STREAMING_DELAY);
    }

    function updateImage() {
        if (isDefaultImageFailed) {
            imgElement.style.display = '';
            isDefaultImageFailed = false;
        }

        const keywordImage = findLastKeywordImage();
        let newUrl;
        if (keywordImage) {
            newUrl = keywordImage;
        } else {
            newUrl = getRandomImageSource(currentImageMap.default) || currentImageMap.default;
        }

        if (imgElement.src !== newUrl) {
            console.log(`🖼 画像を更新: ${newUrl}`);
            imgElement.src = newUrl;
            currentImageUrl = newUrl;
            imgElement.style.display = '';
        }
    }

    // --- SillyTavern EventSource イベント登録（MutationObserver の代替） ---
    function setupEventSourceListeners() {
        const context = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;

        if (context && context.eventSource && context.eventTypes) {
            const { eventSource, eventTypes } = context;

            // メッセージ生成中・ストリーミング時
            if (eventTypes.STREAM_TOKEN_RECEIVED) {
                eventSource.on(eventTypes.STREAM_TOKEN_RECEIVED, () => {
                    handleStreamingUpdate();
                });
            }

            // メッセージ描画完了時
            if (eventTypes.CHARACTER_MESSAGE_RENDERED) {
                eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, () => {
                    handleStreamingUpdate();
                });
            }
            if (eventTypes.USER_MESSAGE_RENDERED) {
                eventSource.on(eventTypes.USER_MESSAGE_RENDERED, () => {
                    updateImage();
                });
            }

            // チャット・キャラクター変更時
            const onCharacterOrChatChanged = () => {
                const detectedName = detectCharacterNameFromDOM();
                handleCharacterChange(detectedName);
            };

            if (eventTypes.CHAT_CHANGED) {
                eventSource.on(eventTypes.CHAT_CHANGED, onCharacterOrChatChanged);
            }
            if (eventTypes.CHARACTER_SELECTED) {
                eventSource.on(eventTypes.CHARACTER_SELECTED, onCharacterOrChatChanged);
            }

            console.log(`✅ SillyTavern EventSource による監視を開始しました。`);
        } else {
            console.warn("⚠️ SillyTavern EventSource が検出できませんでした。フォールバック処理を実行します。");
            // EventSource が未初期化の場合の定期確認
            setTimeout(setupEventSourceListeners, 1000);
        }
    }

    setupEventSourceListeners();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initImageDisplay();
} else {
    document.addEventListener('DOMContentLoaded', initImageDisplay);
}function initImageDisplay() {
    console.log("Image Display: 初期化を開始します。");

    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'imageDisplayState';

    // --- デフォルト値とグローバル変数の定義 ---
    const DEFAULT_WIDTH = 300, DEFAULT_HEIGHT = 200, DEFAULT_LEFT = 100, DEFAULT_TOP = 100, DEFAULT_BG_COLOR = '#000000';
    const defaultImageMap = { "default": "addchara/default" };

    let currentCharacter = null,
        currentImageMap = defaultImageMap,
        currentImageUrl = currentImageMap.default;

    let currentMode = 'normal',
        preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };

    let isDragging = false, isResizing = false, offsetX, offsetY, isCustomWindowOpen = false;
    const imageMapCache = new Map();
    let isDefaultImageFailed = false;

    let currentTextMode = 'user'; // 'user' または 'ai'
    let streamingTimer = null;
    let lastStreamingText = '';
    const STREAMING_DELAY = 1000;

    // --- 拡張子自動検出関数 ---
    const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'avif', 'bmp'];

    async function detectImageExtension(imagePath) {
        if (!imagePath) return null;
        if (imagePath.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i)) {
            return imagePath;
        }
        for (const ext of ALLOWED_EXTENSIONS) {
            const imagePathWithExt = `${imagePath}.${ext}`;
            const exists = await checkImageExists(imagePathWithExt);
            if (exists) {
                console.log(`✅ 拡張子自動検出: ${imagePathWithExt}`);
                return imagePathWithExt;
            }
        }
        console.warn(`⚠ 画像が見つかりません: ${imagePath}`);
        return null;
    }

    function checkImageExists(imageUrl) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = imageUrl;
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
    header.textContent = '画像表示エリア (ドラッグで移動)';
    imageContainer.appendChild(header);

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.id = 'bg-color-picker';
    colorPicker.value = DEFAULT_BG_COLOR;
    colorPicker.title = '背景色を変更';
    header.appendChild(colorPicker);

    const imgElement = document.createElement('img');
    imgElement.id = 'displayed-image';
    imgElement.src = currentImageMap.default;
    imageContainer.appendChild(imgElement);

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'resize-handle';
    imageContainer.appendChild(resizeHandle);

    const controlContainer = document.createElement('div');
    controlContainer.id = 'image-control-container';
    document.body.appendChild(controlContainer);

    const textModeButton = document.createElement('button');
    textModeButton.id = 'text-mode-button';
    textModeButton.textContent = 'UT';
    textModeButton.title = 'クリックでテキストモード切り替え（ユーザー / AI）';
    controlContainer.appendChild(textModeButton);

    const customButton = document.createElement('button');
    customButton.id = 'custom-button';
    customButton.textContent = 'カスタム';
    customButton.title = 'カスタムモードに切り替え / 設定を開く';
    controlContainer.appendChild(customButton);

    const maximizeButton = document.createElement('button');
    maximizeButton.id = 'maximize-button';
    maximizeButton.textContent = '最大化';
    maximizeButton.title = '画像表示エリアを最大化';
    controlContainer.appendChild(maximizeButton);

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.id = 'half-maximize-button';
    halfMaximizeButton.textContent = '左半分';
    halfMaximizeButton.title = '画像表示エリアを左半分に最大化';
    controlContainer.appendChild(halfMaximizeButton);

    const customWindow = document.createElement('div');
    customWindow.id = 'custom-window';
    document.body.appendChild(customWindow);

    const customWindowTitle = document.createElement('h3');
    customWindowTitle.textContent = 'カスタム設定';
    customWindow.appendChild(customWindowTitle);

    const closeButton = document.createElement('button');
    closeButton.className = 'close-button';
    closeButton.textContent = '×';
    customWindow.appendChild(closeButton);

    const xLabel = document.createElement('label');
    xLabel.htmlFor = 'custom-x';
    xLabel.textContent = 'X座標 (px)';
    customWindow.appendChild(xLabel);

    const xInput = document.createElement('input');
    xInput.type = 'number';
    xInput.id = 'custom-x';
    customWindow.appendChild(xInput);

    const yLabel = document.createElement('label');
    yLabel.htmlFor = 'custom-y';
    yLabel.textContent = 'Y座標 (px)';
    customWindow.appendChild(yLabel);

    const yInput = document.createElement('input');
    yInput.type = 'number';
    yInput.id = 'custom-y';
    customWindow.appendChild(yInput);

    const widthLabel = document.createElement('label');
    widthLabel.htmlFor = 'custom-width';
    widthLabel.textContent = '幅 (px)';
    customWindow.appendChild(widthLabel);

    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.id = 'custom-width';
    customWindow.appendChild(widthInput);

    const heightLabel = document.createElement('label');
    heightLabel.htmlFor = 'custom-height';
    heightLabel.textContent = '高さ (px)';
    customWindow.appendChild(heightLabel);

    const heightInput = document.createElement('input');
    heightInput.type = 'number';
    heightInput.id = 'custom-height';
    customWindow.appendChild(heightInput);

    // --- UI操作のための関数群 ---
    function updateCustomWindow() {
        xInput.value = parseInt(imageContainer.style.left) || DEFAULT_LEFT;
        yInput.value = parseInt(imageContainer.style.top) || DEFAULT_TOP;
        widthInput.value = imageContainer.offsetWidth;
        heightInput.value = imageContainer.offsetHeight;
    }

    function handleCustomInput() {
        if (currentMode === 'normal') {
            imageContainer.style.left = `${xInput.value}px`;
            imageContainer.style.top = `${yInput.value}px`;
            imageContainer.style.width = `${widthInput.value}px`;
            imageContainer.style.height = `${heightInput.value}px`;
            saveDisplayState();
        }
    }

    xInput.addEventListener('input', handleCustomInput);
    yInput.addEventListener('input', handleCustomInput);
    widthInput.addEventListener('input', handleCustomInput);
    heightInput.addEventListener('input', handleCustomInput);

    function toggleCustomWindow() {
        isCustomWindowOpen = !isCustomWindowOpen;
        if (isCustomWindowOpen) {
            customWindow.style.display = 'block';
            updateCustomWindow();
        } else {
            customWindow.style.display = 'none';
        }
    }

    function closeCustomWindow() {
        if (isCustomWindowOpen) {
            isCustomWindowOpen = false;
            customWindow.style.display = 'none';
        }
    }

    closeButton.addEventListener('click', toggleCustomWindow);
    customButton.addEventListener('click', () => {
        if (currentMode !== 'normal') {
            applyNormalMode();
            saveDisplayState();
        }
        toggleCustomWindow();
    });

    function toggleTextMode() {
        currentTextMode = currentTextMode === 'user' ? 'ai' : 'user';
        textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
        textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
        console.log(`🔄 テキストモードを切り替え: ${currentTextMode}`);
        saveDisplayState();
        updateImage();
    }

    textModeButton.addEventListener('click', toggleTextMode);

    // --- 設定保存・復元（SillyTavern extensionSettings 統合） ---
    function saveDisplayState() {
        if (currentMode === 'normal') {
            preNormalState = {
                width: imageContainer.offsetWidth,
                height: imageContainer.offsetHeight,
                left: parseInt(imageContainer.style.left) || DEFAULT_LEFT,
                top: parseInt(imageContainer.style.top) || DEFAULT_TOP
            };
        }
        const state = {
            bgColor: colorPicker.value,
            currentMode: currentMode,
            preNormalState: preNormalState,
            textMode: currentTextMode
        };

        const context = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;

        if (context && context.extensionSettings) {
            context.extensionSettings[MODULE_NAME] = state;
            if (typeof context.saveSettingsDebounced === 'function') {
                context.saveSettingsDebounced();
            }
        } else {
            localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(state));
        }
    }

    function restoreDisplayState() {
        const context = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;

        let state = context && context.extensionSettings ? context.extensionSettings[MODULE_NAME] : null;

        // 旧localStorageからの自動マイグレーション
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
                        console.log('[Image Display] localStorage から extensionSettings に移行しました。');
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
                    case 'maximized': applyMaximizeMode(); break;
                    case 'halfMaximized': applyHalfMaximizeMode(); break;
                    default: applyNormalMode(); break;
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
                left: parseInt(imageContainer.style.left),
                top: parseInt(imageContainer.style.top)
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
                left: parseInt(imageContainer.style.left),
                top: parseInt(imageContainer.style.top)
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

    document.addEventListener('mouseup', () => {
        if ((isDragging || isResizing) && currentMode === 'normal') {
            setTimeout(() => {
                saveDisplayState();
                if (isCustomWindowOpen) updateCustomWindow();
            }, 50);
        }
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

    // 画像エラーハンドラー
    imgElement.onerror = async function() {
        console.error("画像の読み込みに失敗しました:", this.src);
        if (this.src && !this.src.match(/\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i)) {
            console.log("🔄 拡張子自動検出を試みます:", this.src);
            const detectedPath = await detectImageExtension(this.src);
            if (detectedPath) {
                console.log(`✅ 拡張子を検出: ${detectedPath}`);
                this.src = detectedPath;
                return;
            }
        }
        if (this.src.match(/default\.(png|jpg|jpeg|webp|gif|avif|bmp)$/i) || this.src.endsWith('/default')) {
            isDefaultImageFailed = true;
            console.warn("⚠ デフォルト画像が見つかりません。画像表示を無効化します");
            this.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
            this.style.display = 'none';
        } else {
            this.src = currentImageMap.default;
        }
    };

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
            isResizing = false;
            imageContainer.classList.remove('resizing');
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
        }

        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });

    // 唯一の信頼できるキャラクター名検出器
    function detectCharacterNameFromDOM() {
        const nameHolder = document.querySelector('#character_name_holder');
        if (nameHolder && nameHolder.textContent) return nameHolder.textContent;
        const greetingMessage = document.querySelector('.mes[mesid="0"][is_user="false"]');
        if (greetingMessage && greetingMessage.getAttribute('ch_name')) return greetingMessage.getAttribute('ch_name');
        return null;
    }

    // 条件評価ロジック
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
        if (processed.includes('or')) {
            return processOr(processed, text);
        }
        if (processed.includes('and')) {
            return processAnd(processed, text);
        }
        return evaluateBasicCondition(processed, text);
    }

    function getRandomImageSource(imageSource) {
        if (Array.isArray(imageSource)) {
            if (imageSource.length === 0) {
                console.warn("画像配列が空です");
                return null;
            }
            const randomIndex = Math.floor(Math.random() * imageSource.length);
            const selectedImage = imageSource[randomIndex];
            console.log(`🎲 ランダム選択: ${selectedImage} (${randomIndex + 1}/${imageSource.length})`);
            return selectedImage;
        } else {
            return imageSource;
        }
    }

    function findMatchingImageUrl(text) {
        if (!text || !currentImageMap) return null;
        const keywordEntries = Object.entries(currentImageMap)
            .filter(([key]) => key !== "default")
            .map(([key, url]) => {
                return {
                    condition: key,
                    url: url,
                    complexity: (key.match(/and/g) || []).length * 10 + (key.match(/or/g) || []).length * 5 + (key.match(/[()]/g) || []).length * 3 + key.length
                };
            })
            .sort((a, b) => b.complexity - a.complexity);

        console.log(`🔍 テキスト検索: "${text}"`);
        console.log("評価する条件:", keywordEntries.map(e => e.condition));

        for (const entry of keywordEntries) {
            try {
                console.log(`--- 条件評価開始: "${entry.condition}" ---`);
                const conditionMet = evaluateCondition(entry.condition, text);
                console.log(`条件 "${entry.condition}" -> ${conditionMet}`);
                if (conditionMet) {
                    const imageSource = entry.url;
                    console.log(`✅ 条件 "${entry.condition}" にマッチ`);
                    const selectedImage = getRandomImageSource(imageSource);
                    if (selectedImage) {
                        console.log(`🖼 選択画像: ${selectedImage}`);
                        return selectedImage;
                    }
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
        console.log(`🔍 ${isUserMode ? 'ユーザー' : 'AI'}メッセージを検索: ${messages.length}件見つかりました`);

        for (let i = messages.length - 1; i >= 0; i--) {
            const text = messages[i].textContent;
            const imageUrl = findMatchingImageUrl(text);
            if (imageUrl) {
                console.log(`✅ ${isUserMode ? 'ユーザー' : 'AI'}メッセージから画像を発見: ${imageUrl}`);
                return imageUrl;
            }
        }
        console.log(`❌ ${isUserMode ? 'ユーザー' : 'AI'}メッセージにマッチする画像は見つかりませんでした`);
        return null;
    }

    function findImageMapInData(data) {
        if (data === null || typeof data !== 'object') return null;
        if (data.hasOwnProperty('image_display_extension')) {
            const potentialMap = data.image_display_extension;
            if (typeof potentialMap === 'object' && potentialMap !== null) {
                console.log("✅ 再帰探索により 'image_display_extension' を発見しました。");
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

    async function getCharacterData(characterName) {
        const context = await new Promise(resolve => {
            let retries = 2;
            const interval = setInterval(() => {
                const ctx = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function') ? window.SillyTavern.getContext() : null;
                if ((ctx && ctx.character && ctx.character.name === characterName) || retries <= 0) {
                    clearInterval(interval);
                    resolve(ctx);
                }
                retries--;
            }, 500);
        });

        if (context && context.character && context.character.data && context.character.data.extensions && context.character.data.extensions.image_display_extension) {
            console.log(`✅ context APIから拡張データを検出しました: ${characterName}`);
            const imageMap = context.character.data.extensions.image_display_extension;
            return await detectImageMapExtensions(imageMap);
        }

        try {
            const url = `addchara/${characterName}/${characterName}_ext.json`;
            const response = await fetch(url);
            if (response.ok) {
                const jsonData = await response.json();
                const imageMap = findImageMapInData(jsonData);
                if (imageMap) {
                    console.log(`✅ ${characterName}_ext.json から拡張データを検出しました`);
                    return await detectImageMapExtensions(imageMap);
                }
            }
        } catch (e) {
            /* エラーは無視 */
        }
        console.warn(`⚠ ${characterName} のカスタム画像マップは見つかりませんでした。`);
        return null;
    }

    async function handleCharacterChange(newCharacter) {
        if (newCharacter === currentCharacter) return;
        console.log(`🔍 キャラクター変更を処理中: ${newCharacter || 'デフォルト画面'}`);
        currentCharacter = newCharacter;

        if (!newCharacter) {
            currentImageMap = await detectImageMapExtensions(defaultImageMap);
            updateImage();
            return;
        }

        console.log(`初めてのキャラクターです。データ取得を開始します: ${newCharacter}`);
        const customMap = await getCharacterData(newCharacter);
        currentImageMap = customMap ? { ...defaultImageMap, ...customMap } : defaultImageMap;
        imageMapCache.set(newCharacter, currentImageMap);
        updateImage();
    }

    function handleStreamingUpdate() {
        if (currentTextMode !== 'ai') {
            updateImage();
            return;
        }
        const aiMessages = Array.from(document.querySelectorAll('.mes[is_user="false"] .mes_text'));
        if (aiMessages.length === 0) return;
        const latestMessage = aiMessages[aiMessages.length - 1];
        const currentText = latestMessage.textContent;

        if (currentText === lastStreamingText) return;
        console.log(`🔄 ストリーミング中: テキスト長 ${currentText.length}文字`);
        lastStreamingText = currentText;

        if (streamingTimer) {
            clearTimeout(streamingTimer);
        }
        streamingTimer = setTimeout(() => {
            console.log(`✅ ストリーミング終了: 最終テキスト長 ${currentText.length}文字`);
            updateImage();
            streamingTimer = null;
        }, STREAMING_DELAY);
    }

    function updateImage() {
        if (isDefaultImageFailed) {
            imgElement.style.display = '';
            isDefaultImageFailed = false;
        }

        const keywordImage = findLastKeywordImage();
        let newUrl;
        if (keywordImage) {
            newUrl = keywordImage;
        } else {
            newUrl = getRandomImageSource(currentImageMap.default) || currentImageMap.default;
        }

        if (imgElement.src !== newUrl) {
            console.log(`🖼 画像を更新: ${newUrl}`);
            imgElement.src = newUrl;
            currentImageUrl = newUrl;
            imgElement.style.display = '';
        }
    }

    // --- SillyTavern EventSource イベント登録（MutationObserver の代替） ---
    function setupEventSourceListeners() {
        const context = (window.SillyTavern && typeof window.SillyTavern.getContext === 'function')
            ? window.SillyTavern.getContext()
            : null;

        if (context && context.eventSource && context.eventTypes) {
            const { eventSource, eventTypes } = context;

            // メッセージ生成中・ストリーミング時
            if (eventTypes.STREAM_TOKEN_RECEIVED) {
                eventSource.on(eventTypes.STREAM_TOKEN_RECEIVED, () => {
                    handleStreamingUpdate();
                });
            }

            // メッセージ描画完了時
            if (eventTypes.CHARACTER_MESSAGE_RENDERED) {
                eventSource.on(eventTypes.CHARACTER_MESSAGE_RENDERED, () => {
                    handleStreamingUpdate();
                });
            }
            if (eventTypes.USER_MESSAGE_RENDERED) {
                eventSource.on(eventTypes.USER_MESSAGE_RENDERED, () => {
                    updateImage();
                });
            }

            // チャット・キャラクター変更時
            const onCharacterOrChatChanged = () => {
                const detectedName = detectCharacterNameFromDOM();
                handleCharacterChange(detectedName);
            };

            if (eventTypes.CHAT_CHANGED) {
                eventSource.on(eventTypes.CHAT_CHANGED, onCharacterOrChatChanged);
            }
            if (eventTypes.CHARACTER_SELECTED) {
                eventSource.on(eventTypes.CHARACTER_SELECTED, onCharacterOrChatChanged);
            }

            console.log(`✅ SillyTavern EventSource による監視を開始しました。`);
        } else {
            console.warn("⚠️ SillyTavern EventSource が検出できませんでした。フォールバック処理を実行します。");
            // EventSource が未初期化の場合の定期確認
            setTimeout(setupEventSourceListeners, 1000);
        }
    }

    setupEventSourceListeners();
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initImageDisplay();
} else {
    document.addEventListener('DOMContentLoaded', initImageDisplay);
}
