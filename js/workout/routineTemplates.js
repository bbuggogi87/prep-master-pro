/**
 * 파일명: routineTemplates.js
 * 역할: 분할루틴 탭 — 사용자 저장 루틴/6대 추천 프로그램 관리 및 독립 팝업 편집기 담당 모듈
 * 편집기의 "종목 추가" 버튼(라이브러리 연동)은 exerciseLibrary.js 와의 순환 의존을 피하기 위해
 * calendar.js(오케스트레이터)에 위치하며, 이 모듈은 exerciseLibrary.js 를 전혀 참조하지 않는다.
 */

import { state } from '../core/store.js';
import { triggerSave, saveToLocal } from '../core/services.js';
import { RECOMMENDED_ROUTINES, WORKOUT_DB } from './workoutConstants.js';
import { showToast, toggleGlobalLoader, getWorkoutData } from './calendarCore.js';
import { renderWorkoutList } from './workoutJournal.js';
import { reorderArray, moveArrayItem } from '../core/reorderUtil.js';
import { reorderButtonsHTML, dragHandleHTML, initSortableList } from '../core/reorderControls.js';
import { buildHiddenListSheet, applyListValidation, styleHeaderRow, cellText, cellNumber } from '../core/excelIO.js';

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

let saveRoutineMode = 'new';

export function openSaveRoutineModal() {
    const data = getWorkoutData(); if (data.exercises.length === 0) { showToast("현재 일지에 저장할 운동이 없습니다."); return; }
    document.getElementById('save-routine-name-input').value = '';
    populateSaveRoutineOverwriteSelect();
    setSaveRoutineMode('new');
    document.getElementById('save-routine-modal').classList.remove('hidden'); document.getElementById('save-routine-modal').classList.add('flex');
}
export function closeSaveRoutineModal() { document.getElementById('save-routine-modal').classList.add('hidden'); document.getElementById('save-routine-modal').classList.remove('flex'); }

/** [덮어쓰기 기능] '새로 저장' / '기존에 덮어쓰기' 두 모드 전환 — 각 모드에 맞는 입력 필드만 보여준다. */
export function setSaveRoutineMode(mode) {
    saveRoutineMode = mode;
    const isNew = mode === 'new';
    const activeCls = "py-2.5 text-xs font-black rounded-lg bg-amber-500 text-slate-950 transition-all";
    const inactiveCls = "py-2.5 text-xs font-bold rounded-lg bg-slate-900 border border-slate-800 text-slate-400 transition-all";
    const newBtn = document.getElementById('save-routine-mode-new');
    const overwriteBtn = document.getElementById('save-routine-mode-overwrite');
    if (newBtn) newBtn.className = isNew ? activeCls : inactiveCls;
    if (overwriteBtn) overwriteBtn.className = !isNew ? activeCls : inactiveCls;
    const newFields = document.getElementById('save-routine-new-fields');
    const overwriteFields = document.getElementById('save-routine-overwrite-fields');
    if (newFields) newFields.classList.toggle('hidden', !isNew);
    if (overwriteFields) overwriteFields.classList.toggle('hidden', isNew);
}

function populateSaveRoutineOverwriteSelect() {
    const select = document.getElementById('save-routine-overwrite-select'); if (!select) return;
    select.innerHTML = '';
    if (!state.templates || state.templates.length === 0) {
        select.innerHTML = `<option value="">저장된 '내 루틴 프리셋'이 없습니다</option>`;
        return;
    }
    state.templates.forEach(t => { select.innerHTML += `<option value="${t.id}">${t.title} (${t.exercises.length}종목)</option>`; });
}

export function confirmSaveRoutine() {
    const data = getWorkoutData();
    const cleanedExercises = data.exercises.map(ex => ({ part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound, sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false })) }));

    if (saveRoutineMode === 'overwrite') {
        const select = document.getElementById('save-routine-overwrite-select');
        const tmplId = select ? parseInt(select.value) : NaN;
        const tmpl = (state.templates || []).find(t => t.id === tmplId);
        if (!tmpl) { showToast("덮어쓸 '내 루틴 프리셋'을 선택해주세요."); return; }
        if (!confirm(`[${tmpl.title}] 프리셋을 현재 일지 내용으로 덮어쓸까요? 기존 구성은 사라집니다.`)) return;
        tmpl.exercises = cleanedExercises;
        triggerSave(showToast); closeSaveRoutineModal(); showToast(`[${tmpl.title}] 프리셋에 덮어쓰기 완료.`);
        return;
    }

    const title = document.getElementById('save-routine-name-input').value.trim() || '내 맞춤 루틴';
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
        const fullNameViewer = document.getElementById('routine-editor-fullname-viewer');
        if (fullNameViewer) fullNameViewer.classList.add('hidden');
        renderRoutinePopupEditorDOM();

        toggleGlobalLoader(false);
        document.getElementById('routine-editor-popup-modal').classList.remove('hidden');
        document.getElementById('routine-editor-popup-modal').classList.add('flex');
    }, 200);
}

