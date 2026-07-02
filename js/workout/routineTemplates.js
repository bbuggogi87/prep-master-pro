/**
 * 파일명: routineTemplates.js
 * 역할: 분할루틴 탭 — 사용자 저장 루틴/6대 추천 프로그램 관리 및 독립 팝업 편집기 담당 모듈
 * 편집기의 "종목 추가" 버튼(라이브러리 연동)은 exerciseLibrary.js 와의 순환 의존을 피하기 위해
 * calendar.js(오케스트레이터)에 위치하며, 이 모듈은 exerciseLibrary.js 를 전혀 참조하지 않는다.
 */

import { state } from '../core/store.js';
import { triggerSave, saveToLocal } from '../core/services.js';
import { RECOMMENDED_ROUTINES } from './workoutConstants.js';
import { showToast, toggleGlobalLoader, getWorkoutData } from './calendarCore.js';
import { renderWorkoutList } from './workoutJournal.js';
import { reorderArray, moveArrayItem } from '../core/reorderUtil.js';
import { reorderButtonsHTML, dragHandleHTML, initSortableList } from '../core/reorderControls.js';

let editorExerciseSortable = null;
let editorSetSortables = [];

export function openTemplateManager() { document.getElementById('template-modal').classList.remove('hidden'); document.getElementById('template-modal').classList.add('flex'); renderTemplateList(); }
export function closeTemplateManager() { document.getElementById('template-modal').classList.add('hidden'); document.getElementById('template-modal').classList.remove('flex'); }

function renderTemplateList() {
    const box = document.getElementById('template-list-box'); if(!box) return; box.innerHTML = '';
    if (!state.templates || state.templates.length === 0) { box.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">저장된 루틴이 없습니다.</p>`; return; }
    state.templates.forEach((tmpl) => {
        const div = document.createElement('div'); div.className = "flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs gap-2";
        div.innerHTML = `<span onclick="window.applyTemplate(${tmpl.id})" class="text-slate-200 font-bold hover:text-amber-400 cursor-pointer flex-1 truncate">${tmpl.title} (${tmpl.exercises.length}종목)</span><button onclick="window.deleteTemplate(${tmpl.id})" class="text-rose-400 hover:text-rose-500 font-bold shrink-0">삭제</button>`;
        box.appendChild(div);
    });
}

export function openSaveRoutineModal() {
    const data = getWorkoutData(); if (data.exercises.length === 0) { showToast("현재 일지에 저장할 운동이 없습니다."); return; }
    document.getElementById('save-routine-name-input').value = ''; document.getElementById('save-routine-modal').classList.remove('hidden'); document.getElementById('save-routine-modal').classList.add('flex');
}
export function closeSaveRoutineModal() { document.getElementById('save-routine-modal').classList.add('hidden'); document.getElementById('save-routine-modal').classList.remove('flex'); }

export function confirmSaveRoutine() {
    const data = getWorkoutData(); const title = document.getElementById('save-routine-name-input').value.trim() || '내 맞춤 루틴';
    const cleanedExercises = data.exercises.map(ex => ({ part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound, sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false })) }));
    if (!state.templates) state.templates = [];
    state.templates.push({ id: Date.now(), title: title, exercises: cleanedExercises });
    triggerSave(showToast); closeSaveRoutineModal(); showToast("루틴 백업 보존 성공.");
}

export function applyTemplate(tmplId) {
    if (!confirm("오늘 일지의 기존 기록이 초기화되고 복원 프리셋으로 대체됩니다. 계속할까요?")) return;
    toggleGlobalLoader(true, "루틴 프리셋 복원 및 렌더 가동 중...");

    setTimeout(() => {
        const tmpl = state.templates.find(t => t.id === tmplId);
        if (tmpl) {
            const data = getWorkoutData(); data.exercises = JSON.parse(JSON.stringify(tmpl.exercises));
            triggerSave(showToast); closeTemplateManager(); window.switchCalendarTab('tab-record'); renderWorkoutList();
        }
        toggleGlobalLoader(false); showToast("루틴 데이터가 즉각 정상 반영되었습니다.");
    }, 300);
}

export function deleteTemplate(tmplId) {
    if (confirm("이 프리셋을 영구 삭제하시겠습니까?")) { state.templates = state.templates.filter(t => t.id !== tmplId); triggerSave(showToast); renderTemplateList(); }
}

