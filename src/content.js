(function () {
  'use strict';

  if (!document.getElementById('eis-intercept-script')) {
    const script = document.createElement('script');
    script.id = 'eis-intercept-script';
    script.src = chrome.runtime.getURL('src/inject.js');
    (document.head || document.documentElement).appendChild(script);
  }
  if (window.self !== window.top) return;

  let initialized = false;
  let loading = false;
  let offset = 0;
  let cursor = null;
  let hasMore = true;
  const seenCodes = new Set();
  let postQueue = [];
  let apiLoading = false;
  let lastPathname = window.location.pathname;
  let urlSyncObserver = null;

  let cfgEnableStream = localStorage.getItem('eis_enable_stream') !== '0';
  let cfgCollapseComments = localStorage.getItem('eis_collapse_comments') !== '0';
  let cfgBlurMode = 'none';
  let cfgEnableAutoplay = localStorage.getItem('eis_enable_autoplay') === '1';
  let cfgEnableVolumeMemory = localStorage.getItem('eis_enable_vol_mem') !== '0';
  let cfgEnableScrollResume = localStorage.getItem('eis_enable_scroll_res') !== '0';
  let cfgGridCols = localStorage.getItem('eis_grid_cols') || '3';
  let scrollTargetPostCode = null;
  let apiErrorCooldown = false;
  let cooldownTimer = null;
  function isPostPage() {
    return /^\/[A-Za-z0-9]{7}$/.test(window.location.pathname);
  }
  function injectSettingsToAvatarMenu() {

    const menu = document.querySelector('.dropdown-menu, .user-menu, .avatar-menu, .context-menu, .profile-dropdown');
    if (menu && !document.getElementById('eis-open-settings-btn')) {
      const btn = document.createElement('button');
      btn.id = 'eis-open-settings-btn';
      btn.type = 'button';
      btn.className = 'dropdown-item settings-btn';
      btn.style.cursor = 'pointer';
      btn.innerHTML = `
        <img src="/static/image/settings.svg" alt="Твикер" width="16" height="16" style="filter: hue-rotate(90deg) brightness(1.2);" decoding="async">
        <span>Настройки твикера</span>
      `;
      const nativeSettingsBtn = menu.querySelector('#open-settings-btn');
      if (nativeSettingsBtn) {
        nativeSettingsBtn.parentNode.insertBefore(btn, nativeSettingsBtn.nextSibling);
      } else {
        menu.appendChild(btn);
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dropdownMenu = document.getElementById('dropdown-menu');
        if (dropdownMenu) dropdownMenu.style.display = 'none';
        openTweakerModal();
      });
    }

    const mobileMenu = document.querySelector('.me-modal');
    if (mobileMenu && !document.getElementById('eis-open-mobile-settings-btn')) {
      const btn = document.createElement('button');
      btn.id = 'eis-open-mobile-settings-btn';
      btn.type = 'button';
      btn.className = 'me-modal-item';
      btn.style.cursor = 'pointer';
      btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="stroke: var(--accent, #9146ff); width: 1.25rem; height: 1.25rem; margin-right: 0.625rem;">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        <span>Настройки твикера</span>
      `;
      const mobileSettingsBtn = mobileMenu.querySelector('#me-modal-settings');
      if (mobileSettingsBtn) {
        mobileSettingsBtn.parentNode.insertBefore(btn, mobileSettingsBtn.nextSibling);
      } else {
        mobileMenu.appendChild(btn);
      }
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const meOverlay = document.getElementById('me-modal-overlay');
        if (meOverlay) meOverlay.style.display = 'none';
        openTweakerModal();
      });
    }
  }
  function injectTweakerModal() {
    if (document.getElementById('eis-settings-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'eis-settings-modal';
    modal.className = 'settings-modal';
    modal.innerHTML = `
      <div class="eis-modal-content">
        <button class="eis-modal-close" id="eis-settings-modal-close" type="button">&times;</button>
        <div class="eis-modal-title">Eblo.id Tweaker 🌸</div>
        <div class="eis-tweak-grid">

          <div class="eis-tweak-card ${cfgEnableStream ? 'active' : ''}" id="eis-card-stream" data-tweak="stream">
            <div class="eis-tweak-icon">🔄</div>
            <div class="eis-tweak-name">Бесконечная лента</div>
          </div>

          <div class="eis-tweak-card ${cfgCollapseComments ? 'active' : ''}" id="eis-card-comments" data-tweak="comments">
            <div class="eis-tweak-icon">💬</div>
            <div class="eis-tweak-name">Сворачивать комменты</div>
          </div>

          <div class="eis-tweak-card" id="eis-card-blur" data-tweak="blur" style="opacity: 0.5; pointer-events: none; cursor: not-allowed;">
            <div class="eis-tweak-icon">🔒</div>
            <div class="eis-tweak-name">Блюр медиа (Отключено)</div>
          </div>

          <div class="eis-tweak-card ${cfgEnableAutoplay ? 'active' : ''}" id="eis-card-autoplay" data-tweak="autoplay">
            <div class="eis-tweak-icon">▶️</div>
            <div class="eis-tweak-name">Автоплей видео</div>
          </div>

          <div class="eis-tweak-card ${cfgEnableVolumeMemory ? 'active' : ''}" id="eis-card-vol-mem" data-tweak="vol-mem">
            <div class="eis-tweak-icon">🔊</div>
            <div class="eis-tweak-name">Запомнить громкость</div>
          </div>

          <div class="eis-tweak-card ${cfgEnableScrollResume ? 'active' : ''}" id="eis-card-scroll-res" data-tweak="scroll-res">
            <div class="eis-tweak-icon">📍</div>
            <div class="eis-tweak-name">Запомнить пост</div>
          </div>

          <div class="eis-tweak-card ${cfgGridCols !== '3' ? 'active' : ''}" id="eis-card-gridcols" data-tweak="gridcols">
            <button class="eis-tweak-settings-btn" id="eis-btn-gridcols-settings" type="button" title="Выбрать колонки">⚙️</button>
            <div class="eis-tweak-icon">🗂️</div>
            <div class="eis-tweak-name">Сетка главной</div>
            <div class="eis-tweak-subsettings ${cfgGridCols !== '3' ? 'show' : ''}" id="eis-sub-gridcols">
              <select id="eis-cfg-gridcols" class="eis-select">
                <option value="3" ${cfgGridCols === '3' ? 'selected' : ''}>3 колонки</option>
                <option value="4" ${cfgGridCols === '4' ? 'selected' : ''}>4 колонки</option>
                <option value="5" ${cfgGridCols === '5' ? 'selected' : ''}>5 колонок</option>
              </select>
            </div>
          </div>
        </div>
        <div class="eis-modal-footer">
          Кликните по плитке для переключения.<br>Сделано с любовью от Zarion Team ✨💖<br>
          <a href="https://github.com/iamarheys/eblo.id-tweaker" target="_blank" style="color: #ff85a2; text-decoration: underline; margin-top: 8px; display: inline-block; font-weight: bold;">GitHub 🌸</a>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const closeBtn = document.getElementById('eis-settings-modal-close');
    closeBtn.addEventListener('click', closeTweakerModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeTweakerModal();
      }
    });

    const cards = modal.querySelectorAll('.eis-tweak-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.eis-tweak-subsettings')) return;
        if (e.target.closest('.eis-tweak-settings-btn')) return;
        const tweak = card.getAttribute('data-tweak');
        toggleTweak(tweak, card);
      });
    });



    const gridGearBtn = document.getElementById('eis-btn-gridcols-settings');
    if (gridGearBtn) {
      gridGearBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const sub = document.getElementById('eis-sub-gridcols');
        if (sub) {
          sub.classList.toggle('show');
        }
      });
    }



    const selectGridCols = document.getElementById('eis-cfg-gridcols');
    if (selectGridCols) {
      selectGridCols.addEventListener('change', (e) => {
        cfgGridCols = e.target.value;
        localStorage.setItem('eis_grid_cols', cfgGridCols);
        document.documentElement.style.setProperty('--eis-grid-cols', cfgGridCols);
        const card = document.getElementById('eis-card-gridcols');
        if (card) {
          card.classList.toggle('active', cfgGridCols !== '3');
        }
      });
    }
  }
  function toggleTweak(tweak, card) {
    if (tweak === 'stream') {
      cfgEnableStream = !cfgEnableStream;
      localStorage.setItem('eis_enable_stream', cfgEnableStream ? '1' : '0');
      card.classList.toggle('active', cfgEnableStream);
      window.location.reload();
    } else if (tweak === 'comments') {
      cfgCollapseComments = !cfgCollapseComments;
      localStorage.setItem('eis_collapse_comments', cfgCollapseComments ? '1' : '0');
      card.classList.toggle('active', cfgCollapseComments);
    } else if (tweak === 'autoplay') {
      cfgEnableAutoplay = !cfgEnableAutoplay;
      localStorage.setItem('eis_enable_autoplay', cfgEnableAutoplay ? '1' : '0');
      card.classList.toggle('active', cfgEnableAutoplay);
    } else if (tweak === 'vol-mem') {
      cfgEnableVolumeMemory = !cfgEnableVolumeMemory;
      localStorage.setItem('eis_enable_vol_mem', cfgEnableVolumeMemory ? '1' : '0');
      card.classList.toggle('active', cfgEnableVolumeMemory);
    } else if (tweak === 'scroll-res') {
      cfgEnableScrollResume = !cfgEnableScrollResume;
      localStorage.setItem('eis_enable_scroll_res', cfgEnableScrollResume ? '1' : '0');
      card.classList.toggle('active', cfgEnableScrollResume);
    } else if (tweak === 'gridcols') {
      const isActive = card.classList.contains('active');
      if (isActive) {
        cfgGridCols = '3';
        localStorage.setItem('eis_grid_cols', '3');
        document.documentElement.style.setProperty('--eis-grid-cols', '3');
        card.classList.remove('active');
        const sub = document.getElementById('eis-sub-gridcols');
        if (sub) sub.classList.remove('show');
      } else {
        const selectGridCols = document.getElementById('eis-cfg-gridcols');
        cfgGridCols = selectGridCols ? selectGridCols.value : '3';
        localStorage.setItem('eis_grid_cols', cfgGridCols);
        document.documentElement.style.setProperty('--eis-grid-cols', cfgGridCols);
        card.classList.add('active');
        const sub = document.getElementById('eis-sub-gridcols');
        if (sub) sub.classList.add('show');
      }
    }
  }
  function openTweakerModal() {
    injectTweakerModal();
    const modal = document.getElementById('eis-settings-modal');
    if (modal) {
      modal.classList.add('show');
      document.body.style.overflow = 'hidden';
      document.addEventListener('keydown', onEscapeKey);
    }
  }
  function closeTweakerModal() {
    const modal = document.getElementById('eis-settings-modal');
    if (modal) {
      modal.classList.remove('show');
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onEscapeKey);
    }
  }
  function onEscapeKey(e) {
    if (e.key === 'Escape') {
      closeTweakerModal();
    }
  }
  function cleanupStream() {
    initialized = false;
    loading = false;
    offset = 0;
    cursor = null;
    hasMore = true;
    postQueue = [];
    seenCodes.clear();
    const stream = document.getElementById('eis-stream');
    if (stream) stream.remove();
    const trigger = document.getElementById('eis-trigger');
    if (trigger) trigger.remove();
    const end = document.getElementById('eis-end');
    if (end) end.remove();
    const topMarker = document.getElementById('eis-top-marker');
    if (topMarker) topMarker.remove();
    const toast = document.getElementById('eis-resume-toast');
    if (toast) toast.remove();
    if (urlSyncObserver) {
      urlSyncObserver.disconnect();
      urlSyncObserver = null;
    }
    const footer = document.querySelector('footer');
    if (footer) {
      footer.style.display = '';
    }
  }
  let isAutoScrollingToTarget = false;
  async function loadToTarget() {
    if (!scrollTargetPostCode) {
      isAutoScrollingToTarget = false;
      return;
    }
    const existing = document.querySelector(`.eis-frame-wrap[data-code="${scrollTargetPostCode}"]`);
    if (existing) {
      existing.scrollIntoView({ behavior: 'smooth', block: 'center' });
      scrollTargetPostCode = null;
      isAutoScrollingToTarget = false;
      return;
    }
    if (loading || apiLoading || apiErrorCooldown) {
      setTimeout(loadToTarget, 100);
      return;
    }
    if (!hasMore && postQueue.length === 0) {
      scrollTargetPostCode = null;
      isAutoScrollingToTarget = false;
      return;
    }
    await loadNext();
    setTimeout(loadToTarget, 100);
  }
  function showResumeToast(lastPostCode) {
    if (document.getElementById('eis-resume-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'eis-resume-toast';
    toast.className = 'eis-toast';
    toast.innerHTML = `
      <span style="font-size: 16px;">📍</span>
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <span style="font-weight: bold; color: #ff85a2;">Продолжить просмотр?</span>
        <span style="font-size: 11px; color: #a59fb6;">Вы остановились на посте <b>${lastPostCode}</b></span>
      </div>
      <button id="eis-resume-btn">Да, туда! 🌸</button>
      <button id="eis-resume-close">&times;</button>
    `;
    document.body.appendChild(toast);
    const btn = document.getElementById('eis-resume-btn');
    if (btn) {
      btn.addEventListener('click', () => {
        scrollTargetPostCode = lastPostCode;
        isAutoScrollingToTarget = true;
        loadToTarget();
        toast.remove();
      });
    }
    const closeBtn = document.getElementById('eis-resume-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        toast.remove();
      });
    }
    setTimeout(() => {
      if (document.body.contains(toast)) {
        toast.style.animation = 'eis-bounce-out 0.4s ease forwards';
        setTimeout(() => toast.remove(), 400);
      }
    }, 10000);
  }
  function buildStream() {
    if (document.getElementById('eis-stream')) return;

    const footer = document.querySelector('footer');
    if (footer) {
      footer.style.display = 'none';
    }
    seenCodes.add(window.location.pathname.slice(1));
    const originalUrl = window.location.pathname;

    const topMarker = document.createElement('div');
    topMarker.id = 'eis-top-marker';
    topMarker.setAttribute('data-url', originalUrl);
    topMarker.style.position = 'absolute';
    topMarker.style.top = '0';
    topMarker.style.left = '0';
    topMarker.style.height = '1px';
    topMarker.style.width = '1px';
    topMarker.style.pointerEvents = 'none';
    document.body.appendChild(topMarker);
    const stream = document.createElement('div');
    stream.id = 'eis-stream';
    const trigger = document.createElement('div');
    trigger.id = 'eis-trigger';
    trigger.innerHTML = '<div id="eis-spinner"><span></span><span></span><span></span></div>';
    document.body.appendChild(stream);
    document.body.appendChild(trigger);

    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !loading && !apiLoading) {
        checkTrigger();
      }
    }, { rootMargin: '1000px' });
    observer.observe(trigger);
    setupUrlSync(originalUrl);
    if (urlSyncObserver) {
      urlSyncObserver.observe(topMarker);
    }

    setTimeout(checkTrigger, 200);

    if (cfgEnableScrollResume) {
      const lastStreamRoot = localStorage.getItem('eis_last_stream_root');
      const lastPostCode = localStorage.getItem('eis_last_seen_post');
      const currentPostCode = window.location.pathname.slice(1);
      if (
        lastPostCode &&
        lastStreamRoot === currentPostCode &&
        lastPostCode !== currentPostCode &&
        /^[A-Za-z0-9]{7}$/.test(lastPostCode)
      ) {
        setTimeout(() => showResumeToast(lastPostCode), 1500);
      }

      localStorage.setItem('eis_last_stream_root', currentPostCode);
      if (lastStreamRoot !== currentPostCode) {
        localStorage.setItem('eis_last_seen_post', currentPostCode);
      }
    }
  }
  function checkTrigger() {
    if (loading || apiLoading || apiErrorCooldown || (!hasMore && postQueue.length === 0)) return;
    if (!cfgEnableStream) return;
    const trigger = document.getElementById('eis-trigger');
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const windowHeight = window.innerHeight || document.documentElement.clientHeight;

    if (rect.top <= windowHeight + 1000) {
      loadNext();
    }
  }
  async function loadNext() {
    const stream = document.getElementById('eis-stream');
    if (!stream || loading || apiLoading) return;
    loading = true;
    const spinner = document.getElementById('eis-spinner');
    if (spinner) spinner.classList.add('on');
    try {

      if (postQueue.length === 0 && hasMore) {
        apiLoading = true;
        try {
          const params = new URLSearchParams({ sort: 'best', type: 'all', time: 'today', limit: 15 });
          if (cursor) params.set('cursor', cursor);
          else params.set('offset', offset);
          const feedRes = await fetch('/api/feed?' + params.toString(), { credentials: 'same-origin' });
          if (!feedRes.ok) {
            apiErrorCooldown = true;
            if (spinner) {
              spinner.innerHTML = '<div style="color: #ff85a2; font-size: 11px; font-weight: bold; animation: eis-pulse 1s infinite alternate; text-align: center; font-family: inherit;">🌸 Ой, лапки устали (429)! Отдыхаем 10 сек... 🌸</div>';
              spinner.classList.add('on');
            }
            if (cooldownTimer) clearTimeout(cooldownTimer);
            cooldownTimer = setTimeout(() => {
              apiErrorCooldown = false;
              if (spinner) {
                spinner.innerHTML = '<span></span><span></span><span></span>';
                spinner.classList.remove('on');
              }
              checkTrigger();
            }, 10000);
            throw new Error('feed failed with status ' + feedRes.status);
          }
          const data = await feedRes.json();
          const files = data.files || [];
          hasMore = data.has_more !== false && files.length > 0;
          if (data.cursor) cursor = data.cursor;
          if (typeof data.next_offset === 'number') offset = data.next_offset;
          else offset += files.length;

          for (const file of files) {
            const code = file.short_code;
            if (code && !seenCodes.has(code) && !postQueue.includes(code)) {
              postQueue.push(code);
            }
          }
        } finally {
          apiLoading = false;
        }
      }

      if (postQueue.length > 0) {
        const postCode = postQueue.shift();
        seenCodes.add(postCode);
        const wrap = document.createElement('div');
        wrap.className = 'eis-frame-wrap';
        wrap.setAttribute('data-url', `/${postCode}`);
        wrap.setAttribute('data-code', postCode);
        const frame = document.createElement('iframe');
        frame.className = 'eis-frame';
        frame.setAttribute('data-code', postCode);
        frame.src = `/${postCode}`;
        frame.scrolling = 'no';
        frame.addEventListener('load', () => {
          try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            const parentBg = getComputedStyle(document.body).backgroundColor;
            const parentColor = getComputedStyle(document.body).color;

            doc.documentElement.classList.add('eis-iframe');
            doc.documentElement.style.setProperty('--parent-bg', parentBg);
            doc.documentElement.style.setProperty('--parent-color', parentColor);
            doc.documentElement.setAttribute('data-eis-collapse-comments', cfgCollapseComments ? '1' : '0');
            const setHeight = (forceReset) => {
              if (forceReset === true) {
                frame.style.height = '100px';
              }
              const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
              if (h > 100) frame.style.height = h + 'px';
            };

            if (cfgCollapseComments) {
              const commentsBlock = doc.querySelector('.comments-section, .comments-container, .post-comments, #comments, .comments, .comments-block, .comment-section');
              if (commentsBlock) {
                commentsBlock.style.display = 'none';
                const toggleBtn = doc.createElement('button');
                toggleBtn.className = 'eis-comments-toggle-btn';
                toggleBtn.type = 'button';
                toggleBtn.textContent = 'Развернуть комментарии';
                toggleBtn.addEventListener('click', () => {
                  if (commentsBlock.style.display === 'none') {
                    commentsBlock.style.display = 'block';
                    toggleBtn.textContent = 'Скрыть комментарии';
                    setHeight(false);
                  } else {
                    commentsBlock.style.display = 'none';
                    toggleBtn.textContent = 'Развернуть комментарии';
                    setHeight(true);
                  }
                });
                commentsBlock.parentNode.insertBefore(toggleBtn, commentsBlock);
              }
            }



            if (cfgEnableAutoplay) {
              const applyAutoplayToVideo = (video) => {
                video.muted = true;
                video.addEventListener('mouseenter', () => {
                  video.play().catch(err => console.log('[eis] Autoplay blocked:', err));
                });
                video.addEventListener('mouseleave', () => {
                  video.pause();
                });
              };
              doc.querySelectorAll('video').forEach(applyAutoplayToVideo);
              const videoObserver = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                  mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'VIDEO') {
                      applyAutoplayToVideo(node);
                    } else if (node.querySelectorAll) {
                      node.querySelectorAll('video').forEach(applyAutoplayToVideo);
                    }
                  });
                });
              });
              videoObserver.observe(doc.body, { childList: true, subtree: true });
            }

            if (cfgEnableVolumeMemory) {
              const applyVolume = (video) => {
                const savedVolume = localStorage.getItem('eis_saved_volume') || '0.5';
                const savedMuted = localStorage.getItem('eis_saved_muted') === '1';
                video.volume = parseFloat(savedVolume);
                if (!cfgEnableAutoplay) {
                  video.muted = savedMuted;
                }
                video.addEventListener('volumechange', () => {
                  if (video.muted && cfgEnableAutoplay && !video.paused) {

                  } else {
                    localStorage.setItem('eis_saved_volume', video.volume.toString());
                    localStorage.setItem('eis_saved_muted', video.muted ? '1' : '0');
                  }
                });
              };
              doc.querySelectorAll('video').forEach(applyVolume);
              const videoVolObserver = new MutationObserver(mutations => {
                mutations.forEach(mutation => {
                  mutation.addedNodes.forEach(node => {
                    if (node.tagName === 'VIDEO') {
                      applyVolume(node);
                    } else if (node.querySelectorAll) {
                      node.querySelectorAll('video').forEach(applyVolume);
                    }
                  });
                });
              });
              videoVolObserver.observe(doc.body, { childList: true, subtree: true });
              window.addEventListener('storage', (e) => {
                if (e.key === 'eis_saved_volume' || e.key === 'eis_saved_muted') {
                  const vol = localStorage.getItem('eis_saved_volume') || '0.5';
                  const mut = localStorage.getItem('eis_saved_muted') === '1';
                  doc.querySelectorAll('video').forEach(video => {
                    video.volume = parseFloat(vol);
                    if (!cfgEnableAutoplay) {
                      video.muted = mut;
                    }
                  });
                }
              });
            }
            setHeight();
            setTimeout(setHeight, 500);
            setTimeout(setHeight, 1500);
            if (window.ResizeObserver) {
              new ResizeObserver(() => setHeight(false)).observe(doc.body);
            }
            frame.style.opacity = '1';
            doc.addEventListener('click', (e) => {
              const a = e.target.closest('a[href]');
              if (!a) return;
              const href = a.getAttribute('href');
              if (href && href.startsWith('/') && !href.startsWith('//')) {
                e.preventDefault();
                window.location.href = href;
              }
            });

            setTimeout(checkTrigger, 100);
          } catch (e) {
            console.error('[eis] iframe access error:', e);
            frame.style.height = '700px';
            frame.style.opacity = '1';
            setTimeout(checkTrigger, 100);
          }
        });
        wrap.appendChild(frame);
        stream.appendChild(wrap);

        if (postCode === scrollTargetPostCode) {
          scrollTargetPostCode = null;
          setTimeout(() => {
            wrap.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 400);
        }

        if (urlSyncObserver) {
          urlSyncObserver.observe(wrap);
        }
      } else if (!hasMore) {
        showEnd(stream);
      }
    } catch (e) {
      console.error('[eis] load next error:', e);
    } finally {
      if (spinner) spinner.classList.remove('on');
      setTimeout(() => {
        loading = false;
        checkTrigger();
      }, 500);
    }
  }
  function showEnd(stream) {
    const trigger = document.getElementById('eis-trigger');
    if (trigger) trigger.remove();
    const end = document.createElement('div');
    end.id = 'eis-end';
    end.textContent = '// SYSTEM_OFFLINE: ВСЁ ПОСМОТРЕНО 👀';
    stream.appendChild(end);
  }
  function setupUrlSync(originalUrl) {
    if (urlSyncObserver) urlSyncObserver.disconnect();
    urlSyncObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          let url = entry.target.getAttribute('data-url');
          if (entry.target.id === 'eis-top-marker') {
            url = originalUrl;
          }

          const postCode = entry.target.getAttribute('data-code') || (url && url.slice(1));
          if (postCode && postCode !== 'eis-top-marker') {
            localStorage.setItem('eis_last_seen_post', postCode);
          }
        }
      });
    }, {
      rootMargin: '-30% 0px -50% 0px'
    });
  }
  function tryInit() {
    if (!document.body) return;


    document.documentElement.style.setProperty('--eis-grid-cols', cfgGridCols);
    injectSettingsToAvatarMenu();

    if (lastPathname !== window.location.pathname) {
      lastPathname = window.location.pathname;
      cleanupStream();
    }
    if (!cfgEnableStream) return;
    if (initialized || !isPostPage()) return;
    initialized = true;
    buildStream();
  }

  try {
    const originalPushState = window.history.pushState;
    window.history.pushState = function (...args) {
      originalPushState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
    };
    const originalReplaceState = window.history.replaceState;
    window.history.replaceState = function (...args) {
      originalReplaceState.apply(this, args);
      window.dispatchEvent(new Event('locationchange'));
    };
    window.addEventListener('popstate', () => {
      window.dispatchEvent(new Event('locationchange'));
    });
    window.addEventListener('locationchange', () => {
      tryInit();
    });
  } catch (e) {
    console.error('[eis] Navigation hook error:', e);
  }


  tryInit();
  setInterval(tryInit, 1000);
})();