/**
 * [잘린 운동 명칭 확인] 편집 목록의 운동 이름(폭이 좁아 잘리는 h4)을 클릭하면 팝업 상단의 뷰어에 부위·종류·
 * 전체 명칭을 띄운다. 문서 아무 곳이나 다시 클릭하면 사라지는데, 이름 자체를 다시(혹은 다른 이름을) 클릭한
 * 경우는 내용만 갱신하고 계속 보이도록 트리거 요소를 클릭 판정에서 제외한다.
 */
let editorFullNameOutsideBound = false;
export function showEditorExerciseFullName(exIdx) {
    const ex = state.routineEditorBuffer?.exercises?.[exIdx]; if (!ex) return;
    const viewer = document.getElementById('routine-editor-fullname-viewer'); if (!viewer) return;
    viewer.innerText = `🔍 ${ex.part} · ${ex.type} — ${ex.name}`;
    viewer.classList.remove('hidden');
    if (!editorFullNameOutsideBound) {
        editorFullNameOutsideBound = true;
        document.addEventListener('click', (e) => {
            const v = document.getElementById('routine-editor-fullname-viewer');
            if (!v || v.classList.contains('hidden')) return;
            if (e.target.closest('.editor-exercise-title-trigger') || v.contains(e.target)) return;
            v.classList.add('hidden');
        });
    }
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
                    <div class="truncate min-w-0 cursor-pointer editor-exercise-title-trigger" onclick="window.showEditorExerciseFullName(${exIdx})"><span class="text-[9px] text-slate-500 block uppercase">${ex.part}</span><h4 class="text-xs font-black text-white truncate timeline-ex-title leading-tight">${ex.name}</h4></div>
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

/**
 * [엑셀 내보내기 — 시트 빌더] 내 루틴 프리셋(state.templates)과 추천 루틴 프리셋(RECOMMENDED_ROUTINES +
 * 커스텀 편집분)을 각각 별도 시트로 워크북에 채워 넣는다(저장은 호출자 책임 — calendar.js의 통합 '기록지'
 * 내보내기가 운동일지 시트와 함께 한 워크북에 담아 저장한다). 운동일지 시트가 이미 '목록'이라는 이름의
 * 숨김 목록 시트를 쓰므로, 이름 충돌을 피하기 위해 이 시트들은 '루틴목록'이라는 별도 이름을 쓴다.
 */
export function populateRoutinePresetSheets(workbook) {
    const columns = [
        { header: '루틴명', key: 'title', width: 20 },
        { header: '운동부위', key: 'part', width: 12 },
        { header: '운동종류', key: 'type', width: 16 },
        { header: '운동이름', key: 'name', width: 26 },
        { header: '알람(초)', key: 'restTime', width: 10 },
        { header: '알람음(1~5)', key: 'alarmSound', width: 11 },
        { header: '세트번호', key: 'setNo', width: 9 },
        { header: '무게(kg)', key: 'weight', width: 10 },
        { header: '횟수(회)', key: 'reps', width: 9 },
        { header: '세트종류', key: 'setType', width: 10 },
    ];

    function addExerciseRows(sheet, title, exercises, extra = {}) {
        let count = 0;
        if (exercises.length === 0) { sheet.addRow({ title, part: '', type: '', name: '', restTime: '', alarmSound: '', setNo: '', weight: '', reps: '', setType: '', ...extra }); return 1; }
        exercises.forEach(ex => {
            if (!ex.sets || ex.sets.length === 0) {
                sheet.addRow({ title, part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || '', alarmSound: ex.alarmSound || '1', setNo: '', weight: '', reps: '', setType: '', ...extra }); count++; return;
            }
            ex.sets.forEach((set, idx) => {
                sheet.addRow({ title, part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || '', alarmSound: ex.alarmSound || '1', setNo: idx + 1, weight: set.weight, reps: set.reps, setType: set.type, ...extra });
                count++;
            });
        });
        return count;
    }

    const mySheet = workbook.addWorksheet('내 루틴 프리셋');
    mySheet.columns = [...columns, { header: '루틴ID(내부용)', key: 'tmplId', width: 14 }];
    styleHeaderRow(mySheet, 1);
    let myRowCount = 0;
    state.templates.forEach(tmpl => { myRowCount += addExerciseRows(mySheet, tmpl.title, tmpl.exercises, { tmplId: tmpl.id }); });

    const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
    const recSheet = workbook.addWorksheet('추천 루틴 프리셋');
    recSheet.columns = columns;
    styleHeaderRow(recSheet, 1);
    let recRowCount = 0;
    RECOMMENDED_ROUTINES.forEach(orig => {
        const exercises = customRecommended[orig.title] || orig.exercises;
        recRowCount += addExerciseRows(recSheet, orig.title, exercises);
    });

    const parts = Object.keys(WORKOUT_DB);
    const typesSet = new Set(); const namesSet = new Set();
    parts.forEach(p => { Object.keys(WORKOUT_DB[p]).forEach(t => typesSet.add(t)); Object.values(WORKOUT_DB[p]).forEach(arr => arr.forEach(n => namesSet.add(n))); });
    const types = Array.from(typesSet); const names = Array.from(namesSet);
    buildHiddenListSheet(workbook, [
        { header: '부위', values: parts },
        { header: '종류', values: types },
        { header: '이름', values: names },
    ], '루틴목록');

    [mySheet, recSheet].forEach(sheet => {
        const validationEnd = Math.max(sheet.rowCount + 1, 1) + 200;
        applyListValidation(sheet, 'B', 2, validationEnd, `루틴목록!$A$2:$A$${parts.length + 1}`);
        applyListValidation(sheet, 'C', 2, validationEnd, `루틴목록!$B$2:$B$${types.length + 1}`);
        applyListValidation(sheet, 'D', 2, validationEnd, `루틴목록!$C$2:$C$${names.length + 1}`);
        applyListValidation(sheet, 'F', 2, validationEnd, '"1,2,3,4,5"');
        applyListValidation(sheet, 'J', 2, validationEnd, '"일반,탑,백오프,드롭,슈퍼"');
    });

    return { myRowCount, recRowCount };
}

/**
 * [엑셀 불러오기 — 시트 파서] '내 루틴 프리셋'/'추천 루틴 프리셋' 시트를 읽어, 파일에 등장하는 루틴별로
 * 그 루틴의 종목 목록을 파일 내용 기준으로 통째로 재구성한다(파일에 없는 루틴은 건드리지 않는다). 새 루틴
 * 자체를 이 기능으로 만들 수는 없다(기존 앱 UI에서 생성) — 루틴ID/루틴명이 기존 항목과 일치하는 행만 반영.
 */
export function applyRoutinePresetRowsFromWorkbook(workbook) {
    let updatedMyTemplates = 0, updatedRecommended = 0;

    function collectExerciseMap(sheet, keyOf) {
        const map = new Map(); // key -> Map(exKey -> {part,type,name,restTime,alarmSound,sets:[]})
        sheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return;
            const title = cellText(row, 1); const part = cellText(row, 2); const type = cellText(row, 3);
            const name = cellText(row, 4); if (!name) return;
            const restTime = cellNumber(row, 5); const alarmSoundRaw = cellText(row, 6);
            const setNoRaw = cellText(row, 7);
            const weight = cellNumber(row, 8); const reps = cellNumber(row, 9);
            const setType = cellText(row, 10) || '일반';
            const key = keyOf(row, title); if (!key) return;

            if (!map.has(key)) map.set(key, new Map());
            const exMap = map.get(key);
            const exKey = `${part}|${type}|${name}`;
            if (!exMap.has(exKey)) exMap.set(exKey, { part, type, name, restTime: restTime || 90, alarmSound: alarmSoundRaw || '1', sets: [] });
            const ex = exMap.get(exKey);
            if (restTime) ex.restTime = restTime;
            if (alarmSoundRaw) ex.alarmSound = alarmSoundRaw;
            if (setNoRaw !== '' || weight || reps) ex.sets.push({ type: setType, weight: weight || 0, reps: reps || 0, done: false });
        });
        return map;
    }

    const mySheet = workbook.getWorksheet('내 루틴 프리셋');
    if (mySheet) {
        const knownIds = new Set(state.templates.map(t => t.id));
        const tmplMap = collectExerciseMap(mySheet, (row) => {
            // [버그 수정] 셀 값은 cellText()를 거치며 항상 문자열로 반환되는데, t.id는 숫자(Date.now())라
            // knownIds.has(tmplId)가 타입 불일치로 항상 false였다 — 숫자로 변환해서 비교해야 한다.
            const tmplIdNum = parseInt(cellText(row, 11), 10);
            if (!isNaN(tmplIdNum) && knownIds.has(tmplIdNum)) return tmplIdNum;
            const title = cellText(row, 1); const t = state.templates.find(t => t.title === title);
            return t ? t.id : null;
        });
        tmplMap.forEach((exMap, tmplId) => {
            const tmpl = state.templates.find(t => t.id === tmplId);
            if (tmpl) { tmpl.exercises = Array.from(exMap.values()); updatedMyTemplates++; }
        });
    }

    const recSheet = workbook.getWorksheet('추천 루틴 프리셋');
    if (recSheet) {
        const knownTitles = new Set(RECOMMENDED_ROUTINES.map(r => r.title));
        const titleMap = collectExerciseMap(recSheet, (row, title) => (title && knownTitles.has(title)) ? title : null);
        if (titleMap.size > 0) {
            const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
            titleMap.forEach((exMap, title) => { customRecommended[title] = Array.from(exMap.values()); updatedRecommended++; });
            localStorage.setItem('prep_master_custom_recommended', JSON.stringify(customRecommended));
        }
    }

    return { updatedMyTemplates, updatedRecommended };
}
