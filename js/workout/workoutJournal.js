/**
 * 파일명: workoutJournal.js
 * 역할: 선택된 날짜의 운동 일지(종목/세트) CRUD, 종목별 휴식 타이머 설정, 빠른입력 FAB 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSave } from '../core/services.js';
import { WORKOUT_DB } from './workoutConstants.js';
import { showToast, toggleGlobalLoader, getWorkoutData } from './calendarCore.js';
import { startTimerLogic } from './restTimerEngine.js';
import { reorderArray, moveArrayItem } from '../core/reorderUtil.js';
import { reorderButtonsHTML, dragHandleHTML, initSortableList } from '../core/reorderControls.js';

let undoBuffer = null;
let exerciseSortable = null;
let setSortables = [];

export function renderWorkoutList() {
    const container = document.getElementById('workout-list-container');
    if(!container) return; container.innerHTML = '';

    const data = getWorkoutData();
    if (data.exercises.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 text-center py-12">등록된 운동이 없습니다.</p>`;
        const volLabel = document.getElementById('label-total-volume');
        if(volLabel) volLabel.innerText = "총 훈련 볼륨: 0 kg"; return;
    }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0; let setsHtml = '';
        const currentRestTime = ex.restTime || state.userInfo?.defaultRestTime || 90;

        ex.sets.forEach((set, setIdx) => {
            if (set.done) dailyTotalVolume += (set.weight * set.reps);
            const est1RM = set.weight * (1 + (set.reps / 30)); if (est1RM > max1RM) max1RM = est1RM;

            setsHtml += `
            <div class="p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs sm:text-sm space-y-1.5">
                <div class="flex items-center justify-between gap-1.5">
                    <div class="flex items-center gap-1 min-w-0">
                        ${dragHandleHTML('set-drag-handle')}
                        <span class="font-black text-amber-500 w-4 text-center shrink-0">${setIdx + 1}</span>
                        <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 outline-none text-xs min-w-0">
                            <option value="일반" ${set.type==='일반'?'selected':''}>일반</option><option value="탑" ${set.type==='탑'?'selected':''}>탑</option>
                            <option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option><option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option><option value="슈퍼" ${set.type==='슈퍼'?'selected':''}>슈퍼</option>
                        </select>
                    </div>
                    <div class="flex items-center gap-1.5 shrink-0">
                        ${reorderButtonsHTML('moveSetOrder', setIdx, ex.sets.length, 'xs', [exIdx])}
                        <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-5 h-5 accent-amber-500 cursor-pointer shrink-0">
                        <button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black text-xs px-1 shrink-0">✕</button>
                    </div>
                </div>
                <div class="flex items-center justify-center gap-3">
                    <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                        <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-6 h-7 text-slate-400 font-bold hover:text-white select-none">−</button>
                        <input type="number" step="0.1" inputmode="decimal" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-11 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.weight}">
                        <span class="text-[9px] text-slate-500 pr-1">kg</span>
                        <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-6 h-7 text-slate-400 font-bold hover:text-white select-none">＋</button>
                    </div>
                    <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                        <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-6 h-7 text-slate-400 font-bold hover:text-white select-none">−</button>
                        <input type="number" inputmode="numeric" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-9 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.reps}">
                        <span class="text-[9px] text-slate-500 pr-1">회</span>
                        <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-6 h-7 text-slate-400 font-bold hover:text-white select-none">＋</button>
                    </div>
                </div>
            </div>`;
        });

        const card = document.createElement('div');
        card.className = "bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-800/60 pb-2">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-1.5">
                        ${dragHandleHTML('exercise-drag-handle', 'text-base')}
                        <span class="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">${ex.part} · ${ex.type}</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 mt-1.5 mb-1">
                        <h3 class="text-sm font-black text-white">${ex.name}</h3>
                        <span onclick="window.openRestTimerModal(${exIdx})" class="text-[10px] font-bold bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer transition-colors active:scale-95">⏱️ 알람 (${currentRestTime}초)</span>
                    </div>
                    <p class="text-[10px] text-slate-400 font-medium">1RM 추정 최고치: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                </div>

                <div class="flex gap-1 shrink-0 items-center mr-1">
                    ${reorderButtonsHTML('moveExerciseOrder', exIdx, data.exercises.length)}
                </div>

                <button onclick="window.deleteExercise(${exIdx})" class="text-[11px] px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-md shrink-0">삭제</button>
            </div>
            <div class="space-y-1.5" id="sets-container-${exIdx}">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-1.5 border border-dashed border-slate-700 text-xs text-slate-400 hover:text-amber-400 font-bold rounded-xl bg-slate-950/20 transition-colors">+ 세트 추가</button>
        `;
        container.appendChild(card);
    });

    const totalVolumeEl = document.getElementById('label-total-volume');
    if(totalVolumeEl) totalVolumeEl.innerText = `총 훈련 볼륨: ${dailyTotalVolume.toLocaleString()} kg`;

    // [재정렬 통일] 종목(바깥) + 각 종목의 세트(안쪽, 중첩) 드래그앤드롭을 매 렌더마다 재생성한다.
    if (exerciseSortable) { exerciseSortable.destroy(); exerciseSortable = null; }
    setSortables.forEach(s => s && s.destroy()); setSortables = [];

    exerciseSortable = initSortableList(container, {
        handle: '.exercise-drag-handle',
        onReorder: (oldIdx, newIdx) => {
            if (moveArrayItem(data.exercises, oldIdx, newIdx)) { triggerSave(showToast); renderWorkoutList(); }
        },
    });
    data.exercises.forEach((ex, exIdx) => {
        const setsContainer = document.getElementById(`sets-container-${exIdx}`);
        setSortables.push(initSortableList(setsContainer, {
            handle: '.set-drag-handle',
            onReorder: (oldIdx, newIdx) => {
                if (moveArrayItem(ex.sets, oldIdx, newIdx)) { triggerSave(showToast); renderWorkoutList(); }
            },
        }));
    });
}

export function moveExerciseOrder(exIdx, action) {
    const data = getWorkoutData();
    if (reorderArray(data.exercises, exIdx, action)) {
        triggerSave(showToast); renderWorkoutList(); showToast("운동 종목 배치 순서가 수정되었습니다.");
    }
}

export function moveSetOrder(exIdx, setIdx, action) {
    const data = getWorkoutData(); const sets = data.exercises[exIdx].sets;
    if (reorderArray(sets, setIdx, action)) { triggerSave(showToast); renderWorkoutList(); }
}

export function addSet(exIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    let weight = 40, reps = 10;
    if (ex.sets.length > 0) { const lastSet = ex.sets[ex.sets.length - 1]; weight = lastSet.weight; reps = lastSet.reps; }
    ex.sets.push({ type: '일반', weight: weight, reps: reps, memo: '', done: false });
    triggerSave(showToast); renderWorkoutList();
}
export function deleteSet(exIdx, setIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    undoBuffer = { type: 'set', exIdx: setIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) };
    ex.sets.splice(setIdx, 1); triggerSave(showToast); renderWorkoutList();
    document.getElementById('btn-undo').classList.remove('hidden'); showToast("세트 기록이 제거되었습니다.");
}
export function adjSetVal(exIdx, setIdx, field, delta) {
    const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx];
    let val = (parseFloat(set[field]) || 0) + delta; if (val < 0) val = 0; set[field] = val; triggerSave(showToast); renderWorkoutList();
}
export function changeSetField(exIdx, setIdx, field, val) {
    const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx];
    if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0; else set[field] = val; triggerSave(showToast);
}
export function toggleSetComplete(exIdx, setIdx, isChecked) {
    const data = getWorkoutData(); data.exercises[exIdx].sets[setIdx].done = isChecked;
    triggerSave(showToast); renderWorkoutList();
    if (isChecked) {
        const customRestTime = data.exercises[exIdx].restTime || state.userInfo?.defaultRestTime || 90;
        const customSound = data.exercises[exIdx].alarmSound || state.userInfo?.defaultAlarmSound || '1';
        startTimerLogic(customRestTime, customSound);
    }
}
export function deleteExercise(exIdx) {
    if(confirm("이 종목 전체를 일지에서 제거할까요?")) {
        const data = getWorkoutData(); data.exercises.splice(exIdx, 1); triggerSave(showToast); renderWorkoutList();
    }
}

export function clearDailyExercises() {
    const data = getWorkoutData();
    if (data.exercises.length === 0) { showToast("삭제할 운동 정보가 존재하지 않습니다."); return; }
    if (confirm("선택하신 날짜의 모든 운동 기록을 삭제하시겠습니까?\n(신체 계측 골격근량 및 체지방 정보는 안전하게 유지됩니다)")) {
        toggleGlobalLoader(true, "당일 운동 일지 초기화 처리 중...");
        setTimeout(() => {
            data.exercises = []; triggerSave(showToast); window.renderCalendarGrid(); renderWorkoutList();
            toggleGlobalLoader(false); showToast("당일 운동 일지 기록이 초기화되었습니다.");
        }, 300);
    }
}

/**
 * 종목 전용 휴식 알람 세팅 모달 4종 함수
 */
