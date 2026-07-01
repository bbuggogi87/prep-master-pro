/**
 * 파일명: exerciseLibrary.js
 * 역할: 초성 지원 계층형 종목 사전 모달 — 검색/필터 및 오늘 일지·루틴 편집기로의 종목 주입 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSave } from '../core/services.js';
import { WORKOUT_DB } from './workoutConstants.js';
import { showToast, getWorkoutData, getHangulChosung, calculateExerciseFrequencies } from './calendarCore.js';
import { renderWorkoutList } from './workoutJournal.js';
import { renderRoutinePopupEditorDOM } from './routineTemplates.js';

let libraryActivePart = '가슴';
let libraryActiveType = '전체';

export function openLibraryModal() {
    document.getElementById('library-fullname-viewer').classList.add('hidden');
    document.getElementById('library-modal').classList.remove('hidden');
    document.getElementById('library-modal').classList.add('flex');
    libraryActivePart = '전체'; libraryActiveType = '전체'; runLibrarySearchFilter();
}
export function closeLibraryModal() { document.getElementById('library-modal').classList.add('hidden'); document.getElementById('library-modal').classList.remove('flex'); }
export function changeLibraryPartFilter(part) { libraryActivePart = part; libraryActiveType = '전체'; runLibrarySearchFilter(); }
export function changeLibraryTypeFilter(type) { libraryActiveType = type; runLibrarySearchFilter(); }

export function showFullExerciseName(mapperIndex) {
    const meta = state.libraryTempMapper[mapperIndex]; if (!meta) return;
    const viewer = document.getElementById('library-fullname-viewer');
    viewer.innerText = `🔍 전체 운동 명칭: ${meta.name}`; viewer.classList.remove('hidden');
}

export function runLibrarySearchFilter() {
    const rawInput = document.getElementById('library-search-input').value.trim().toLowerCase();
    const input = rawInput.replace(/\s+/g, '');
    const grid = document.getElementById('library-master-card-grid'); grid.innerHTML = '';

    const filterBar = document.getElementById('library-filter-part-bar'); filterBar.innerHTML = '';
    const parts = ['전체', ...Object.keys(WORKOUT_DB)];
    parts.forEach(p => {
        const pill = document.createElement('button'); pill.innerText = p;
        pill.className = `px-3 py-1.5 text-xs font-black rounded-full whitespace-nowrap transition-colors ${p === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`;
        pill.onclick = () => changeLibraryPartFilter(p); filterBar.appendChild(pill);
    });

    const typeBar = document.getElementById('library-filter-type-bar'); typeBar.innerHTML = '';
    if (libraryActivePart !== '전체' && WORKOUT_DB[libraryActivePart]) {
        typeBar.classList.remove('hidden'); typeBar.classList.add('flex');
        const types = ['전체', ...Object.keys(WORKOUT_DB[libraryActivePart])];
        types.forEach(t => {
            const pill = document.createElement('button'); pill.innerText = t;
            pill.className = `px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors ${t === libraryActiveType ? 'bg-sky-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`;
            pill.onclick = () => changeLibraryTypeFilter(t); typeBar.appendChild(pill);
        });
    } else { typeBar.classList.remove('flex'); typeBar.classList.add('hidden'); }

    let globalMatchCounter = 0; state.libraryTempMapper = [];

    Object.entries(WORKOUT_DB).forEach(([part, types]) => {
        if (libraryActivePart !== '전체' && part !== libraryActivePart) return;
        Object.entries(types).forEach(([type, names]) => {
            if (libraryActiveType !== '전체' && type !== libraryActiveType) return;
            names.forEach(name => {
                const cleanName = name.toLowerCase().replace(/\s+/g, '');
                const chosung = getHangulChosung(name).toLowerCase().replace(/\s+/g, '');
                if (input && !(cleanName.includes(input) || chosung.includes(input))) return;

                const mappedIdx = globalMatchCounter++;
                state.libraryTempMapper.push({ part: part, type: type, name: name });

                const card = document.createElement('div');
                card.className = "h-16 p-3 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center overflow-hidden";
                card.innerHTML = `
                    <div class="truncate mr-2 flex-1 cursor-pointer" onclick="window.showFullExerciseName(${mappedIdx})">
                        <span class="text-[9px] font-bold text-slate-500 block uppercase">${part} · ${type}</span>
                        <h4 class="text-xs sm:text-sm font-black text-slate-200 truncate leading-tight">${name}</h4>
                    </div>
                    <button onclick="window.injectLibraryToToday(${mappedIdx})" class="px-2.5 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[11px] font-bold rounded-lg transition-colors shrink-0">추가</button>`;
                grid.appendChild(card);
            });
        });
    });

    const freqBox = document.getElementById('library-frequent-box');
    const freqGrid = document.getElementById('library-frequent-grid'); freqGrid.innerHTML = '';
    const freqData = calculateExerciseFrequencies();

    if (freqData.length > 0) {
        freqBox.classList.remove('hidden');
        freqData.forEach(([name, count]) => {
            let fPart = '기타', fType = '기타';
            Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));

            const mappedIdx = globalMatchCounter++;
            state.libraryTempMapper.push({ part: fPart, type: fType, name: name });

            const card = document.createElement('div');
            card.className = "h-16 p-3 bg-slate-950 border border-amber-500/20 rounded-xl flex justify-between items-center overflow-hidden";
            card.innerHTML = `
                <div class="truncate mr-2 flex-1 cursor-pointer" onclick="window.showFullExerciseName(${mappedIdx})">
                    <span class="text-[9px] font-black text-amber-500 block uppercase">★ 최다수행 (${count}회)</span>
                    <h4 class="text-xs sm:text-sm font-black text-slate-300 truncate leading-tight">${name}</h4>
                </div>
                <button onclick="window.injectLibraryToToday(${mappedIdx})" class="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 text-[11px] text-amber-400 font-bold rounded-lg border border-amber-500/20 transition-colors shrink-0">추가</button>`;
            freqGrid.appendChild(card);
        });
    } else { freqBox.classList.add('hidden'); }
}

export function injectLibraryToToday(mapperIndex) {
    const meta = state.libraryTempMapper[mapperIndex]; if (!meta) return;

    if (state.libraryTarget === 'editor') {
        const buf = state.routineEditorBuffer; if (!buf) return;
        if (!buf.exercises.some(e => e.name === meta.name)) {
            buf.exercises.push({
                part: meta.part, type: meta.type, name: meta.name, restTime: 90, alarmSound: '1',
                sets: [{ type: '일반', weight: 40, reps: 10, done: false }]
            });
            renderRoutinePopupEditorDOM(); showToast(`[${meta.name}] 편집창 주입 완료.`);
        } else { showToast("이미 추가된 종목입니다."); }
    } else {
        const data = getWorkoutData();
        if (!data.exercises.some(e => e.name === meta.name)) {
            const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
            data.exercises.push({ part: meta.part, type: meta.type, name: meta.name, restTime: dRest, alarmSound: dSound, sets: [] });
            triggerSave(showToast); if (document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList();
            showToast(`[${meta.name}] 일지 반영 완료.`);
        } else { showToast("이미 추가된 종목입니다."); }
    }
}
