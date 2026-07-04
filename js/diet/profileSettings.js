/**
 * 파일명: profileSettings.js
 * 역할: 사용자 프로필(목표 체지방/신장/체중/목표일)과 커스텀 보충제 DB 관리 모달 담당 모듈
 */

import { state, applyCustomSuppsToDB } from '../core/store.js';
import { triggerSave } from '../core/services.js';
import { showToast } from './uiChrome.js';
import { loadPhase } from './dietPlanner.js';

/**
 * 헤더 통계 배지(설정 탭의 Target BF/Height/Weight, D-Day 배지)를 현재 state 기준으로 갱신합니다.
 * 프로필 저장 직후와, 페이지 전체 새로고침(refreshView) 양쪽에서 공통으로 호출됩니다.
 */
export function updateProfileDisplays() {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const weightDisplay = document.getElementById('prof-weight-display');
    if (weightDisplay) weightDisplay.innerText = state.userInfo.weight + 'kg';

    const bfDisplay = document.getElementById('prof-bf-display');
    if (bfDisplay) bfDisplay.innerText = state.userInfo.targetBF + '%';

    const heightDisplay = document.getElementById('prof-height-display');
    if (heightDisplay) heightDisplay.innerText = state.userInfo.height + 'cm';

    const dBadge = document.getElementById('badge-target-date');
    if (dBadge) {
        if (state.userInfo.targetDate) {
            const tDate = new Date(state.userInfo.targetDate);
            const diff = Math.ceil((tDate - now) / (1000 * 60 * 60 * 24));
            dBadge.innerText = `Target Date: ${state.userInfo.targetDate.substring(5).replace('-', '.')} (D-${diff})`;
        } else {
            // [빈 목표일 처리] 목표일을 지워서 저장하면 이전에 표시되던 배지 텍스트가 그대로 남아있던 문제 —
            // targetDate가 없을 땐 배지를 비워 낡은 D-day가 계속 보이지 않도록 한다.
            dBadge.innerText = '';
        }
    }

    if (state.workouts[todayStr] && state.workouts[todayStr].weight > 0) {
        if (weightDisplay) weightDisplay.innerText = state.workouts[todayStr].weight.toFixed(2) + 'kg';
    }
}

export function openProfileModal() { document.getElementById('mod-weight-user').value=state.userInfo.weight; document.getElementById('mod-height').value=state.userInfo.height; document.getElementById('mod-bf').value=state.userInfo.targetBF; document.getElementById('mod-date').value=state.userInfo.targetDate; document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); }
export function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); }
export function saveProfileModal() {
    state.userInfo = { weight: parseFloat(document.getElementById('mod-weight-user').value)||72.5, height: parseFloat(document.getElementById('mod-height').value)||173, targetBF: parseFloat(document.getElementById('mod-bf').value)||4.0, targetDate: document.getElementById('mod-date').value };
    closeProfileModal(); triggerSave(showToast); updateProfileDisplays();
}

export function renderCustomSupps() {
    const container = document.getElementById('custom-supp-list'); if(!container) return; container.innerHTML = '';
    state.customSupps.forEach((supp, idx) => {
        container.innerHTML += `
        <div class="bg-slate-900 border border-slate-700 p-4 sm:p-5 rounded-xl flex flex-col gap-4">
            <div class="flex items-center gap-3">
                <input type="text" id="supp-name-${idx}" value="${supp.name}" placeholder="보충제 명칭" class="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold focus:border-sky-500 outline-none text-base">
                <button onclick="window.removeCustomSupp(${idx})" class="w-12 h-12 flex justify-center items-center bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-colors shrink-0" title="삭제"><span class="text-xl font-black">✕</span></button>
            </div>
            <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="flex items-center justify-between"><span class="text-slate-400">중량(g)</span><input type="number" id="supp-wt-${idx}" value="${supp.weight}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-slate-400">Kcal</span><input type="number" id="supp-k-${idx}" value="${supp.kcal}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-amber-500">탄(g)</span><input type="number" step="0.1" id="supp-c-${idx}" value="${supp.carbs}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-emerald-500">단(g)</span><input type="number" step="0.1" id="supp-p-${idx}" value="${supp.protein}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-sky-500">지(g)</span><input type="number" step="0.1" id="supp-f-${idx}" value="${supp.fat}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
            </div>
        </div>`;
    });
}
export function openMacroModal() { renderCustomSupps(); document.getElementById('macro-modal').classList.remove('hidden'); document.getElementById('macro-modal').classList.add('flex'); }
export function closeMacroModal() { document.getElementById('macro-modal').classList.add('hidden'); document.getElementById('macro-modal').classList.remove('flex'); }
export function addCustomSuppForm() { state.customSupps.push({ id: Date.now(), name: '새 보충제', weight: 30, kcal: 120, carbs: 3, protein: 20, fat: 1.5 }); renderCustomSupps(); }
export function removeCustomSupp(idx) { if (!confirm("이 보충제를 삭제하시겠습니까?")) return; state.customSupps.splice(idx, 1); renderCustomSupps(); }
export function saveMacroModal() {
    const oldNames = state.customSupps.map(s => s.name);
    let updatedSupps = [];
    for(let i=0; i<state.customSupps.length; i++) {
        let n = document.getElementById(`supp-name-${i}`).value || '보충제'+i;
        updatedSupps.push({ id: state.customSupps[i].id, name: n, weight: parseFloat(document.getElementById(`supp-wt-${i}`).value)||30, kcal: parseFloat(document.getElementById(`supp-k-${i}`).value)||0, carbs: parseFloat(document.getElementById(`supp-c-${i}`).value)||0, protein: parseFloat(document.getElementById(`supp-p-${i}`).value)||0, fat: parseFloat(document.getElementById(`supp-f-${i}`).value)||0 });
    }
    // [버그 수정] 보충제 이름을 바꾸면 applyCustomSuppsToDB()가 예전 이름의 foodDB 항목을 지우는데, 이미
    // 식단에 등록해둔 항목은 옛 이름을 그대로 들고 있어 매칭 실패로 조용히 매크로가 0으로 빠졌다 — 이름이
    // 바뀐 보충제는 기존 식단 항목의 이름도 함께 새 이름으로 갱신한다.
    const renameMap = {};
    updatedSupps.forEach((supp, i) => { if (oldNames[i] && oldNames[i] !== supp.name) renameMap[oldNames[i]] = supp.name; });
    if (Object.keys(renameMap).length > 0) {
        state.phases.forEach(phase => {
            (phase.meals || []).forEach(meal => {
                (meal.items || []).forEach(item => { if (renameMap[item.name]) item.name = renameMap[item.name]; });
            });
        });
    }
    state.customSupps = updatedSupps; applyCustomSuppsToDB(); closeMacroModal(); triggerSave(showToast); loadPhase(state.currentPhaseId);
}
