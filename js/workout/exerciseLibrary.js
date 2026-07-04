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
    // [운동 교체] state.libraryTarget이 이미 'replace'로 설정된 채 호출되면(openLibraryForExerciseReplace)
    // 제목을 바꿔 사용자가 지금 "교체" 모드임을 알 수 있게 한다. (title 요소가 없는 화면에서도 안전하게 무시)
    const titleEl = document.getElementById('library-modal-title');
    if (titleEl) titleEl.innerText = state.libraryTarget === 'replace' ? '📚 종목 사전 (운동 교체)' : '📚 종목 사전';
}
export function closeLibraryModal() {
    document.getElementById('library-modal').classList.add('hidden'); document.getElementById('library-modal').classList.remove('flex');
    state.libraryTarget = 'record'; // 다음 번 그냥 openLibraryModal() 호출(일지 상단 버튼 등)이 이전 타깃에 오염되지 않도록 원복
    state.libraryReplaceExIdx = null;
}

/**
 * [운동 교체] 훈련 일지에서 종목 이름 옆 교체 트리거(데스크톱: 호버 버튼)를 누르면 호출된다. 이후 이 팝업에서
 * '추가'를 누르면 injectLibraryToToday()가 이 exIdx의 종목을 부위/종류/이름만 교체하고 세트·알람 정보는 그대로 둔다.
 * 데스크톱 UI 트리거 자체(호버 버튼 바인딩)는 workoutJournal.js/calendar.html에서 별도로 연결한다.
 */
export function openLibraryForExerciseReplace(exIdx) {
    state.libraryTarget = 'replace';
    state.libraryReplaceExIdx = exIdx;
    openLibraryModal();
}
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

/**
 * 넘버링된 것("팩덱 플라이 (2)")까지 포함해 동일 기본 운동명을 가진 항목 수를 센다.
 * 분할해서 여러 번 수행하는 운동(예: 슈퍼세트/부위별 분할)을 지원하기 위해, 같은 종목을 다시 추가할 때
 * 막지 않고 "이미 n개 있는데 추가할지" 확인만 거친 뒤 (n+1) 번호를 붙여 구별한다.
 */
function countMatchingExerciseNames(list, baseName) {
    const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^${escaped}(?: \\(\\d+\\))?$`);
    return list.filter(e => re.test(e.name)).length;
}

export function injectLibraryToToday(mapperIndex) {
    const meta = state.libraryTempMapper[mapperIndex]; if (!meta) return;

    if (state.libraryTarget === 'editor') {
        const buf = state.routineEditorBuffer; if (!buf) return;
        const existingCount = countMatchingExerciseNames(buf.exercises, meta.name);
        if (existingCount > 0 && !confirm(`이미 추가된 종목입니다. 추가하시겠습니까? (${meta.name}, ${existingCount}개)`)) return;
        const finalName = existingCount > 0 ? `${meta.name} (${existingCount + 1})` : meta.name;
        buf.exercises.push({
            part: meta.part, type: meta.type, name: finalName, restTime: 90, alarmSound: '1',
            sets: [{ type: '일반', weight: 40, reps: 10, done: false }]
        });
        renderRoutinePopupEditorDOM(); showToast(`[${finalName}] 편집창 주입 완료.`);
    } else if (state.libraryTarget === 'replace') {
        // [운동 교체] 세트/알람 정보는 그대로 두고 부위/종류/이름만 새로 고른 종목으로 바꿔친다.
        const data = getWorkoutData();
        const exIdx = state.libraryReplaceExIdx;
        const ex = (exIdx !== null && exIdx !== undefined) ? data.exercises[exIdx] : null;
        if (!ex) { closeLibraryModal(); showToast("교체할 종목을 찾을 수 없습니다."); return; }
        const oldName = ex.name;
        ex.part = meta.part; ex.type = meta.type; ex.name = meta.name;
        triggerSave(showToast);
        closeLibraryModal();
        const recordPane = document.getElementById('pane-tab-record');
        if (recordPane && recordPane.classList.contains('block')) renderWorkoutList();
        showToast(`[${oldName}] → [${meta.name}] (으)로 교체 완료.`);
    } else if (state.libraryTarget === 'quickInput') {
        // [빠른 설정 패널] 일지에 바로 추가하지 않고 '빠른 세트 입력' 패널의 종목 select만 채워 준다.
        // (이 모드는 quick-select-ex-name select가 존재하는 화면에서만 의미가 있으며, 트리거 연결은
        // workoutJournal.js에서 별도로 처리한다 — 이 select는 이미 WORKOUT_DB 전체로 채워져 있다.)
        closeLibraryModal();
        const select = document.getElementById('quick-select-ex-name');
        if (select) {
            if (![...select.options].some(o => o.value === meta.name)) {
                const opt = document.createElement('option'); opt.value = meta.name; opt.textContent = meta.name; select.appendChild(opt);
            }
            select.value = meta.name;
        }
        showToast(`[${meta.name}] 종목이 선택되었습니다.`);
    } else {
        const data = getWorkoutData();
        const existingCount = countMatchingExerciseNames(data.exercises, meta.name);
        if (existingCount > 0 && !confirm(`이미 추가된 종목입니다. 추가하시겠습니까? (${meta.name}, ${existingCount}개)`)) return;
        const finalName = existingCount > 0 ? `${meta.name} (${existingCount + 1})` : meta.name;
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        data.exercises.push({ part: meta.part, type: meta.type, name: finalName, restTime: dRest, alarmSound: dSound, sets: [] });
        triggerSave(showToast);
        const recordPane = document.getElementById('pane-tab-record'); // [빠른 설정 패널] 식단(index.html) 화면에는 이 요소 자체가 없다
        if (recordPane && recordPane.classList.contains('block')) renderWorkoutList();
        showToast(`[${finalName}] 일지 반영 완료.`);
    }
}
