(function () {
    'use strict';

    const MODULE_NAME = 'image_display';
    const OLD_STORAGE_KEY = 'image_display_settings';

    const DEFAULT_WIDTH = 300;
    const DEFAULT_HEIGHT = 400;
    const DEFAULT_LEFT = 20;
    const DEFAULT_TOP = 20;
    const DEFAULT_BG_COLOR = '#00000000';

    let currentMode = 'normal'; // 'normal' | 'maximized' | 'halfMaximized'
    let currentTextMode = 'ai'; // 'ai' | 'user'
    let preNormalState = { width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT, left: DEFAULT_LEFT, top: DEFAULT_TOP };

    let currentCharacter = null;
    let currentImageMap = null;
    let defaultImageMap = {};
    const imageMapCache = new Map();

    let isDragging = false;
    let isResizing = false;
    let isCustomWindowOpen = false;
    let offsetX = 0;
    let offsetY = 0;

    // --- DOM要素の生成 ---
    const imageContainer = document.createElement('div');
    imageContainer.id = 'image-display-container';
    imageContainer.style.cssText = `
        position: absolute;
        left: ${DEFAULT_LEFT}px;
        top: ${DEFAULT_TOP}px;
        width: ${DEFAULT_WIDTH}px;
        height: ${DEFAULT_HEIGHT}px;
        background-color: ${DEFAULT_BG_COLOR};
        border: 1px solid rgba(255, 255, 255, 0.2);
        box-shadow: 0 4px 10px rgba(0,0,0,0.3);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        border-radius: 8px;
        overflow: hidden;
        box-sizing: border-box;
    `;

    const header = document.createElement('div');
    header.id = 'image-display-header';
    header.style.cssText = `
        height: 28px;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 6px;
        gap: 6px;
        cursor: grab;
        user-select: none;
    `;

    const colorPicker = document.createElement('input');
    colorPicker.type = 'color';
    colorPicker.value = '#000000';
    colorPicker.style.cssText = 'width: 20px; height: 20px; border: none; cursor: pointer; background: transparent;';

    const textModeButton = document.createElement('button');
    textModeButton.textContent = 'AI';
    textModeButton.title = 'クリックでテキストモード切り替え（現在: AI）';
    textModeButton.style.cssText = 'background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; padding: 2px 6px;';

    const maximizeButton = document.createElement('button');
    maximizeButton.textContent = '🗖';
    maximizeButton.title = '全画面表示';
    maximizeButton.style.cssText = 'background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; padding: 2px 6px;';

    const halfMaximizeButton = document.createElement('button');
    halfMaximizeButton.textContent = '◧';
    halfMaximizeButton.title = '半全画面表示';
    halfMaximizeButton.style.cssText = 'background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; padding: 2px 6px;';

    const customButton = document.createElement('button');
    customButton.textContent = '⚙';
    customButton.title = 'カスタムサイズ・位置設定';
    customButton.style.cssText = 'background: rgba(255,255,255,0.2); color: #fff; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; padding: 2px 6px;';

    header.appendChild(colorPicker);
    header.appendChild(textModeButton);
    header.appendChild(maximizeButton);
    header.appendChild(halfMaximizeButton);
    header.appendChild(customButton);

    const imgElement = document.createElement('img');
    imgElement.id = 'image-display-img';
    imgElement.style.cssText = 'width: 100%; height: calc(100% - 28px); object-fit: contain; pointer-events: none;';

    const resizeHandle = document.createElement('div');
    resizeHandle.id = 'image-display-resize-handle';
    resizeHandle.style.cssText = 'position: absolute; right: 0; bottom: 0; width: 12px; height: 12px; cursor: se-resize; background: rgba(255,255,255,0.3); border-top-left-radius: 4px;';

    // カスタムウィンドウ
    const customWindow = document.createElement('div');
    customWindow.id = 'image-display-custom-window';
    customWindow.style.cssText = `
        position: absolute;
        top: 35px;
        right: 10px;
        background: rgba(20, 20, 20, 0.95);
        border: 1px solid #444;
        padding: 10px;
        border-radius: 6px;
        display: none;
        z-index: 10000;
        color: #fff;
        font-size: 12px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    `;
    customWindow.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;">
            <b style="font-size:12px;">サイズ・位置指定</b>
            <button id="close-custom-window" style="background:none; border:none; color:#aaa; cursor:pointer; font-size:14px;">✕</button>
        </div>
        <div style="display:grid; grid-template-columns: auto 1fr; gap: 6px; align-items: center;">
            <label>幅 (px):</label><input type="number" id="custom-width" style="width: 70px; background: #333; color: #fff; border: 1px solid #555; padding: 2px 4px;">
            <label>高さ (px):</label><input type="number" id="custom-height" style="width: 70px; background: #333; color: #fff; border: 1px solid #555; padding: 2px 4px;">
            <label>Left (px):</label><input type="number" id="custom-left" style="width: 70px; background: #333; color: #fff; border: 1px solid #555; padding: 2px 4px;">
            <label>Top (px):</label><input type="number" id="custom-top" style="width: 70px; background: #333; color: #fff; border: 1px solid #555; padding: 2px 4px;">
        </div>
    `;

    imageContainer.appendChild(header);
    imageContainer.appendChild(imgElement);
    imageContainer.appendChild(resizeHandle);
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

    // --- 論理演算・高度条件判定ロジック ---
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function splitTopLevel(str, delimiter) {
        const result = [];
        let current = '';
        let depth = 0;

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '(') depth++;
            else if (char === ')') depth--;

            if (depth === 0 && char === delimiter) {
                result.push(current);
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current);
        return result;
    }

    function evaluateCondition(condStr, text) {
        if (!condStr || !text) return false;

        // OR (,) による分割評価
        const orBranches = splitTopLevel(condStr, ',');
        for (const branch of orBranches) {
            if (!branch.trim()) continue;

            // AND (+) による分割評価
            const andTerms = splitTopLevel(branch, '+');
            let branchResult = true;

            for (let term of andTerms) {
                term = term.trim();
                if (!term) continue;

                let isNot = false;
                if (term.startsWith('!')) {
                    isNot = true;
                    term = term.slice(1).trim();
                }

                let termResult = false;
                if (term.startsWith('(') && term.endsWith(')')) {
                    // 二重カッコ ((keyword)) による厳密一致判定
                    if (term.startsWith('((') && term.endsWith('))')) {
                        const exactTarget = term.slice(2, -2).trim();
                        termResult = (text.trim() === exactTarget) ||
                                     new RegExp(`(?:^|\\b)${escapeRegExp(exactTarget)}(?:$|\\b)`).test(text);
                    } else {
                        // 単一カッコによるネストグループ化判定
                        const inner = term.slice(1, -1);
                        termResult = evaluateCondition(inner, text);
                    }
                } else {
                    // 通常の部分一致判定
                    termResult = text.includes(term);
                }

                if (isNot) termResult = !termResult;

                if (!termResult) {
                    branchResult = false;
                    break;
                }
            }

            if (branchResult) return true;
        }

        return false;
    }

    function findMatchingImageUrl(text) {
        if (!text || !currentImageMap) return null;

        for (const key in currentImageMap) {
            if (key === 'default' || key === 'extension') continue;
            if (evaluateCondition(key, text)) {
                return currentImageMap[key];
            }
        }

        return currentImageMap.default || null;
    }

    async function detectImageMapExtensions(map) {
        if (!map) return map;
        const updatedMap = { ...map };
        for (const key in updatedMap) {
            if (key === 'default' || typeof updatedMap[key] !== 'string') continue;
            const path = updatedMap[key];
            if (!/\.(png|jpg|jpeg|gif|webp)$/i.test(path)) {
                for (const ext of ['png', 'webp', 'jpg', 'gif']) {
                    try {
                        const testUrl = `${path}.${ext}`;
                        const res = await fetch(testUrl, { method: 'HEAD' });
                        if (res.ok) {
                            updatedMap[key] = testUrl;
                            break;
                        }
                    } catch (e) {}
                }
            }
        }
        return updatedMap;
    }

    function updateImageWithUrl(url) {
        if (url && imgElement.src !== url) {
            imgElement.src = url;
            imgElement.style.display = 'block';
        } else if (!url) {
            imgElement.style.display = 'none';
        }
    }

    function safeUpdateImage() {
        let targetText = "";
        if (currentTextMode === 'user') {
            const userMsgs = document.querySelectorAll('.mes[is_user="true"] .mes_text');
            if (userMsgs.length > 0) {
                targetText = userMsgs[userMsgs.length - 1].textContent || "";
            }
        } else {
            const aiMsgs = document.querySelectorAll('.mes[is_user="false"] .mes_text, .mes:not([is_user="true"]) .mes_text');
            if (aiMsgs.length > 0) {
                targetText = aiMsgs[aiMsgs.length - 1].textContent || "";
            }
        }

        if (targetText) {
            const matchedUrl = findMatchingImageUrl(targetText);
            updateImageWithUrl(matchedUrl);
        }
    }

    function handleStreamingUpdate(data) {
        if (currentTextMode !== 'ai') return;
        let streamText = "";
        if (typeof data === 'string') {
            streamText = data;
        } else if (data && typeof data.text === 'string') {
            streamText = data.text;
        }
        if (streamText) {
            const matchedUrl = findMatchingImageUrl(streamText);
            if (matchedUrl) updateImageWithUrl(matchedUrl);
        }
    }

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
            if (shouldUpdate) safeUpdateImage();
        });
        observer.observe(chatContainer, { childList: true, subtree: true, characterData: true });
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
        maximizeButton.classList.remove('disabled'); 
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