export function renderPresetRoutineGrid() {
    const gridBox = document.getElementById('routine-preset-grid-box'); if(!gridBox) return; gridBox.innerHTML = '';
    const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');

    if (state.templates && state.templates.length > 0) {
        const titleSec = document.createElement('div'); titleSec.className = "col-span-1 sm:col-span-2 border-b border-slate-800 pb-1 mt-2";
        titleSec.innerHTML = `<h3 class="text-xs font-black text-sky-400 uppercase tracking-wider">💾 내가 백업한 맞춤형 프리셋 루틴</h3>`;
        gridBox.appendChild(titleSec);

        state.templates.forEach(tmpl => {
            const card = document.createElement('div'); card.className = "glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 animate-fade-in";
            card.innerHTML = `
                <div><h3 class="text-sm font-black text-white uppercase">${tmpl.title}</h3><p class="text-xs text-slate-400 mt-2 leading-relaxed break-all">${tmpl.exercises.map(e => e.name).join(', ')}</p></div>
                <div class="flex gap-2">
                    <button class="flex-1 bg-slate-800 hover:bg-sky-500 hover:text-white text-xs font-bold py-3 rounded-xl border border-slate-700 transition-colors" onclick="window.applyTemplate(${tmpl.id})">가져오기</button>
                    <button class="flex-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-xs font-black py-3 rounded-xl border border-slate-800 transition-colors" onclick="window.openTemplatePopupEditor(true, ${tmpl.id})">✏️ 루틴 편집</button>
                </div>`;
            gridBox.appendChild(card);
        });
    }

    const titleSecRec = document.createElement('div'); titleSecRec.className = "col-span-1 sm:col-span-2 border-b border-slate-800 pb-1 mt-4";
    titleSecRec.innerHTML = `<h3 class="text-xs font-black text-amber-500 uppercase tracking-wider">🌟 추천 루틴</h3>`;
    gridBox.appendChild(titleSecRec);

    RECOMMENDED_ROUTINES.forEach((prog, idx) => {
        const hasCustom = !!customRecommended[prog.title];
        const displayExercises = hasCustom ? customRecommended[prog.title] : prog.exercises;
        const subBadge = hasCustom ? `<span class="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded ml-1.5">수정됨</span>` : '';

        const card = document.createElement('div'); card.className = "glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 animate-fade-in";
        card.innerHTML = `
            <div><h3 class="text-sm font-black text-slate-100 uppercase flex items-center">${prog.title} ${subBadge}</h3><p class="text-xs text-slate-400 mt-2 leading-relaxed break-keep">${displayExercises.map(e => e.name).join(', ')}</p></div>
            <div class="flex gap-2">
                <button class="flex-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold py-3 rounded-xl border border-slate-700 transition-colors" onclick='window.applyDirectPresetRoutine(${idx})'>가동 마운트</button>
                <button class="flex-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-xs font-black py-3 rounded-xl border border-slate-800 transition-colors" onclick="window.openTemplatePopupEditor(false, ${idx})">✏️ 루틴 편집</button>
            </div>`;
        gridBox.appendChild(card);
    });
}

export function openTemplatePopupEditor(isUserTemplate, idOrIndex) {
    toggleGlobalLoader(true, "독립 팝업 에디터 버퍼 생성 중...");

    setTimeout(() => {
        let title = ''; let targetExercises = [];
        if (isUserTemplate) {
            const tmpl = state.templates.find(t => t.id === idOrIndex);
            if (tmpl) { title = tmpl.title; targetExercises = JSON.parse(JSON.stringify(tmpl.exercises)); }
        } else {
            const orig = RECOMMENDED_ROUTINES[idOrIndex];
            if (orig) {
                title = orig.title; const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
                if (customRecommended[title]) { targetExercises = customRecommended[title]; } else { targetExercises = orig.exercises; }
            }
        }
        if (!title) { toggleGlobalLoader(false); showToast("루틴을 식별할 수 없습니다."); return; }

        state.routineEditorBuffer = {
            title: title, isUserTemplate: isUserTemplate, idOrIndex: idOrIndex,
            exercises: targetExercises.map(ex => ({
                part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || 90, alarmSound: ex.alarmSound || '1',
                sets: (ex.sets && ex.sets.length > 0) ? JSON.parse(JSON.stringify(ex.sets)) : [{ type: '일반', weight: 40, reps: 10, done: false }]
            }))
        };

        document.getElementById('routine-editor-popup-title').innerText = `✏️ ${title} 독립 편집`;
        renderRoutinePopupEditorDOM();

        toggleGlobalLoader(false);
        document.getElementById('routine-editor-popup-modal').classList.remove('hidden');
        document.getElementById('routine-editor-popup-modal').classList.add('flex');
    }, 200);
}

