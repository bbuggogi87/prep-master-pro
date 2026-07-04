/**
 * 파일명: workoutJournal.js
 * 역할: 선택된 날짜의 운동 일지(종목/세트) CRUD, 종목별 휴식 타이머 설정, 빠른입력 패널 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSave, triggerSaveDebounced } from '../core/services.js';
import { WORKOUT_DB } from './workoutConstants.js';
import { showToast, toggleGlobalLoader, getWorkoutData, stripNumberingSuffix } from './calendarCore.js';
import { startTimerLogic } from './restTimerEngine.js';
import { reorderArray, moveArrayItem } from '../core/reorderUtil.js';
import { reorderButtonsHTML, dragHandleHTML, initSortableList } from '../core/reorderControls.js';
import {
    ensureExcelLib, buildHiddenListSheet, applyListValidation, styleHeaderRow,
    saveWorkbookAsFile, readWorkbookFromEvent, cellText, cellNumber,
} from '../core/excelIO.js';

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
        if(volLabel) volLabel.innerText = "총 훈련 볼륨: 0 kg";
        syncSelectAllCheckbox([]); return;
    }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0; let setsHtml = '';
        const currentRestTime = ex.restTime || state.userInfo?.defaultRestTime || 90;
        // [이전기록] 동일 종목(넘버링 무시)을 과거에 수행한 적이 있으면 '이전기록' 버튼과 '최근기록' 요약을 함께 노출한다.
        const prevRecords = getPreviousRecordsForExercise(ex.name, state.selectedDateStr);
        const lastRecordLabel = getMostRecentBestSetLabel(prevRecords);

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
                        <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="set-done-checkbox w-5 h-5 accent-amber-500 cursor-pointer shrink-0">
                        <button onclick="window.duplicateSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-sky-400 font-black text-xs px-1 shrink-0" title="세트 복제">⧉</button>
                        <button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black text-xs px-1 shrink-0" title="세트 삭제">✕</button>
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
                        <h3 class="text-sm font-black text-white group/exname">${ex.name}
                            <button onclick="window.openLibraryForExerciseReplace(${exIdx})" class="opacity-0 group-hover/exname:opacity-100 focus:opacity-100 text-[10px] font-bold text-slate-500 hover:text-amber-400 transition-opacity align-middle ml-1" title="이 종목 교체하기">⇄ 교체</button>
                        </h3>
                        <span onclick="window.openRestTimerModal(${exIdx})" class="text-[10px] font-bold bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer transition-colors active:scale-95">⏱️ 알람 (${currentRestTime}초)</span>
                        ${prevRecords.length > 0 ? `<button onclick="window.openPreviousRecordModal(${exIdx})" class="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline underline-offset-2">이전기록</button>` : ''}
                    </div>
                    <p class="text-[10px] text-slate-400 font-medium">1RM 추정 최고치: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                    <p class="text-[10px] text-slate-500 font-medium">최근기록: ${lastRecordLabel || '--'}</p>
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
    syncSelectAllCheckbox(data.exercises.flatMap(ex => ex.sets));

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

/**
 * "All [ ]" 헤더 체크박스를 현재 세트들의 완료 상태와 동기화한다(전부 완료=체크, 일부만=불확정, 없음/전부미완료=해제).
 */
function syncSelectAllCheckbox(allSets) {
    const chk = document.getElementById('chk-select-all-sets');
    if (!chk) return;
    if (allSets.length === 0) { chk.checked = false; chk.indeterminate = false; return; }
    const doneCount = allSets.filter(s => s.done).length;
    chk.checked = doneCount === allSets.length;
    chk.indeterminate = doneCount > 0 && doneCount < allSets.length;
}

/**
 * 훈련 일지 상단 "All [ ]" 체크박스 — 오늘 일지의 모든 세트를 한 번에 완료/미완료 처리한다.
 * 개별적으로 체크해 둔 상태를 전부 덮어쓰는 동작이라 실수 방지용 확인창을 반드시 거친다.
 */
