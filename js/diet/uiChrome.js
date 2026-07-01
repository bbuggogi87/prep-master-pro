/**
 * 파일명: uiChrome.js
 * 역할: index.html 전역 UI 크롬(토스트 알림, 하단 매크로 정보 바, 스크롤 연동 플로팅 바) 담당 모듈
 * 다른 모든 도메인 모듈이 공통으로 참조하는 기반(base) 계층이며, 특정 도메인 데이터에 의존하지 않는다.
 */

let macroBarManuallyHidden = false; // 사용자가 하단 매크로 바를 직접 닫았는지 여부 (닫은 경우 탭 전환/스크롤과 무관하게 숨김 유지)

export function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-24 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => {
        t.className = "fixed bottom-24 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none";
    }, 2500);
}

/**
 * 하단 매크로 정보 바 및 상단 '하단고정' 버튼의 표시 상태를 일괄 동기화하는 함수
 * - 식단 플래너 / 입체분석 / 체중기록 탭에서만 노출 대상이 되며, 사용자가 ✕ 버튼으로 직접 닫은 경우에는
 *   탭을 전환하거나 스크롤을 하더라도 다시 자동으로 뜨지 않고, 상단 '하단고정' 버튼을 눌렀을 때만 복귀합니다.
 */
export function applyMacroBarVisibility() {
    const macroBar = document.getElementById('sticky-macro-bar');
    const pinBtn = document.getElementById('btn-pin-macro-bar');
    if (!macroBar) return;

    const relevantTabs = ['tab-timeline', 'tab-analysis', 'tab-weight-record'];
    const isRelevantTab = relevantTabs.some(t => document.getElementById(t)?.classList.contains('block'));
    const shouldShow = isRelevantTab && !macroBarManuallyHidden;

    if (shouldShow) {
        macroBar.classList.remove('translate-y-full', 'opacity-0', 'pointer-events-none');
        macroBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
    } else {
        macroBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
        macroBar.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
    }

    if (pinBtn) {
        if (macroBarManuallyHidden) {
            pinBtn.innerHTML = '📌 하단고정';
            pinBtn.className = "flex items-center gap-1.5 px-3 py-1.5 bg-slate-800/50 border border-slate-700 text-slate-400 text-[11px] sm:text-xs font-bold rounded-lg transition-all active:scale-95 hover:text-white";
        } else {
            pinBtn.innerHTML = '📌 고정됨 ✓';
            pinBtn.className = "flex items-center gap-1.5 px-3 py-1.5 bg-sky-600/20 border border-sky-500/40 text-sky-400 text-[11px] sm:text-xs font-bold rounded-lg transition-all active:scale-95";
        }
    }
}

export function closeMacroBar() {
    macroBarManuallyHidden = true;
    try { localStorage.setItem('pmp_macrobar_hidden', '1'); } catch (e) {}
    applyMacroBarVisibility();
}

export function showMacroBar() {
    macroBarManuallyHidden = false;
    try { localStorage.setItem('pmp_macrobar_hidden', '0'); } catch (e) {}
    applyMacroBarVisibility();
    showToast("하단 매크로 정보 바가 고정되었습니다.");
}

/**
 * 이전 세션에서 사용자가 하단 매크로 바를 닫아둔 상태였는지 복원 후, 초기 표시 상태를 동기화.
 * 최초 부팅 시 1회만 호출합니다.
 */
export function initMacroBarState() {
    try { macroBarManuallyHidden = localStorage.getItem('pmp_macrobar_hidden') === '1'; } catch (e) { macroBarManuallyHidden = false; }
    applyMacroBarVisibility();
}

/**
 * 스크롤 위치에 연동되는 플로팅 메뉴바 노출 및 '맨 위로' 버튼, 뷰포트 리사이즈 시 매크로 바 숨김 처리.
 * 최초 부팅 시 1회만 호출해야 합니다(반복 호출 시 리스너가 중복 등록됩니다).
 */
export function initScrollChromeGuards() {
    const menubar = document.getElementById('tab-menu-container');
    const floatBar = document.getElementById('floating-menu-bar');
    const scrollTopBtn = document.getElementById('scroll-to-top-btn');

    // [개선] 메뉴바가 화면 밖으로 스크롤되어 사라지는 지점을 기준으로 플로팅 메뉴바를 자연스럽게(트랜지션과 함께) 노출
    window.addEventListener('scroll', function() {
        if (floatBar && menubar) {
            const triggerY = menubar.offsetTop + menubar.offsetHeight;
            if (window.scrollY > triggerY) {
                floatBar.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none');
                floatBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto');
            } else {
                floatBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
                floatBar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none');
            }
        }

        // 일정 스크롤 이상 내려갔을 때 '맨 위로' 버튼 노출
        if (scrollTopBtn) {
            if (window.scrollY > 400) {
                scrollTopBtn.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
                scrollTopBtn.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
            } else {
                scrollTopBtn.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
                scrollTopBtn.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
            }
        }
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            const bar = document.getElementById('sticky-macro-bar'); if (!bar) return;
            if (window.visualViewport.height < window.innerHeight * 0.75) bar.classList.add('hidden'); else bar.classList.remove('hidden');
        });
    }
}
