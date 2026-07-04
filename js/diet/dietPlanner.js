/**
 * 파일명: dietPlanner.js
 * 역할: 식단 플래너 탭(phases/meals/items) CRUD 및 매크로(탄단지) 실시간 계산 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSave, triggerSaveDebounced } from '../core/services.js';
import { showToast } from './uiChrome.js';
import { reorderArray, moveArrayItem } from '../core/reorderUtil.js';
import { reorderButtonsHTML, initSortableList } from '../core/reorderControls.js';
import {
    ensureExcelLib, buildHiddenListSheet, applyListValidation, styleHeaderRow,
    saveWorkbookAsFile, readWorkbookFromEvent, cellText, cellNumber,
} from '../core/excelIO.js';

let timelineSortable = null;

export function renderPhaseTabs() {
    const container = document.getElementById('phase-tabs-container');
    if(!container) return; container.innerHTML = '';
    state.phases.forEach(p => {
        const isActive = (p.id === state.currentPhaseId);
        const btnClass = isActive ? "px-5 py-3 rounded-lg text-base font-bold phase-btn-active shrink-0 transition-colors" : "px-5 py-3 rounded-lg text-base font-bold text-slate-400 hover:bg-slate-800 shrink-0 transition-colors";
        container.innerHTML += `<button onclick="window.loadPhase('${p.id}')" class="${btnClass}">${p.title}</button>`;
    });
}

export function adjAmt(mIdx, iIdx, delta) {
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    let current = parseFloat(cp.meals[mIdx].items[iIdx].amount) || 0;
    let next = current + delta; if(next < 0) next = 0;

    cp.meals[mIdx].items[iIdx].amount = next;
    triggerSave(showToast); calculateMacros(); loadPhase(state.currentPhaseId);
}

export function loadPhase(phaseId) {
    if(!state.phases.find(p => p.id === phaseId) && state.phases.length > 0) phaseId = state.phases[0].id;
    // [탭 선택 기억] 탭을 누르기만 해도(다른 데이터 변경 없이) 선택한 탭이 다음 실행 때도 그대로 유지되도록
    // 조용히(토스트 없이) 저장한다 — 기존엔 이 함수가 state.currentPhaseId만 바꾸고 저장은 안 해서, 데이터를
    // 편집하는 다른 동작을 하기 전까지는 탭 전환이 로컬 저장소에 반영되지 않았다.
    if (state.currentPhaseId !== phaseId) { state.currentPhaseId = phaseId; triggerSave(); }
    else state.currentPhaseId = phaseId;
    renderPhaseTabs();

    const cp = state.phases.find(p => p.id === phaseId); if(!cp) return;
    document.getElementById('phase-description').innerText = cp.desc;

    const container = document.getElementById('timeline-container');
    if(!container) return; container.innerHTML = '';

    cp.meals.forEach((meal, mIdx) => {
        let itemsHtml = ''; if(!meal.items) meal.items = [];
        meal.items.forEach((item, iIdx) => {
            let opts = `<optgroup label="탄수화물">` + state.foodCategories['탄수화물'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="단백질">` + state.foodCategories['단백질'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="지방">` + state.foodCategories['지방'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="야채">` + state.foodCategories['야채'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="보충제">` + (state.foodCategories['보충제'] || []).map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;

            itemsHtml += `
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-2 gap-2">
                <select onchange="window.updateItemName(${mIdx}, ${iIdx}, event.target.value)" class="bg-slate-800 text-slate-200 text-sm px-2 py-2 rounded-lg outline-none w-full sm:flex-1 sm:min-w-[90px] sm:max-w-[140px]">${opts}</select>
                <div class="flex items-center justify-between sm:justify-start gap-1.5 sm:gap-2">
                    <div class="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5 shadow-inner">
                        <button onclick="window.adjAmt(${mIdx}, ${iIdx}, -10)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-lg font-bold select-none">−</button>
                        <input type="number" inputmode="decimal" oninput="window.updateItemAmount(${mIdx}, ${iIdx}, event.target.value)" class="w-10 sm:w-14 bg-transparent text-white text-center text-base font-bold outline-none" value="${item.amount || 0}">
                        <button onclick="window.adjAmt(${mIdx}, ${iIdx}, 10)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-lg font-bold select-none">＋</button>
                    </div>
                    <span class="text-sm text-slate-400 font-bold w-2 text-center">g</span>
                    <button onclick="window.duplicateItem(${mIdx}, ${iIdx})" class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-sky-300 hover:bg-sky-500/10 rounded-lg ml-0.5 transition-colors text-sm font-black" title="복제">📋</button>
                    <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg ml-0.5 transition-colors text-base font-black">✕</button>
                </div>
            </div>`;
        });

        const workoutChecked = meal.isWorkout ? 'checked' : '';

        container.innerHTML += `
        <div class="flex items-stretch mb-6">
            <div class="relative flex flex-col items-center mr-4 sm:mr-6 w-10 shrink-0">
                <div class="absolute top-10 bottom-[-32px] w-0.5 bg-slate-800/80 z-0"></div>
                <div onclick="event.stopPropagation(); window.cycleColor(${mIdx})" class="drag-handle relative z-10 w-10 h-10 bg-${meal.color}-500 rounded-full border-4 border-[#090D16] flex items-center justify-center cursor-move shadow-[0_0_15px_rgba(14,165,233,0.4)] active:scale-110 transition-transform">
                    <span class="text-white text-base font-black select-none pointer-events-none">↕</span>
                </div>
            </div>
            <div class="glass-panel flex-1 p-4 sm:p-5 rounded-2xl border border-slate-800 w-full overflow-hidden">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-4 sm:gap-0" onclick="window.toggleCollapse(${mIdx})">
                    <div class="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-4 w-full sm:w-auto" onclick="event.stopPropagation()">
                        <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="order-1 sm:order-2 px-2 py-0.5 text-sm font-black uppercase bg-${meal.color}-500/10 text-${meal.color}-400 border border-${meal.color}-500/20 rounded-md outline-none w-full sm:w-[160px]">
                        <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="order-2 sm:order-1 bg-transparent text-white font-black text-3xl sm:text-2xl tracking-tighter cursor-pointer p-0 -ml-1 sm:ml-0">
                    </div>
                    <div class="flex gap-2 items-center self-end sm:self-auto shrink-0 mt-2 sm:mt-0" onclick="event.stopPropagation()">
                        ${reorderButtonsHTML('moveMealOrder', mIdx, cp.meals.length)}
                        <button onclick="window.openEditMealModal(${mIdx}, true)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 transition-colors">📋 복제</button>
                        <button onclick="window.openEditMealModal(${mIdx}, false)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">⚙️ 수정</button>
                        <button onclick="window.deleteMeal(${mIdx})" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded border border-slate-700 transition-colors">🗑️ 삭제</button>
                        <button onclick="window.toggleCollapse(${mIdx})" class="text-lg px-2 py-1 ml-1 text-slate-400 hover:text-white transition-colors">${meal.isCollapsed ? '🔽' : '🔼'}</button>
                    </div>
                </div>
                <div class="transition-all duration-300 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0 m-0' : 'max-h-[3000px] opacity-100 mt-5'}">
                    <div class="flex items-center gap-2 mb-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60" onclick="event.stopPropagation()">
                        <input type="checkbox" id="meal-workout-check-${mIdx}" ${workoutChecked} onchange="window.toggleMealWorkout(${mIdx}, event.target.checked)" class="w-4 h-4 accent-rose-500">
                        <label for="meal-workout-check-${mIdx}" class="text-xs font-bold text-slate-400 cursor-pointer select-none">이 일정은 훈련 스케줄입니다 (활성화 시 당일 영양소 연산 대상에서 제외)</label>
                    </div>
                    <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 메모 (예: 오후 메인 본 운동 세션)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-white font-bold outline-none focus:border-sky-500 mb-3">
                    <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-slate-200 outline-none focus:border-sky-500 mb-3 min-h-[100px] custom-scrollbar" placeholder="보충제 섭취 프로토콜 및 상세 코칭 메모">${meal.supps || ''}</textarea>
                    ${itemsHtml}
                    <button onclick="window.addItem(${mIdx})" class="w-full py-3 border border-dashed border-slate-700 text-sm sm:text-base text-slate-400 hover:text-sky-400 font-bold mt-2 rounded-xl transition-colors">+ 식품 및 보충제 추가</button>
                </div>
            </div>
        </div>`;
    });

    if (timelineSortable) { timelineSortable.destroy(); timelineSortable = null; }
    timelineSortable = initSortableList(container, {
        handle: '.drag-handle',
        onReorder: (oldIdx, newIdx) => {
            const phase = state.phases.find(p => p.id === state.currentPhaseId);
            if (moveArrayItem(phase.meals, oldIdx, newIdx)) { triggerSave(showToast); setTimeout(() => loadPhase(state.currentPhaseId), 10); }
        },
    });

    // [전환] 요약 보기가 열려 있는 상태에서 다른 탭으로 옮기거나 데이터가 바뀌면, 요약도 최신 상태로 갱신한다.
    const summaryEl = document.getElementById('phase-summary-container');
    if (summaryEl && !summaryEl.classList.contains('hidden')) renderPhaseSummary();

    calculateMacros();
}

export function moveMealOrder(mIdx, action) {
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    if (reorderArray(cp.meals, mIdx, action)) { triggerSave(showToast); loadPhase(state.currentPhaseId); }
}

export function toggleMealWorkout(mIdx, isChecked) {
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    cp.meals[mIdx].isWorkout = isChecked;
    triggerSave(showToast); calculateMacros();
}

export function openPhaseModal(isNew = false) { state.editingPhaseIsNew = isNew; if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc; } document.getElementById('phase-modal').classList.remove('hidden'); document.getElementById('phase-modal').classList.add('flex'); }
export function closePhaseModal() { document.getElementById('phase-modal').classList.add('hidden'); document.getElementById('phase-modal').classList.remove('flex'); }
export function savePhaseModal() { const title = document.getElementById('phase-title').value || '새 탭'; const desc = document.getElementById('phase-desc').value || ''; if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; } closePhaseModal(); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function deletePhase() { if(state.phases.length <= 1) { showToast("최소 1개의 탭은 유지해야 합니다."); return; } if(confirm("탭 전체를 삭제하시겠습니까? 데이터가 파괴됩니다.")) { state.phases = state.phases.filter(p => p.id !== state.currentPhaseId); triggerSave(showToast); loadPhase(state.phases[0].id); } }
export function copyPhase() { const cp = state.phases.find(p => p.id === state.currentPhaseId); state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); showToast("식단 세트 복사 완료."); }
export function pastePhase() { if (!state.clipboardMeals || state.clipboardMeals.length === 0) { showToast("복사된 세트가 없습니다."); return; } if(confirm("현재 탭의 내용이 덮어쓰기 됩니다. 진행할까요?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals = state.clipboardMeals.map(m => { let cloned = JSON.parse(JSON.stringify(m)); cloned.id = 'm' + Date.now() + Math.floor(Math.random() * 1000); return cloned; }); triggerSave(showToast); loadPhase(state.currentPhaseId); } }

export function openEditMealModal(mIdx, isDuplicate) { let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx]; else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [], isWorkout: false }; state.editingMealState = { mIdx: mIdx, isDuplicate: isDuplicate, originalItems: meal.items || [] }; document.getElementById('edit-meal-title').innerText = (isDuplicate) ? "📋 일정 복제" : (mIdx === null ? "➕ 새 일정 추가" : "⚙️ 일정 수정"); document.getElementById('edit-meal-time').value = meal.time; document.getElementById('edit-meal-label').value = meal.label; document.getElementById('edit-meal-color').value = meal.color; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || ''; document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex'); }
export function closeEditMealModal() { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); }
export function saveEditMealModal() { const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정'; const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value; const supps = document.getElementById('edit-meal-supps').value; const cp = state.phases.find(p => p.id === state.currentPhaseId); if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) { const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: explain, supps: supps, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false, isWorkout: false }; if(state.editingMealState.isDuplicate) { cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); } else { cp.meals.push(newObj); } } else { const meal = cp.meals[state.editingMealState.mIdx]; meal.time = time; meal.label = label; meal.color = color; meal.explain = explain; meal.supps = supps; } triggerSave(showToast); closeEditMealModal(); loadPhase(state.currentPhaseId); }

export function cycleColor(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; const current = cp.meals[mIdx].color || 'sky'; cp.meals[mIdx].color = colors[(colors.indexOf(current) + 1) % colors.length]; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function toggleCollapse(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; loadPhase(state.currentPhaseId); }
export function updateMealField(mIdx, field, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function updateItemName(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; triggerSave(showToast); calculateMacros(); }
// [자동 저장 효율화] 수량 입력칸은 키 입력마다 호출되므로 저장은 디바운스하고, 매크로 재계산(화면 표시)은 즉시 반영한다.
export function updateItemAmount(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; triggerSaveDebounced(showToast); calculateMacros(); }
export function deleteItem(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); }
/** 식품 항목을 복제 — 바로 아래에 동일한 이름/중량의 항목을 추가한다. */
export function duplicateItem(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const copy = JSON.parse(JSON.stringify(cp.meals[mIdx].items[iIdx])); cp.meals[mIdx].items.splice(iIdx + 1, 0, copy); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function addItem(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function deleteMeal(mIdx) { if(confirm("이 일정을 삭제하시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); } }
/** 일정(끼니) 카드를 복제 — 바로 아래에 동일한 라벨/시간/식품 구성의 일정을 추가한다. */
export function duplicateMeal(mIdx) {
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    const clone = JSON.parse(JSON.stringify(cp.meals[mIdx]));
    clone.id = 'm' + Date.now() + Math.floor(Math.random() * 1000);
    clone.isCollapsed = false;
    cp.meals.splice(mIdx + 1, 0, clone);
    triggerSave(showToast); loadPhase(state.currentPhaseId);
    showToast(`[${clone.label}] 일정이 복제되었습니다.`);
}

/**
 * [전환] 현재 탭(식단 세트)의 편집용 타임라인 대신, 식사별 총 칼로리/탄/단/지 요약을 보여준다.
 * 실제 상세 편집(삭제/복제, 인라인 수정 등)은 타임라인 쪽에서만 하므로 요약은 읽기 전용이다.
 */
export function togglePhaseSummary() {
    const timelineEl = document.getElementById('timeline-container');
    const summaryEl = document.getElementById('phase-summary-container');
    const btn = document.getElementById('btn-toggle-phase-summary');
    if (!timelineEl || !summaryEl) return;
    const willShowSummary = summaryEl.classList.contains('hidden');
    if (willShowSummary) {
        renderPhaseSummary();
        summaryEl.classList.remove('hidden'); timelineEl.classList.add('hidden');
        if (btn) { btn.classList.remove('bg-slate-800', 'text-sky-300'); btn.classList.add('bg-sky-500', 'text-slate-950'); }
    } else {
        summaryEl.classList.add('hidden'); timelineEl.classList.remove('hidden');
        if (btn) { btn.classList.remove('bg-sky-500', 'text-slate-950'); btn.classList.add('bg-slate-800', 'text-sky-300'); }
    }
}

function renderPhaseSummary() {
    const container = document.getElementById('phase-summary-container'); if (!container) return;
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    if (!cp) { container.innerHTML = ''; return; }

    const rows = [];
    let totC = 0, totP = 0, totF = 0, totK = 0;
    cp.meals.forEach(meal => {
        if (meal.isWorkout) return; // 훈련 스케줄은 실제 식사가 아니므로 나머지 화면과 동일하게 제외
        let mC = 0, mP = 0, mF = 0, mK = 0; const foodNames = [];
        (meal.items || []).forEach(item => {
            const db = state.foodDB[item.name]; const amt = item.amount || 0;
            if (item.name && !foodNames.includes(item.name)) foodNames.push(item.name);
            if (db) { mC += db.c * amt; mP += db.p * amt; mF += db.f * amt; mK += db.k * amt; }
        });
        totC += mC; totP += mP; totF += mF; totK += mK;
        rows.push({ label: meal.label, time: meal.time, foods: foodNames.length ? foodNames.join(', ') : '등록된 식품 없음', kcal: mK, carbs: mC, protein: mP, fat: mF });
    });

    if (rows.length === 0) {
        container.innerHTML = `<div class="glass-panel p-8 rounded-2xl border border-slate-800 text-center"><p class="text-sm text-slate-500">요약할 식사 일정이 없습니다.</p></div>`;
        return;
    }

    const cardsHtml = rows.map(r => `
        <div class="glass-panel p-3.5 rounded-xl border border-slate-800">
            <div class="flex justify-between items-start gap-2 mb-2">
                <div class="min-w-0"><span class="font-black text-white text-sm">${r.label}</span><span class="text-[10px] text-slate-500 ml-1.5">${r.time}</span></div>
                <span class="font-black text-amber-300 text-sm shrink-0">${Math.round(r.kcal).toLocaleString()} kcal</span>
            </div>
            <p class="text-[11px] text-slate-400 mb-2.5 break-keep leading-relaxed">${r.foods}</p>
            <div class="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div class="bg-slate-950/60 rounded-lg py-1.5"><span class="font-bold text-amber-400">${r.carbs.toFixed(1)}g</span><span class="block text-[9px] text-slate-500 mt-0.5">탄수화물</span></div>
                <div class="bg-slate-950/60 rounded-lg py-1.5"><span class="font-bold text-emerald-400">${r.protein.toFixed(1)}g</span><span class="block text-[9px] text-slate-500 mt-0.5">단백질</span></div>
                <div class="bg-slate-950/60 rounded-lg py-1.5"><span class="font-bold text-sky-400">${r.fat.toFixed(1)}g</span><span class="block text-[9px] text-slate-500 mt-0.5">지방</span></div>
            </div>
        </div>`).join('');

    container.innerHTML = `
        <div class="space-y-2 mb-2">${cardsHtml}</div>
        <div class="glass-panel p-4 rounded-xl border border-amber-500/40 bg-amber-500/5">
            <div class="flex justify-between items-center mb-2.5">
                <span class="font-black text-white text-sm">📊 총합</span>
                <span class="font-black text-amber-300 text-base">${Math.round(totK).toLocaleString()} kcal</span>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-center text-xs">
                <div class="bg-slate-950/60 rounded-lg py-2"><span class="font-bold text-amber-400">${totC.toFixed(1)}g</span><span class="block text-[9px] text-slate-500 mt-0.5">탄수화물</span></div>
                <div class="bg-slate-950/60 rounded-lg py-2"><span class="font-bold text-emerald-400">${totP.toFixed(1)}g</span><span class="block text-[9px] text-slate-500 mt-0.5">단백질</span></div>
                <div class="bg-slate-950/60 rounded-lg py-2"><span class="font-bold text-sky-400">${totF.toFixed(1)}g</span><span class="block text-[9px] text-slate-500 mt-0.5">지방</span></div>
            </div>
        </div>`;
}

export function calculateMacros() {
    let tC=0, tP=0, tF=0, tK=0; let cSrc={}, pSrc={}, fSrc={};
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    if(cp) {
        cp.meals.forEach(m => {
            if (m.isWorkout) return;
            if(m.items) {
                m.items.forEach(i => {
                    const db = state.foodDB[i.name];
                    if(db) {
                        let amt = i.amount || 0; let c=db.c*amt, p=db.p*amt, f=db.f*amt;
                        tC+=c; tP+=p; tF+=f; tK+=db.k*amt;
                        if(c>0) cSrc[i.name] = (cSrc[i.name]||0) + c;
                        if(p>0) pSrc[i.name] = (pSrc[i.name]||0) + p;
                        if(f>0) fSrc[i.name] = (fSrc[i.name]||0) + f;
                    }
                });
            }
        });
    }
    let cKcal = tC * 4, pKcal = tP * 4, fKcal = tF * 9; let totCalc = cKcal + pKcal + fKcal;
    let cPct = totCalc > 0 ? Math.round((cKcal / totCalc) * 100) : 0;
    let pPct = totCalc > 0 ? Math.round((pKcal / totCalc) * 100) : 0;
    let fPct = totCalc > 0 ? Math.round((fKcal / totCalc) * 100) : 0;

    const dKcal = document.getElementById('dash-kcal');
    if (dKcal) {
        dKcal.innerText = Math.round(tK).toLocaleString();
        document.getElementById('dash-carbs').innerHTML = `<span class="text-2xl sm:text-4xl font-black text-amber-500">${tC.toFixed(1)}g</span> <span class="text-sm sm:text-base text-amber-400/80 font-bold ml-1">(${cPct}%)</span>`;
        document.getElementById('dash-protein').innerHTML = `<span class="text-2xl sm:text-4xl font-black text-emerald-400">${tP.toFixed(1)}g</span> <span class="text-sm sm:text-base text-emerald-400/80 font-bold ml-1">(${pPct}%)</span>`;
        document.getElementById('dash-fat').innerHTML = `<span class="text-2xl sm:text-4xl font-black text-sky-400">${tF.toFixed(1)}g</span> <span class="text-sm sm:text-base text-sky-400/80 font-bold ml-1">(${fPct}%)</span>`;
    }

    const sKcal = document.getElementById('sticky-macro-bar');
    if (sKcal) {
        const sk = document.getElementById('sticky-kcal'); if(sk) sk.innerText = Math.round(tK).toLocaleString();
        const sc = document.getElementById('sticky-carbs'); if(sc) sc.innerText = `${tC.toFixed(1)}g (${cPct}%)`;
        const sp = document.getElementById('sticky-protein'); if(sp) sp.innerText = `${tP.toFixed(1)}g (${pPct}%)`;
        const sf = document.getElementById('sticky-fat'); if(sf) sf.innerText = `${tF.toFixed(1)}g (${fPct}%)`;
    }

    const pieCanvas = document.getElementById('chart-pie-macros');
    if (pieCanvas && !document.getElementById('tab-analysis').classList.contains('hidden')) {
        if (!state.pieChartInstance) {
            state.pieChartInstance = new Chart(pieCanvas.getContext('2d'), {
                type: 'doughnut', data: { labels: ['탄수화물', '단백질', '지방'], datasets: [{ data: [tC, tP, tF], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 14 } } } } }
            });
        } else {
            state.pieChartInstance.data.datasets[0].data = [tC, tP, tF]; state.pieChartInstance.update();
        }
    }
    renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc);
}

export function renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc) {
    if(!document.getElementById('src-total-c')) return;
    document.getElementById('src-total-c').innerText = `${tC.toFixed(1)}g (${cPct}%)`;
    document.getElementById('src-total-p').innerText = `${tP.toFixed(1)}g (${pPct}%)`;
    document.getElementById('src-total-f').innerText = `${tF.toFixed(1)}g (${fPct}%)`;
    const renderList = (srcObj, total, elId, colorCls) => {
        let html = ''; let sorted = Object.entries(srcObj).sort((a,b)=>b[1]-a[1]);
        sorted.forEach(([name, amt]) => {
            let pct = total > 0 ? Math.round((amt/total)*100) : 0;
            html += `<div class="mb-3"><div class="flex justify-between text-xs text-slate-300 mb-1"><span>${name}</span><span>${amt.toFixed(1)}g (${pct}%)</span></div><div class="w-full bg-slate-800 rounded-full h-2"><div class="bg-${colorCls} h-2 rounded-full" style="width: ${pct}%"></div></div></div>`;
        });
        document.getElementById(elId).innerHTML = html;
    };
    renderList(cSrc, tC, 'src-list-c', 'amber-500'); renderList(pSrc, tP, 'src-list-p', 'emerald-500'); renderList(fSrc, tF, 'src-list-f', 'sky-500');
}

/**
 * [엑셀 내보내기] 모든 탭(식단 세트)의 끼니·항목을 한 시트에 나열한다. 항목명(음식) 컬럼은 숨김 "목록" 시트의
 * state.foodDB 전체 목록을 참조하는 데이터 유효성 검사(드롭다운)를 걸어, 컴퓨터에서 열었을 때 유효한
 * 음식명을 클릭 한 번으로 고를 수 있게 한다. 탭ID/끼니ID는 재불러오기 시 정확한 끼니를 찾기 위한 내부용
 * 참조 컬럼(수정 불필요) — 지워도 탭명+끼니명으로 대체 매칭을 시도한다.
 */
export async function exportDietPlanToExcel() {
    const loader = document.getElementById('global-loading-layer'); if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }
    try {
        const ExcelJS = ensureExcelLib();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PREP MASTER PRO';
        const sheet = workbook.addWorksheet('식단');
        sheet.columns = [
            { header: '탭명', key: 'tabTitle', width: 20 },
            { header: '끼니시각', key: 'mealTime', width: 10 },
            { header: '끼니명', key: 'mealLabel', width: 22 },
            { header: '항목명(음식)', key: 'itemName', width: 22 },
            { header: '중량(g)', key: 'amount', width: 10 },
            { header: '탭ID(내부용)', key: 'tabId', width: 12 },
            { header: '끼니ID(내부용)', key: 'mealId', width: 14 },
        ];
        styleHeaderRow(sheet, 1);

        let rowCount = 0;
        state.phases.forEach(phase => {
            phase.meals.forEach(meal => {
                if (meal.items.length === 0) {
                    sheet.addRow({ tabTitle: phase.title, mealTime: meal.time, mealLabel: meal.label, itemName: '', amount: '', tabId: phase.id, mealId: meal.id });
                    rowCount++;
                    return;
                }
                meal.items.forEach(item => {
                    sheet.addRow({ tabTitle: phase.title, mealTime: meal.time, mealLabel: meal.label, itemName: item.name, amount: item.amount, tabId: phase.id, mealId: meal.id });
                    rowCount++;
                });
            });
        });

        const foodNames = Object.keys(state.foodDB);
        if (foodNames.length > 0) {
            buildHiddenListSheet(workbook, [{ header: '음식명', values: foodNames }]);
            const validationEnd = Math.max(rowCount + 1, 1) + 200; // 새로 추가할 행 여유분
            applyListValidation(sheet, 'D', 2, validationEnd, `목록!$A$2:$A$${foodNames.length + 1}`);
        }

        const pad = n => n < 10 ? '0' + n : n; const now = new Date();
        const fileName = `Diet_Plan_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
        await saveWorkbookAsFile(workbook, fileName, showToast);
    } catch (e) {
        console.error('식단 엑셀 내보내기 실패:', e);
        showToast('엑셀 내보내기에 실패했습니다.');
    } finally {
        if (loader) loader.classList.add('hidden');
    }
}

/**
 * [엑셀 불러오기] 파일 안의 끼니ID(또는 탭명+끼니명)로 기존 끼니를 찾아, 그 끼니를 참조하는 행 전체를
 * 그 끼니의 새 항목 목록으로 통째로 교체한다 — 행 편집/추가/삭제가 그대로 항목 수정/추가/삭제로 반영된다.
 * 파일에 없는(참조되지 않은) 끼니는 건드리지 않는다. 새 탭/끼니 자체는 이 기능으로 만들 수 없다(기존 앱
 * UI에서 생성).
 */
export async function importDietPlanFromExcel(event) {
    const loader = document.getElementById('global-loading-layer'); if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }
    try {
        const workbook = await readWorkbookFromEvent(event);
        if (!workbook) { if (loader) loader.classList.add('hidden'); return; }
        const sheet = workbook.getWorksheet('식단');
        if (!sheet) throw new Error('"식단" 시트를 찾을 수 없습니다. 내보내기한 원본 서식을 사용해주세요.');

        const knownMealIds = new Set();
        state.phases.forEach(p => p.meals.forEach(m => knownMealIds.add(m.id)));

        const mealItemsMap = new Map();
        let skipped = 0;
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // 헤더 행 건너뜀
            const tabTitle = cellText(row, 1); const mealLabel = cellText(row, 3);
            const itemName = cellText(row, 4); const amount = cellNumber(row, 5);
            const mealId = cellText(row, 7);

            let targetMealId = null;
            if (mealId && knownMealIds.has(mealId)) {
                targetMealId = mealId;
            } else if (tabTitle && mealLabel) {
                const phase = state.phases.find(p => p.title === tabTitle);
                const meal = phase && phase.meals.find(m => m.label === mealLabel);
                if (meal) targetMealId = meal.id;
            }
            if (!targetMealId) {
                if (tabTitle || mealLabel || itemName) skipped++;
                return;
            }
            if (!mealItemsMap.has(targetMealId)) mealItemsMap.set(targetMealId, []);
            if (itemName) mealItemsMap.get(targetMealId).push({ name: itemName, amount: amount || 0 });
        });

        let updatedMeals = 0;
        state.phases.forEach(phase => {
            phase.meals.forEach(meal => {
                if (mealItemsMap.has(meal.id)) { meal.items = mealItemsMap.get(meal.id); updatedMeals++; }
            });
        });

        triggerSave(showToast);
        loadPhase(state.currentPhaseId);
        showToast(`끼니 ${updatedMeals}개 업데이트 완료${skipped > 0 ? ` (인식 못한 행 ${skipped}개 건너뜀)` : ''}.`);
    } catch (err) {
        console.error('식단 엑셀 불러오기 실패:', err);
        alert(`불러오기 실패: ${err.message}`);
    } finally {
        if (loader) loader.classList.add('hidden');
        event.target.value = '';
    }
}