export function toggleAllSetsComplete(checked) {
    const chk = document.getElementById('chk-select-all-sets');
    const data = getWorkoutData();
    const allSets = data.exercises.flatMap(ex => ex.sets);
    if (allSets.length === 0) { showToast("체크할 세트가 없습니다."); if (chk) chk.checked = false; return; }

    const msg = checked
        ? "훈련 일지의 모든 세트를 완료 표시할까요?\n(개별적으로 체크해 둔 상태가 모두 덮어씌워집니다)"
        : "훈련 일지의 모든 세트를 완료 해제할까요?\n(개별적으로 체크해 둔 상태가 모두 덮어씌워집니다)";
    if (!confirm(msg)) { if (chk) chk.checked = !checked; return; }

    allSets.forEach(s => { s.done = checked; });
    triggerSave(showToast); renderWorkoutList();
    showToast(checked ? "모든 세트를 완료 처리했습니다." : "모든 세트의 완료 표시를 해제했습니다.");
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
    undoBuffer = { type: 'set', exIdx: exIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) };
    ex.sets.splice(setIdx, 1); triggerSave(showToast); renderWorkoutList();
    document.getElementById('btn-undo').classList.remove('hidden'); showToast("세트 기록이 제거되었습니다.");
}
/** [되돌리기] 세트 삭제 직후 나타나는 "되돌리기" 버튼이 호출 — 지웠던 세트를 원래 위치에 되살린다. */
export function undoLastDelete() {
    const btn = document.getElementById('btn-undo');
    if (!undoBuffer) { if (btn) btn.classList.add('hidden'); return; }
    if (undoBuffer.type === 'set') {
        const data = getWorkoutData(); const ex = data.exercises[undoBuffer.exIdx];
        if (ex) {
            const insertAt = Math.min(undoBuffer.setIdx, ex.sets.length);
            ex.sets.splice(insertAt, 0, undoBuffer.data);
            triggerSave(showToast); renderWorkoutList(); showToast("세트 기록이 복원되었습니다.");
        } else {
            showToast("해당 종목을 찾을 수 없어 복원에 실패했습니다.");
        }
    }
    undoBuffer = null;
    if (btn) btn.classList.add('hidden');
}

/**
 * [이전기록] 오늘(선택된 날짜)을 제외한 과거 날짜들 중 동일 종목을 수행한 기록을 최신순으로 모두 반환한다.
 * [넘버링 통합] "벤치프레스"와 "벤치프레스 (2)"는 넘버링을 뗀 기저 이름으로 비교해 같은 종목으로 인식한다
 * — 다만 하루에 같은 기저 종목을 여러 번 넣은 경우(중복 추가) 데이터가 서로 다르므로, 항목별로 원래 이름
 * (label)과 그 날짜 exercises 배열 안에서의 위치(sourceIdx)를 함께 들고 있어 각각 따로 불러올 수 있게 한다.
 * @returns {Array<{date:string, label:string, sourceIdx:number, restTime:number, alarmSound:string, sets:Array}>}
 */
function getPreviousRecordsForExercise(name, excludeDateStr) {
    const baseName = stripNumberingSuffix(name);
    const records = [];
    Object.keys(state.workouts).forEach(dateStr => {
        if (dateStr === excludeDateStr) return;
        const data = state.workouts[dateStr];
        if (!data || !data.exercises) return;
        data.exercises.forEach((ex, sourceIdx) => {
            if (stripNumberingSuffix(ex.name) === baseName && ex.sets && ex.sets.length > 0) {
                records.push({ date: dateStr, label: ex.name, sourceIdx, restTime: ex.restTime, alarmSound: ex.alarmSound, sets: ex.sets });
            }
        });
    });
    records.sort((a, b) => new Date(b.date) - new Date(a.date));
    return records;
}

/** [이전기록] 세트 목록 중 가장 무거운 세트의 무게·횟수를 "60kg × 8회" 형태 문자열로 반환한다. */
function formatBestSetLabel(sets) {
    if (!sets || sets.length === 0) return null;
    const best = sets.reduce((b, s) => (!b || s.weight > b.weight) ? s : b, null);
    return `${best.weight}kg × ${best.reps}회`;
}

/**
 * [최근기록] 가장 최근 날짜에 이 종목(넘버링 무시)을 수행했을 때의 최고 중량 세트를 표시한다. 그 날짜에
 * 같은 기저 종목을 중복 추가(넘버링)해서 여러 번 기록했다면, 그 날의 모든 인스턴스 세트를 합쳐서 최고
 * 중량을 계산한다 — 예) "벤치프레스" 100kg×8, "벤치프레스 (2)" 80kg×8 이었다면 "100kg × 8회"로 표기.
 */
