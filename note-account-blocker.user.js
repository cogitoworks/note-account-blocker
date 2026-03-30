// ==UserScript==
// @name         note.com Account Blocker
// @namespace    https://note.com/
// @version      2.3
// @description  noteのハッシュタグ・検索ページから特定アカウントの記事を非表示にする
// @match        https://note.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ---- ブロック用CSSを動的生成するstyle要素 ----
  const blockStyle = document.createElement('style');
  blockStyle.id = 'note-blocker-rules';
  document.head.appendChild(blockStyle);

  // ---- ボタン用の固定CSS ----
  const uiStyle = document.createElement('style');
  uiStyle.textContent = `
    .note-blocker-btn {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 9999;
      background: rgba(0,0,0,0.6);
      color: #fff;
      border: none;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      font-size: 14px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .nb-hover:hover .note-blocker-btn {
      opacity: 1;
    }
  `;
  document.head.appendChild(uiStyle);

  const STORAGE_KEY = 'note_blocked_accounts';
  const CARD_CLASS_FRAGMENT = 'timelineItemWrapper';

  // ---- ブロックリスト管理 ----
  function getBlockList() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
  }
  function addToBlockList(username) {
    const list = getBlockList();
    if (!list.includes(username)) {
      list.push(username);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
  }
  function removeFromBlockList(username) {
    const list = getBlockList().filter(u => u !== username);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  // ---- URL正規化 + ユーザー名抽出（記事URLのみ） ----
  const SYSTEM_PATHS = new Set([
    'hashtag','search','signup','login','settings',
    'notifications','premium','topics','ranking','magazine'
  ]);

  function extractUsername(href) {
    if (!href) return null;
    // 相対・絶対・クエリ付きいずれでもpathnameに正規化
    let pathname;
    try {
      pathname = new URL(href, location.origin).pathname;
    } catch {
      return null;
    }
    // 記事URL: /username/n/noteId
    const match = pathname.match(/^\/([^\/]+)\/n\//);
    if (!match) return null;
    const name = match[1];
    if (SYSTEM_PATHS.has(name)) return null;
    return name;
  }

  // ---- CSSルールを再生成 ----
  // 注: CSS側は href 属性値をそのまま見るため、相対パスと絶対パスの両方に対応
  function rebuildBlockCSS() {
    const list = getBlockList();
    if (list.length === 0) {
      blockStyle.textContent = '';
      return;
    }

    const selectors = list.flatMap(username => {
      const escaped = CSS.escape(username);
      return [
        // 相対パス: /username/n/...
        `div[class*="${CARD_CLASS_FRAGMENT}"]:has(a[href^="/${escaped}/n/"])`,
        // 絶対パス: https://note.com/username/n/...
        `div[class*="${CARD_CLASS_FRAGMENT}"]:has(a[href*="note.com/${escaped}/n/"])`
      ];
    });

    blockStyle.textContent = `${selectors.join(',\n')} { display: none !important; }`;
  }

  // ---- カード要素を探す ----
  function findCard(el) {
    let node = el;
    for (let i = 0; i < 20; i++) {
      if (!node) return null;
      const cls = node.className || '';
      if (typeof cls === 'string' && cls.includes(CARD_CLASS_FRAGMENT)) return node;
      node = node.parentElement;
    }
    return null;
  }

  // ---- ブロックボタンを付与（root自身 + 子孫、DOM再利用に対応） ----
  function addBlockButtonsInSubtree(root) {
    const blockList = getBlockList();

    const links = [];
    if (root.matches && root.matches('a[href*="/n/"]')) {
      links.push(root);
    }
    if (root.querySelectorAll) {
      links.push(...root.querySelectorAll('a[href*="/n/"]'));
    }

    links.forEach(link => {
      const href = link.getAttribute('href');
      const username = extractUsername(href);
      if (!username) return;
      if (blockList.includes(username)) return;

      const card = findCard(link);
      if (!card) return;

      // DOM再利用検出: カードの中身が別ユーザーに差し替わった場合、
      // 古いボタンを除去して再処理する
      const prevUser = card.dataset.nbUser;
      if (prevUser === username) return; // 同じユーザー、処理済み

      if (prevUser && prevUser !== username) {
        // カードが再利用された: 古いボタンを除去
        const oldBtn = card.querySelector('.note-blocker-btn');
        if (oldBtn) oldBtn.remove();
      }

      card.dataset.nbUser = username;

      card.classList.add('nb-hover');
      const pos = window.getComputedStyle(card).position;
      if (pos === 'static') card.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'note-blocker-btn';
      btn.textContent = '\u{1F6AB}';
      btn.title = `${username} をブロック`;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm(`${username} の記事を非表示にしますか？`)) {
          addToBlockList(username);
          rebuildBlockCSS();
          updatePanelList();
        }
      });

      card.appendChild(btn);
    });
  }

  // ---- MutationObserver（追加ノードを蓄積 + debounce） ----
  const pendingRoots = new Set();
  let debounceTimer = null;
  const DEBOUNCE_MS = 200;

  function handleMutations(mutations) {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          pendingRoots.add(node);
        }
      }
    }
    if (pendingRoots.size === 0) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const roots = [...pendingRoots];
      pendingRoots.clear();
      for (const root of roots) {
        if (root.isConnected) {
          addBlockButtonsInSubtree(root);
        }
      }
      debounceTimer = null;
    }, DEBOUNCE_MS);
  }

  // ---- 管理パネル ----
  function createPanel() {
    const panel = document.createElement('div');
    panel.id = 'note-blocker-panel';
    panel.style.cssText = 'position:fixed; bottom:20px; right:20px; z-index:99999; font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

    const toggle = document.createElement('button');
    toggle.textContent = '\u{1F6AB}';
    toggle.title = 'ブロックリスト管理';
    toggle.style.cssText = 'width:44px; height:44px; border-radius:50%; border:2px solid #e0e0e0; background:#fff; font-size:20px; cursor:pointer; box-shadow:0 2px 8px rgba(0,0,0,0.15); display:flex; align-items:center; justify-content:center;';

    const listPanel = document.createElement('div');
    listPanel.style.cssText = 'display:none; position:absolute; bottom:52px; right:0; width:260px; max-height:400px; background:#fff; border:1px solid #e0e0e0; border-radius:8px; box-shadow:0 4px 16px rgba(0,0,0,0.12); overflow-y:auto; padding:12px;';

    const title = document.createElement('div');
    title.textContent = 'ブロック中のアカウント';
    title.style.cssText = 'font-size:13px; font-weight:bold; margin-bottom:8px; color:#333;';
    listPanel.appendChild(title);

    const listContainer = document.createElement('div');
    listContainer.id = 'note-blocker-list';
    listPanel.appendChild(listContainer);

    const addForm = document.createElement('div');
    addForm.style.cssText = 'margin-top:8px; display:flex; gap:4px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'ユーザー名を追加';
    input.style.cssText = 'flex:1; padding:4px 8px; border:1px solid #ccc; border-radius:4px; font-size:12px;';
    const addBtn = document.createElement('button');
    addBtn.textContent = '追加';
    addBtn.style.cssText = 'padding:4px 8px; border:1px solid #ccc; border-radius:4px; background:#f5f5f5; cursor:pointer; font-size:12px;';

    const doAdd = () => {
      const val = input.value.trim().replace(/^@/,'').replace(/^https?:\/\/note\.com\//,'').replace(/\/.*/,'');
      if (val) {
        addToBlockList(val);
        input.value = '';
        rebuildBlockCSS();
        updatePanelList();
      }
    };
    addBtn.addEventListener('click', doAdd);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });

    addForm.appendChild(input);
    addForm.appendChild(addBtn);
    listPanel.appendChild(addForm);

    toggle.addEventListener('click', () => {
      const vis = listPanel.style.display !== 'none';
      listPanel.style.display = vis ? 'none' : 'block';
      if (!vis) updatePanelList();
    });

    panel.appendChild(listPanel);
    panel.appendChild(toggle);
    document.body.appendChild(panel);
  }

  function updatePanelList() {
    const container = document.getElementById('note-blocker-list');
    if (!container) return;
    const list = getBlockList();
    container.innerHTML = '';
    if (list.length === 0) {
      container.innerHTML = '<div style="font-size:12px;color:#999;padding:4px 0;">なし</div>';
      return;
    }
    list.forEach(username => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:3px 0; border-bottom:1px solid #f0f0f0;';
      const name = document.createElement('a');
      name.textContent = username;
      name.href = `https://note.com/${username}`;
      name.target = '_blank';
      name.style.cssText = 'font-size:12px; color:#555; text-decoration:none;';
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '解除';
      removeBtn.style.cssText = 'font-size:11px; padding:2px 6px; border:1px solid #ddd; border-radius:3px; background:#fff; cursor:pointer; color:#888;';
      removeBtn.addEventListener('click', () => {
        removeFromBlockList(username);
        rebuildBlockCSS();
        updatePanelList();
        addBlockButtonsInSubtree(document.body);
      });
      row.appendChild(name);
      row.appendChild(removeBtn);
      container.appendChild(row);
    });
  }

  // ---- 初期化 ----
  function init() {
    rebuildBlockCSS();
    createPanel();
    addBlockButtonsInSubtree(document.body);

    const observer = new MutationObserver(handleMutations);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(init, 300);
  } else {
    window.addEventListener('DOMContentLoaded', () => setTimeout(init, 300));
  }
})();