export function closeTemplatePopupEditor() {
    state.routineEditorBuffer = null; state.libraryTarget = 'record';
    document.getElementById('routine-editor-popup-modal').classList.add('hidden');
    document.getElementById('routine-editor-popup-modal').classList.remove('flex');
}

export function renderRoutinePopupEditorDOM() {
    const container = document.getElementById('routine-editor-list-container');
    if (!container || !state.routineEditorBuffer) return; container.innerHTML = '';

    const exercises = state.routineEditorBuffer.exercises;
    exercises.forEach((ex, exIdx) => {
        let setsHtml = '';
        ex.sets.forEach((set, setIdx) => {
            setsHtml += `
            <div class="flex items-center justify-between gap-1 p-1.5 bg-slate-950 rounded-lg text-xs">
                ${dragHandleHTML('editor-set-drag-handle')}
                <span class="font-black text-amber-500 w-4 text-center">${setIdx + 1}</span>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                    <input type="number" step="2.5" class="w-10 bg-transparent text-center font-bold text-white outline-none" value="${set.weight}" oninput="window.changeEditorSetField(${exIdx}, ${setIdx}, 'weight', this.value)">
                    <span class="text-[9px] text-slate-500 mr-1">kg</span>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                    <input type="number" class="w-8 bg-transparent text-center font-bold text-white outline-none" value="${set.reps}" oninput="window.changeEditorSetField(${exIdx}, ${setIdx}, 'reps', this.value)">
                    <span class="text-[9px] text-slate-500 mr-1">회</span>
                </div>

                ${reorderButtonsHTML('moveSetOrderInEditor', setIdx, ex.sets.length, 'xs', [exIdx])}

                <button onclick="window.deleteSetFromEditor(${exIdx}, ${setIdx})" class="text-rose-400 font-bold px-1">✕</button>
            </div>`;
        });

        const div = document.createElement('div');
        div.className = "p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2";
        div.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-800 pb-1">
                <div class="flex items-center gap-1.5 min-w-0">
                    ${dragHandleHTML('editor-exercise-drag-handle')}
                    <div class="truncate"><span class="text-[9px] text-slate-500 block uppercase">${ex.part}</span><h4 class="text-xs font-black text-white truncate timeline-ex-title leading-tight">${ex.name}</h4></div>
                </div>
                <div class="flex items-center gap-1 shrink-0">
                    ${reorderButtonsHTML('moveExerciseOrderInEditor', exIdx, exercises.length, 'xs')}
                    <button onclick="window.deleteExerciseFromEditor(${exIdx})" class="text-[10px] text-rose-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded ml-1">삭제</button>
                </div>
            </div>
            <div class="space-y-1" id="editor-sets-container-${exIdx}">${setsHtml}</div>
            <button onclick="window.addSetToEditor(${exIdx})" class="w-full py-1 border border-dashed border-slate-700 text-[10px] text-slate-400 font-bold rounded-lg bg-slate-950/40">+ 세트 추가</button>
        `;
        container.appendChild(div);
    });

    // [재정렬 통일] 운동(바깥) + 각 운동의 세트(안쪽, 중첩) 드래그앤드롭을 매 렌더마다 재생성한다.
    if (editorExerciseSortable) { editorExerciseSortable.destroy(); editorExerciseSortable = null; }
    editorSetSortables.forEach(s => s && s.destroy()); editorSetSortables = [];

    editorExerciseSortable = initSortableList(container, {
        handle: '.editor-exercise-drag-handle',
        onReorder: (oldIdx, newIdx) => { if (moveArrayItem(exercises, oldIdx, newIdx)) renderRoutinePopupEditorDOM(); },
    });
    exercises.forEach((ex, exIdx) => {
        const setsContainer = document.getElementById(`editor-sets-container-${exIdx}`);
        editorSetSortables.push(initSortableList(setsContainer, {
            handle: '.editor-set-drag-handle',
            onReorder: (oldIdx, newIdx) => { if (moveArrayItem(ex.sets, oldIdx, newIdx)) renderRoutinePopupEditorDOM(); },
        }));
    });
}

export function moveExerciseOrderInEditor(exIdx, action) {
    if (reorderArray(state.routineEditorBuffer.exercises, exIdx, action)) renderRoutinePopupEditorDOM();
}

export function moveSetOrderInEditor(exIdx, setIdx, action) {
    const sets = state.routineEditorBuffer.exercises[exIdx].sets;
    if (reorderArray(sets, setIdx, action)) renderRoutinePopupEditorDOM();
}

export function addSetToEditor(exIdx) {
    const ex = state.routineEditorBuffer.exercises[exIdx];
    let w = 40, r = 10; if(ex.sets.length > 0) { w = ex.sets[ex.sets.length-1].weight; r = ex.sets[ex.sets.length-1].reps; }
    ex.sets.push({ type: '일반', weight: w, reps: r, done: false }); renderRoutinePopupEditorDOM();
}
export function deleteSetFromEditor(exIdx, setIdx) {
    state.routineEditorBuffer.exercises[exIdx].sets.splice(setIdx, 1); renderRoutinePopupEditorDOM();
}
export function deleteExerciseFromEditor(exIdx) {
    if(confirm("이 종목을 편집 리스트에서 제거할까요?")) { state.routineEditorBuffer.exercises.splice(exIdx, 1); renderRoutinePopupEditorDOM(); }
}
export function changeEditorSetField(exIdx, setIdx, field, val) {
    state.routineEditorBuffer.exercises[exIdx].sets[setIdx][field] = parseFloat(val) || 0;
}

export function saveTemplatePopupEditorData() {
    if (!state.routineEditorBuffer) return;
    toggleGlobalLoader(true, "편집 완료본 정밀 영속 구조 덮어쓰기 중...");

    setTimeout(() => {
        const buffer = state.routineEditorBuffer;
        const optimizedExercises = buffer.exercises.map(ex => ({
            part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound,
            sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, done: false }))
        }));

        if (buffer.isUserTemplate) {
            const tmpl = state.templates.find(t => t.id === buffer.idOrIndex); if (tmpl) tmpl.exercises = optimizedExercises;
        } else {
            const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
            customRecommended[buffer.title] = optimizedExercises;
            localStorage.setItem('prep_master_custom_recommended', JSON.stringify(customRecommended));
        }

        triggerSave(showToast); closeTemplatePopupEditor(); renderPresetRoutineGrid();
        toggleGlobalLoader(false); showToast(`[${buffer.title}] 저장 완료.`);
    }, 300);
}

export function applyDirectPresetRoutine(index) {
    if(!confirm("기존 기록이 프리셋 종목으로 완전 대체 마운트됩니다. 진행할까요?")) return;
    toggleGlobalLoader(true, "추천 루틴 마운트 로드 중...");

    setTimeout(() => {
        const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
        const orig = RECOMMENDED_ROUTINES[index]; if (!orig) { toggleGlobalLoader(false); return; }
        const displayExercises = customRecommended[orig.title] || orig.exercises;

        const data = getWorkoutData();
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        // [버그 수정] 루틴 편집기에서 저장한 세트(중량/반복/타입)·휴식시간·알람음이 존재하면 그대로 반영하고,
        // 편집된 적 없는 기본 추천 루틴만 기존 기본값(40kg x10, 1세트)으로 채웁니다.
        data.exercises = displayExercises.map(ex => ({
            part: ex.part, type: ex.type, name: ex.name,
            restTime: ex.restTime || dRest, alarmSound: ex.alarmSound || dSound,
            sets: (ex.sets && ex.sets.length > 0)
                ? ex.sets.map(s => ({ type: s.type || '일반', weight: s.weight, reps: s.reps, done: false }))
                : [{ type: '일반', weight: 40, reps: 10, done: false }]
        }));
        triggerSave(showToast); window.switchCalendarTab('tab-record'); renderWorkoutList();
        toggleGlobalLoader(false); showToast(`[${orig.title}] 가동 마운트 완료.`);
    }, 300);
}
