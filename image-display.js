(function () {
    'use strict';

    // --- 定数定義 ---
    const MODULE_NAME = "image_display_extension";
    const OLD_STORAGE_KEY = "image_display_extension_settings";
    const DEFAULT_WIDTH = 300;
    const DEFAULT_HEIGHT = 400;
    const DEFAULT_LEFT = 20;
    const DEFAULT_TOP = 20;
    const DEFAULT_BG_COLOR = '#000000';

    // デフォルトの画像マップ（設定ファイルがない場合やマッチしない場合に使用）
    const defaultImageMap = {
        "通常": "addchara/default/normal.png",
        "笑顔": "addchara/default/smile.png",
        "怒り": "addchara/default/angry.png"
    };

    // --- 状態変数 ---
    let currentCharacter = null;
    let currentImageMap = defaultImageMap;
    let imageMapCache = new Map();
    let preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };
    let currentMode = 'normal'; // 'normal', 'maximized', 'halfMaximized'
    let currentTextMode = 'ai'; // 'ai' または 'user'
    let isDragging = false;
    let isResizing = false;
    let isCustomWindowOpen = false;
    let offsetX = 0, offsetY = 0;
    let currentDisplayedUrl = '';

    // --- DOM要素の生成 ---
    const imageContainer = document.createElement('div');
    imageContainer.id = 'image-display-container';
    imageContainer.style.cssText = `
        position: absolute;
        width: ${DEFAULT_WIDTH}px;
        height: ${DEFAULT_HEIGHT}px;
        left: ${DEFAULT_LEFT}px;
        top: ${DEFAULT_TOP}px;
        background-color: ${DEFAULT_BG_COLOR};
        border: 2px solid #444;
        border-radius: 8px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
    `;

    const header = document.createElement('div');
    header.id = 'image-display-header';
    header.style.cssText = `
        padding: 4px 8px;
        background-color: #222;
        color: #fff;
        cursor: grab;
        display: flex;
        justify-content: space-between;
        align-items: center;
        user-select: none;
        font-size: 12px;
        border-bottom: 1px solid #444;
    `;

    const title = document.createElement('span');
    title.textContent = '画像表示';

    const controls = document.createElement('div');
    controls.style.cssText = 'display: flex; gap: 4px; align-items: center;';

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = DEFAULT_BG_COLOR;
    colorPicker.title = '背景色の変更';
    colorPicker.style.cssText = `
        border: none;
        width: 18px;
        height: 18px;
        cursor: pointer;
        background: transparent;
        padding: 0;
    `;

    const customButton = document.createElement('button');
    customButton.textContent = '⚙';
    customButton.title = 'カスタムサイズ・位置指定';
    customButton.style.cssText = `
        background: #444;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 10px;
    `;

    const textModeButton = document.createElement('button');
    textModeButton.textContent = 'AI';
    textModeButton.title = 'クリックでテキストモード切り替え（現在: AI）';
    textModeButton.style.cssText = `
        background: #444;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: bold;
    `;

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.textContent = '◧';
    halfMaximizeButton.title = '半最大化（画面左半分）';
    halfMaximizeButton.style.cssText = `
        background: #444;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 10px;
    `;

    const maximizeButton = document.createElement('button');
    maximizeButton.textContent = '□';
    maximizeButton.title = '全画面表示';
    maximizeButton.style.cssText = `
        background: #444;
        color: #fff;
        border: none;
        border-radius: 3px;
        cursor: pointer;
        padding: 2px 6px;
        font-size: 10px;
    `;

    controls.appendChild(colorPicker);
    controls.appendChild(customButton);
    controls.appendChild(textModeButton);
    controls.appendChild(halfMaximizeButton);
    controls.appendChild(maximizeButton);
    header.appendChild(title);
    header.appendChild(controls);

    const imageWrapper = document.createElement('div');
    imageWrapper.style.cssText = `
        flex: 1;
        width: 100%;
        height: calc(100% - 25px);
        display: flex;
        justify-content: center;
        align-items: center;
        position: relative;
    `;

    const displayImage = document.createElement('img');
    displayImage.style.cssText = `
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    `;

    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
        position: absolute;
        right: 0;
        bottom: 0;
        width: 15px;
        height: 15px;
        cursor: se-resize;
        background: linear-gradient(135deg, transparent 50%, #888 50%);
        z-index: 10;
    `;

    imageWrapper.appendChild(displayImage);
    imageWrapper.appendChild(resizeHandle);
    imageContainer.appendChild(header);
    imageContainer.appendChild(imageWrapper);

    // --- カスタムサイズ・位置調整ウィンドウ ---
    const customWindow = document.createElement('div');
    customWindow.id = 'image-display-custom-window';
    customWindow.style.cssText = `
        position: absolute;
        top: 35px;
        right: 10px;
        background: #2b2b2b;
        color: #fff;
        border: 1px solid #555;
        border-radius: 5px;
        padding: 10px;
        font-size: 12px;
        z-index: 10000;
        display: none;
        box-shadow: 0 4px 8px rgba(0,0,0,0.5);
    `;
    customWindow.innerHTML = `
        <div style="display:flex; justify-size:space-between; align-items:center; margin-bottom:8px;">
            <strong style="font-size:12px;">サイズ・位置指定</strong>
            <button id="close-custom-window" style="background:none; border:none; color:#fff; cursor:pointer; font-weight:bold;">✕</button>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:6px;">
            <label>幅(px): <input type="number" id="custom-width" style="width:50px; background:#111; color:#fff; border:1px solid #444;"></label>
            <label>高さ(px): <input type="number" id="custom-height" style="width:50px; background:#111; color:#fff; border:1px solid #444;"></label>
            <label>左(px): <input type="number" id="custom-left" style="width:50px; background:#111; color:#fff; border:1px solid #444;"></label>
            <label>上(px): <input type="number" id="custom-top" style="width:50px; background:#111; color:#fff; border:1px solid #444;"></label>
        </div>
    `;
    imageContainer.appendChild(customWindow);
    document.body.appendChild(imageContainer);

    // --- テキストモード切り替え ---
    textModeButton.addEventListener('click', () => {
        currentTextMode = currentTextMode === 'ai' ? 'user' : 'ai';
        textModeButton.textContent = currentTextMode === 'user' ? 'UT' : 'AI';
        textModeButton.title = `クリックでテキストモード切り替え（現在: ${currentTextMode === 'user' ? 'ユーザー' : 'AI'}）`;
        saveDisplayState();
        safeUpdateImage();
    });

    // --- 画像の存在チェック関数 ---
    async function checkImageExists(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;
        });
    }

    // --- 拡張子補完と自動フォールバック機能 ---
    async function resolveImageUrl(basePath) {
        if (!basePath) return '';
        if (basePath.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
            return basePath;
        }
        const extensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
        for (const ext of extensions) {
            const testUrl = basePath + ext;
            if (await checkImageExists(testUrl)) {
                return testUrl;
            }
        }
        return basePath;
    }

    async function detectImageMapExtensions(map) {
        const resolvedMap = {};
        for (const key in map) {
            if (map.hasOwnProperty(key)) {
                resolvedMap[key] = await resolveImageUrl(map[key]);
            }
        }
        return resolvedMap;
    }

    // --- 高度な条件式（AND / OR / NOT / カッコ対応）の構文解析・評価器 ---
    function tokenizeCondition(expr) {
        const tokens = [];
        let i = 0;
        while (i < expr.length) {
            const ch = expr[i];
            if (/\s/.test(ch)) {
                i++;
                continue;
            }
            if (ch === '(' || ch === ')') {
                tokens.push(ch);
                i++;
                continue;
            }
            if (expr.substring(i, i + 2) === '&&') {
                tokens.push('AND');
                i += 2;
                continue;
            }
            if (expr.substring(i, i + 2) === '||') {
                tokens.push('OR');
                i += 2;
                continue;
            }
            if (ch === '!') {
                tokens.push('NOT');
                i++;
                continue;
            }
            let j = i;
            while (j < expr.length) {
                const c = expr[j];
                if (/\s/.test(c) || c === '(' || c === ')' || c === '!') break;
                if (expr.substring(j, j + 2) === '&&' || expr.substring(j, j + 2) === '||') break;
                j++;
            }
            const word = expr.substring(i, j);
            if (word.toUpperCase() === 'AND') tokens.push('AND');
            else if (word.toUpperCase() === 'OR') tokens.push('OR');
            else if (word.toUpperCase() === 'NOT') tokens.push('NOT');
            else tokens.push(word);
            i = j;
        }
        return tokens;
    }

    function parseConditionExpression(tokens, text) {
        let pos = 0;

        function parseExpr() {
            let left = parseTerm();
            while (pos < tokens.length && tokens[pos] === 'OR') {
                pos++;
                let right = parseTerm();
                let prevLeft = left;
                left = () => prevLeft() || right();
            }
            return left;
        }

        function parseTerm() {
            let left = parseFactor();
            while (pos < tokens.length && tokens[pos] === 'AND') {
                pos++;
                let right = parseFactor();
                let prevLeft = left;
                left = () => prevLeft() && right();
            }
            return left;
        }

        function parseFactor() {
            if (pos < tokens.length && tokens[pos] === 'NOT') {
                pos++;
                let factor = parseFactor();
                return () => !factor();
            }
            if (pos < tokens.length && tokens[pos] === '(') {
                pos++; // consume '('
                let expr = parseExpr();
                if (pos < tokens.length && tokens[pos] === ')') {
                    pos++; // consume ')'
                }
                return expr;
            }
            let token = tokens[pos++];
            if (!token) return () => false;
            return () => text.includes(token);
        }

        const evalFunc = parseExpr();
        return evalFunc();
    }

    function evaluateCondition(conditionKey, text) {
        if (!conditionKey || !text) return false;
        try {
            const tokens = tokenizeCondition(conditionKey);
            if (tokens.length === 0) return false;
            return parseConditionExpression(tokens, text);
        } catch (e) {
            console.error('[Image Display] 条件式解析エラー:', conditionKey, e);
            return text.includes(conditionKey);
        }
    }

    // --- テキスト解析と画像URLマッチング ---
    function findMatchingImageUrl(text) {
        if (!text || !currentImageMap) return null;

        // キーの文字列長で降順ソート（より具体的・長い条件式を優先して評価）
        const sortedKeys = Object.keys(currentImageMap).sort((a, b) => b.length - a.length);

        for (const key of sortedKeys) {
            if (evaluateCondition(key, text)) {
                return currentImageMap[key];
            }
        }
        return null;
    }

    // --- メッセージテキスト取得処理 ---
    function getLatestTargetText() {
        if (currentTextMode === 'user') {
            const userMessages = document.querySelectorAll('.mes[is_user="true"] .mes_text');
            if (userMessages.length > 0) {
                return userMessages[userMessages.length - 1].textContent || '';
            }
            const inputArea = document.querySelector('#send_textarea');
            if (inputArea && inputArea.value) {
                return inputArea.value;
            }
        } else {
            const aiMessages = document.querySelectorAll('.mes[is_user="false"] .mes_text');
            if (aiMessages.length > 0) {
                return aiMessages[aiMessages.length - 1].textContent || '';
            }
        }
        return '';
    }

    function updateImageWithUrl(url) {
        if (!url) {
            url = currentImageMap['通常'] || currentImageMap[Object.keys(currentImageMap)[0]] || '';
        }
        if (url && currentDisplayedUrl !== url) {
            currentDisplayedUrl = url;
            displayImage.src = url;
        }
    }

    function safeUpdateImage() {
        const text = getLatestTargetText();
        const matchedUrl = findMatchingImageUrl(text);
        updateImageWithUrl(matchedUrl);
    }

    function handleStreamingUpdate(data) {
        if (currentTextMode !== 'ai') return;
        let text = '';
        if (typeof data === 'string') {
            text = data;
        } else if (data && typeof data.text === 'string') {
            text = data.text;
        } else {
            text = getLatestTargetText();
        }
        const matchedUrl = findMatchingImageUrl(text);
        if (matchedUrl) {
            updateImageWithUrl(matchedUrl);
        }
    }

    // --- MutationObserver による DOM 監視 ---
    function setupChatDomObserver() {
        const chatContainer = document.querySelector('#chat') || document.body;
        const observer = new MutationObserver((mutations) => {
            let shouldUpdate = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' || mutation.type === 'characterData') {
                    shouldUpdate = true;
                    break;
                }
            }
            if (shouldUpdate) {
                safeUpdateImage();
            }
        });

        observer.observe(chatContainer, {
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

    // --- EventSource 安全監視 ---
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
                
                // メッセージ削除・編集時の画像更新対応
                if (eventTypes.MESSAGE_DELETED) safeOn(eventTypes.MESSAGE_DELETED, safeUpdateImage);
                if (eventTypes.MESSAGE_EDITED) safeOn(eventTypes.MESSAGE_EDITED, safeUpdateImage);
                if (eventTypes.CHAT_LOADED) safeOn(eventTypes.CHAT_LOADED, safeUpdateImage);

                // MESSAGE_SENT / GENERATION_STARTED 時に入力文を取得して即時判定
                const handleImmediateTextMatch = (data) => {
                    if (currentTextMode !== 'user') return;

                    let sentText = "";
                    if (typeof data === 'string') {
                        sentText = data;
                    } else if (data && typeof data.text === 'string') {
                        sentText = data.text;
                    } else if (data && typeof data.message === 'string') {
                        sentText = data.message;
                    } else {
                        const inputEl = document.querySelector('#send_textarea');
                        if (inputEl && inputEl.value) {
                            sentText = inputEl.value;
                        } else {
                            // DOMから直前に追加されたユーザーメッセージ要素を取得
                            const lastUserMsg = document.querySelector('.mes[is_user="true"]:last-child .mes_text');
                            if (lastUserMsg) sentText = lastUserMsg.textContent || "";
                        }
                    }

                    if (sentText) {
                        const matchedUrl = findMatchingImageUrl(sentText);
                        if (matchedUrl) {
                            updateImageWithUrl(matchedUrl);
                            return;
                        }
                    }
                    safeUpdateImage();
                };

                safeOn(eventTypes.MESSAGE_SENT, handleImmediateTextMatch);
                if (eventTypes.GENERATION_STARTED) safeOn(eventTypes.GENERATION_STARTED, handleImmediateTextMatch);

                const onCharacterOrChatChanged = () => {
                    loadCharacterData(true);
                };

                safeOn(eventTypes.CHAT_CHANGED, onCharacterOrChatChanged);
                safeOn(eventTypes.CHARACTER_SELECTED, onCharacterOrChatChanged);

                console.log("✅ SillyTavern EventSource による監視を開始しました。");
            }
        }
    }

    // --- 初期ロードとポーリング ---
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