function getMostRecentBestSetLabel(records) {
    if (records.length === 0) return null;
    const mostRecentDate = records[0].date;
    const combinedSets = records.filter(r => r.date === mostRecentDate).flatMap(r => r.sets);
    return formatBestSetLabel(combinedSets);
}

/** [이전기록] 종목 카드의 '이전기록' 버튼을 누르면 과거 수행 기록을 최신순으로 나열한 팝업을 띄운다. */
export function openPreviousRecordModal(exIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    if (!ex) return;
    const records = getPreviousRecordsForExercise(ex.name, state.selectedDateStr);
    const titleEl = document.getElementById('previous-record-title');
    if (titleEl) titleEl.innerText = `📜 이전기록 · ${stripNumberingSuffix(ex.name)}`;
    const listEl = document.getElementById('previous-record-list');
    if (listEl) {
        if (records.length === 0) {
            listEl.innerHTML = `<p class="text-sm text-slate-500 text-center py-8">이전에 수행한 기록이 없습니다.</p>`;
        } else {
            // [중복 구분] 같은 날짜에 기록이 2개 이상이면(그날 중복 추가했던 경우) 날짜만으로는 구분이 안
            // 되므로, 그 날짜의 모든 항목에 원래 종목명(넘버링 포함)을 함께 표시해 사용자가 구분할 수 있게 한다.
            const dateCounts = {};
            records.forEach(r => { dateCounts[r.date] = (dateCounts[r.date] || 0) + 1; });
            listEl.innerHTML = records.map(r => `
                <div class="bg-slate-950/60 border border-slate-800 rounded-xl p-3 space-y-2">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-black text-white">${r.date}${dateCounts[r.date] > 1 ? ` <span class="text-sky-400">· ${r.label}</span>` : ''}</span>
                        <button onclick="window.loadPreviousRecord(${exIdx}, '${r.date}', ${r.sourceIdx})" class="text-[11px] font-black px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg shrink-0 active:scale-95 transition-transform">불러오기</button>
                    </div>
                    <div class="text-[11px] text-slate-400 space-y-0.5">
                        ${r.sets.map((s, i) => `<p>${i + 1}세트: <span class="text-slate-200 font-bold">${s.weight}kg × ${s.reps}회</span> <span class="text-slate-600">(${s.type})</span></p>`).join('')}
                    </div>
                    <p class="text-[10px] text-slate-500">⏱️ 알람 간격: ${r.restTime || 90}초</p>
                </div>`).join('');
        }
    }
    const modal = document.getElementById('previous-record-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

export function closePreviousRecordModal() {
    const modal = document.getElementById('previous-record-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

/**
 * [이전기록] 선택한 과거 날짜·인스턴스(sourceIdx)의 무게/세트/횟수/알람 설정을 오늘 종목에 그대로
 * 덮어쓴다(완료 체크는 초기화). sourceIdx로 정확한 인스턴스를 지정해, 같은 날짜에 여러 개의 동일 기저
 * 종목이 있어도 사용자가 고른 바로 그 기록을 불러온다.
 */
export function loadPreviousRecord(exIdx, dateStr, sourceIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    if (!ex) return;
    const historicalEx = state.workouts[dateStr]?.exercises?.[sourceIdx];
    if (!historicalEx || stripNumberingSuffix(historicalEx.name) !== stripNumberingSuffix(ex.name)) {
        showToast("해당 기록을 찾을 수 없습니다."); return;
    }
    ex.sets = JSON.parse(JSON.stringify(historicalEx.sets)).map(s => ({ ...s, done: false }));
    if (historicalEx.restTime) ex.restTime = historicalEx.restTime;
    if (historicalEx.alarmSound) ex.alarmSound = historicalEx.alarmSound;
    triggerSave(showToast); renderWorkoutList(); closePreviousRecordModal();
    showToast(`${dateStr} 기록을 불러왔습니다.`);
}

/** 세트를 복제 — 바로 아래에 동일한 무게/횟수/타입의 세트를 추가한다. */
export function duplicateSet(exIdx, setIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    const copy = JSON.parse(JSON.stringify(ex.sets[setIdx])); copy.done = false;
    ex.sets.splice(setIdx + 1, 0, copy); triggerSave(showToast); renderWorkoutList();
    showToast("세트가 복제되었습니다.");
}
export function adjSetVal(exIdx, setIdx, field, delta) {
    const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx];
    let val = (parseFloat(set[field]) || 0) + delta; if (val < 0) val = 0; set[field] = val; triggerSave(showToast); renderWorkoutList();
}
export function changeSetField(exIdx, setIdx, field, val) {
    const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx];
    if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0; else set[field] = val;
    triggerSaveDebounced(showToast); // [자동 저장 효율화] 무게/횟수 입력칸은 키 입력마다 호출되므로 디바운스
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

/**
 * [빠른 설정 패널] 3종 — ⚡빠른 세트 입력 / ⏰수동 알람 / ⚖️오늘자 체중기록. 데스크탑에서는 드래그 없이
 * 화면 우하단에 고정된 버튼으로 열고 닫는다(모바일의 드래그 가능한 FAB 대신).
 */
export function openQuickSettingsPanel() {
    const modal = document.getElementById('quick-settings-modal'); if (!modal) return;
    populateQuickSelectExercises();
    modal.classList.remove('hidden'); modal.classList.add('flex');
}
export function closeQuickSettingsPanel() {
    const modal = document.getElementById('quick-settings-modal'); if (!modal) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
}
function populateQuickSelectExercises() {
    const select = document.getElementById('quick-select-ex-name'); if (!select) return;
    const prevValue = select.value; select.innerHTML = '';
    Object.values(WORKOUT_DB).forEach(types => Object.values(types).forEach(names => names.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`)));
    if (prevValue && [...select.options].some(o => o.value === prevValue)) select.value = prevValue;
}

/** 아코디언 토글 — 한 번에 하나만 펼쳐지도록 다른 패널은 접는다. */
export function toggleQuickAccordion(panelId) {
    const target = document.getElementById(panelId); if (!target) return;
    const willOpen = target.classList.contains('hidden');
    document.querySelectorAll('#quick-settings-modal [id^="qs-panel-"]').forEach(el => {
        el.classList.add('hidden');
        const arrow = document.getElementById('qs-arrow-' + el.id);
        if (arrow) arrow.style.transform = 'rotate(0deg)';
    });
    if (willOpen) {
        target.classList.remove('hidden');
        const arrow = document.getElementById('qs-arrow-' + panelId);
        if (arrow) arrow.style.transform = 'rotate(180deg)';
    }
}

/** ⚡ 빠른 세트 입력 하위 — '종목 사전 선택' 버튼은 라이브러리 모달을 quickInput 타깃으로 연다(exerciseLibrary.js 참고). */
export function openLibraryForQuickInput() {
    state.libraryTarget = 'quickInput';
    window.openLibraryModal();
}
export function saveQuickInputFABModal() {
    const name = document.getElementById('quick-select-ex-name').value; const w = parseFloat(document.getElementById('quick-input-weight').value) || 0; const r = parseInt(document.getElementById('quick-input-reps').value) || 0;
    if (!name) { showToast("종목을 먼저 선택하세요."); return; }
    const data = getWorkoutData(); let targetEx = data.exercises.find(e => e.name === name);
    if (!targetEx) {
        let fPart = '기타', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        targetEx = { part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] }; data.exercises.push(targetEx);
    }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true });
    triggerSave(showToast);
    const recordPane = document.getElementById('pane-tab-record'); // [빠른 설정 패널] 식단(index.html) 화면에는 이 요소 자체가 없다
    if (recordPane && recordPane.classList.contains('block')) renderWorkoutList();
    // [편의] 연속으로 세트를 여러 개 등록할 수 있도록 패널은 닫지 않고 열어 둔 채로 계속 입력받는다.
    showToast(`[${name}] 세트가 등록되었습니다.`);
}

/** ⏰ 수동 알람 하위 — 시간 프리셋/직접입력 + 진동 + 즉시 가동만 다루는 축약판(음원/반복은 기존 설정값 재사용). */
export function setQuickAlarmSec(sec) {
    const input = document.getElementById('quick-alarm-sec'); if (input) input.value = sec;
}
export function startQuickAlarm() {
    const sec = parseInt(document.getElementById('quick-alarm-sec').value) || 60;
    const vibration = document.getElementById('quick-alarm-vibration')?.checked ?? true;
    if (!state.userInfo) state.userInfo = {};
    state.userInfo.vibrationEnabled = vibration;
    triggerSave(showToast);
    const soundType = state.userInfo?.defaultAlarmSound || '1';
    startTimerLogic(sec, soundType);
    closeQuickSettingsPanel();
    showToast(`${sec}초 타이머를 시작했습니다.`);
}

// ⚖️ 오늘자 체중기록 — weight-record-modal이 calendar.html/index.html 양쪽에 동일하게 존재하므로,
// window.openTodayWeightQuickRecord는 각 페이지 오케스트레이터(calendar.js/app.js)가 그 페이지에서 이미
// import한 weightRecord.js의 openRecordModal을 그대로 별칭 바인딩한다(화면 전환 없이 제자리에서 열림).

/**
 * [엑셀 내보내기 — 시트 빌더] 기록이 있는 모든 날짜의 종목·세트를 워크북에 '운동일지' 시트로 채워 넣는다
 * (저장은 호출자 책임 — calendar.js의 통합 내보내기가 루틴 프리셋 시트와 함께 한 워크북에 담아 저장한다).
 * 운동부위/운동종류/운동이름 컬럼은 WORKOUT_DB 전체 목록을 참조하는 드롭다운을, 세트종류/완료여부 컬럼은
 * 고정 값 드롭다운을 걸어 컴퓨터에서 유효한 값만 클릭으로 고를 수 있게 한다.
 */
export function populateWorkoutJournalSheet(workbook) {
    const sheet = workbook.addWorksheet('운동일지');
    sheet.columns = [
        { header: '날짜', key: 'date', width: 12 },
        { header: '운동부위', key: 'part', width: 12 },
        { header: '운동종류', key: 'type', width: 16 },
        { header: '운동이름', key: 'name', width: 26 },
        { header: '알람(초)', key: 'restTime', width: 10 },
        { header: '알람음(1~5)', key: 'alarmSound', width: 11 },
        { header: '세트번호', key: 'setNo', width: 9 },
        { header: '무게(kg)', key: 'weight', width: 10 },
        { header: '횟수(회)', key: 'reps', width: 9 },
        { header: '세트종류', key: 'setType', width: 10 },
        { header: '완료(O/X)', key: 'done', width: 10 },
    ];
    styleHeaderRow(sheet, 1);

    const dates = Object.keys(state.workouts)
        .filter(d => (state.workouts[d].exercises || []).length > 0)
        .sort((a, b) => new Date(a) - new Date(b));
    let rowCount = 0;
    dates.forEach(dateStr => {
        state.workouts[dateStr].exercises.forEach(ex => {
            if (!ex.sets || ex.sets.length === 0) {
                sheet.addRow({ date: dateStr, part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || '', alarmSound: ex.alarmSound || '1', setNo: '', weight: '', reps: '', setType: '', done: '' });
                rowCount++; return;
            }
            ex.sets.forEach((set, idx) => {
                sheet.addRow({ date: dateStr, part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || '', alarmSound: ex.alarmSound || '1', setNo: idx + 1, weight: set.weight, reps: set.reps, setType: set.type, done: set.done ? 'O' : 'X' });
                rowCount++;
            });
        });
    });

    const parts = Object.keys(WORKOUT_DB);
    const typesSet = new Set(); const namesSet = new Set();
    parts.forEach(p => { Object.keys(WORKOUT_DB[p]).forEach(t => typesSet.add(t)); Object.values(WORKOUT_DB[p]).forEach(arr => arr.forEach(n => namesSet.add(n))); });
    const types = Array.from(typesSet); const names = Array.from(namesSet);

    buildHiddenListSheet(workbook, [
        { header: '부위', values: parts },
        { header: '종류', values: types },
        { header: '이름', values: names },
    ]);
    const validationEnd = Math.max(rowCount + 1, 1) + 300; // 새로 추가할 행을 위한 여유분
    applyListValidation(sheet, 'B', 2, validationEnd, `목록!$A$2:$A$${parts.length + 1}`);
    applyListValidation(sheet, 'C', 2, validationEnd, `목록!$B$2:$B$${types.length + 1}`);
    applyListValidation(sheet, 'D', 2, validationEnd, `목록!$C$2:$C$${names.length + 1}`);
    applyListValidation(sheet, 'F', 2, validationEnd, '"1,2,3,4,5"');
    applyListValidation(sheet, 'J', 2, validationEnd, '"일반,탑,백오프,드롭,슈퍼"');
    applyListValidation(sheet, 'K', 2, validationEnd, '"O,X"');

    return rowCount;
}

/** 운동일지 시트 하나만 담은 독립 워크북을 만들어 저장한다(단독 내보내기 용도로 남겨둔 얇은 래퍼). */
export async function exportWorkoutJournalToExcel() {
    toggleGlobalLoader(true, "엑셀 파일 생성 중...");
    try {
        const ExcelJS = ensureExcelLib();
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'PREP MASTER PRO';
        populateWorkoutJournalSheet(workbook);
        const pad = n => n < 10 ? '0' + n : n; const now = new Date();
        const fileName = `Workout_Journal_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.xlsx`;
        await saveWorkbookAsFile(workbook, fileName, showToast);
    } catch (e) {
        console.error('운동 일지 엑셀 내보내기 실패:', e);
        showToast('엑셀 내보내기에 실패했습니다.');
    } finally {
        toggleGlobalLoader(false);
    }
}

/**
 * [엑셀 불러오기 — 시트 파서] 워크북 안의 '운동일지' 시트를 읽어, 파일에 등장하는 날짜별로 그 날짜의
 * 종목 목록을 파일 내용 기준으로 통째로 재구성한다(파일에 없는 날짜는 건드리지 않는다). 같은 날짜 안에서는
 * 운동부위+운동종류+운동이름을 키로 세트 행을 묶어 하나의 종목으로 복원한다 — 극히 드문 경우(같은 이름의
 * 운동을 하루에 두 블록으로 나눠 기록)는 세트가 한 종목으로 합쳐질 수 있으나, 총 볼륨/세트 수 집계에는
 * 영향이 없다. 시트가 없으면 조용히 0을 반환한다(통합 불러오기에서 이 시트가 선택적일 수 있으므로).
 */
export function applyWorkoutJournalRowsFromWorkbook(workbook) {
    const sheet = workbook.getWorksheet('운동일지');
    if (!sheet) return 0;

    const dateMap = new Map(); // dateStr -> Map(exKey -> {part,type,name,restTime,sets:[]})
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const rawDate = cellText(row, 1);
        const match = rawDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        if (!match) return;
        const dateStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
        const part = cellText(row, 2); const type = cellText(row, 3); const name = cellText(row, 4);
        if (!name) return; // 운동이름 없는 행은 건너뜀
        const restTime = cellNumber(row, 5);
        const alarmSoundRaw = cellText(row, 6);
        const setNoRaw = cellText(row, 7);
        const weight = cellNumber(row, 8); const reps = cellNumber(row, 9);
        const setType = cellText(row, 10) || '일반';
        const done = cellText(row, 11).trim().toUpperCase() === 'O';

        if (!dateMap.has(dateStr)) dateMap.set(dateStr, new Map());
        const exMap = dateMap.get(dateStr);
        const exKey = `${part}|${type}|${name}`;
        if (!exMap.has(exKey)) exMap.set(exKey, { part, type, name, restTime: restTime || undefined, alarmSound: alarmSoundRaw || undefined, sets: [] });
        const ex = exMap.get(exKey);
        if (restTime) ex.restTime = restTime;
        if (alarmSoundRaw) ex.alarmSound = alarmSoundRaw;
        if (setNoRaw !== '' || weight || reps) ex.sets.push({ weight: weight || 0, reps: reps || 0, type: setType, done });
    });

    let updatedDates = 0;
    dateMap.forEach((exMap, dateStr) => {
        if (!state.workouts[dateStr]) state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
        state.workouts[dateStr].exercises = Array.from(exMap.values());
        updatedDates++;
    });
    return updatedDates;
}

/** '운동일지' 시트만 담긴 파일을 단독으로 불러올 때 쓰는 얇은 래퍼(단독 내보내기의 짝). */
export async function importWorkoutJournalFromExcel(event) {
    toggleGlobalLoader(true, "엑셀 파일 불러오는 중...");
    try {
        const workbook = await readWorkbookFromEvent(event);
        if (!workbook) { toggleGlobalLoader(false); return; }
        if (!workbook.getWorksheet('운동일지')) throw new Error('"운동일지" 시트를 찾을 수 없습니다. 내보내기한 원본 서식을 사용해주세요.');
        const updatedDates = applyWorkoutJournalRowsFromWorkbook(workbook);

        triggerSave(showToast);
        renderWorkoutList();
        showToast(`${updatedDates}개 날짜의 운동 일지를 업데이트했습니다.`);
    } catch (err) {
        console.error('운동 일지 엑셀 불러오기 실패:', err);
        alert(`불러오기 실패: ${err.message}`);
    } finally {
        toggleGlobalLoader(false);
        event.target.value = '';
    }
}
