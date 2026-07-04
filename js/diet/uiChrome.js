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
    // [z-index 버그 수정] z-50은 대부분의 모달(z-100 이상)보다 낮아 모달이 열린 상태에서 토스트가 그
    // 뒤에 가려 안 보였다 — index.html의 모달들이 최대 z-[100]까지 쓰고 전역 로딩 레이어가 z-[300]이므로,
    // calendar.html의 토스트와 동일하게 그 사이 값인 z-[250]으로 맞춘다.
    t.className = "fixed bottom-24 right-5 z-[250] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => {
        t.className = "fixed bottom-24 right-5 z-[250] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none";
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
    const dashboardSummary = document.getElementById('dashboard-macro-summary');

    const relevantTabs = ['tab-timeline', 'tab-analysis', 'tab-weight-record'];
    const isRelevantTab = relevantTabs.some(t => document.getElementById(t)?.classList.contains('block'));

    // [화면 최적화] 상단 매크로 대시보드는 계산기/설정 탭처럼 무관한 화면에서는 숨겨 화면 공간을 아낀다.
    // 사용자가 ✕로 직접 닫는 하단 고정 바(macroBarManuallyHidden)와는 별개의 표시 조건이다.
    if (dashboardSummary) dashboardSummary.classList.toggle('hidden', !isRelevantTab);

    if (!macroBar) return;
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
            // [일관성 수정] applyMacroBarVisibility()가 쓰는 것과 같은 클래스 조합으로 숨겨야 한다 — 이전엔
            // 여기서만 별도로 'hidden' 클래스를 썼는데, applyMacroBarVisibility는 그 클래스를 전혀 건드리지
            // 않아 두 로직이 서로의 상태를 모른 채 각자 따로 노는 문제가 있었다. 뷰포트가 다시 커지면 단순히
            // 보이기만 하는 대신 applyMacroBarVisibility()를 다시 호출해, 현재 탭/수동숨김 상태 기준 정확한
            // 표시 여부로 복원한다.
            if (window.visualViewport.height < window.innerHeight * 0.75) {
                bar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto');
                bar.classList.add('translate-y-full', 'opacity-0', 'pointer-events-none');
            } else {
                applyMacroBarVisibility();
            }
        });
    }
}