export function openRestTimerModal(exIdx) {
    const data = getWorkoutData();
    const ex = data.exercises[exIdx]; if (!ex) return;
    const modal = document.getElementById('rest-timer-modal'); if (!modal) return;

    document.getElementById('rest-timer-ex-idx').value = exIdx;
    document.getElementById('rest-timer-sec-input').value = ex.restTime || state.userInfo?.defaultRestTime || 90;
    document.getElementById('rest-timer-sound-input').value = ex.alarmSound || state.userInfo?.defaultAlarmSound || '1';

    modal.classList.remove('hidden'); modal.classList.add('flex');
}

export function closeRestTimerModal() {
    const modal = document.getElementById('rest-timer-modal'); if (!modal) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
}

export function adjRestTimerSetting(delta) {
    const input = document.getElementById('rest-timer-sec-input'); if (!input) return;
    let val = (parseInt(input.value) || 0) + delta;
    if (val < 0) val = 0;
    input.value = val;
}

export function saveRestTimerModal() {
    const idxInput = document.getElementById('rest-timer-ex-idx'); if (!idxInput) return;
    const exIdx = parseInt(idxInput.value);
    const data = getWorkoutData();
    const ex = data.exercises[exIdx]; if (!ex) return;

    ex.restTime = parseInt(document.getElementById('rest-timer-sec-input').value) || 90;
    ex.alarmSound = document.getElementById('rest-timer-sound-input').value || '1';

    closeRestTimerModal();
    triggerSave(showToast);
    renderWorkoutList();
    showToast("종목 전용 휴식 알람이 저장되었습니다.");
}

export function triggerQuickInputFAB() {
    const modal = document.getElementById('quick-input-modal'); const select = document.getElementById('quick-select-ex-name'); select.innerHTML = '';
    Object.values(WORKOUT_DB).forEach(types => Object.values(types).forEach(names => names.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`)));
    modal.classList.remove('hidden'); modal.classList.add('flex');
}
export function closeQuickInputFABModal() { document.getElementById('quick-input-modal').classList.add('hidden'); document.getElementById('quick-input-modal').classList.remove('flex'); }
export function saveQuickInputFABModal() {
    const name = document.getElementById('quick-select-ex-name').value; const w = parseFloat(document.getElementById('quick-input-weight').value) || 0; const r = parseInt(document.getElementById('quick-input-reps').value) || 0;
    const data = getWorkoutData(); let targetEx = data.exercises.find(e => e.name === name);
    if (!targetEx) {
        let fPart = '기타', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        targetEx = { part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] }; data.exercises.push(targetEx);
    }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true });
    triggerSave(showToast); closeQuickInputFABModal(); if(document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList(); showToast("신속 등록 완료.");
}
