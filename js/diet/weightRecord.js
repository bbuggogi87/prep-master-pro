/**
 * 파일명: weightRecord.js
 * 역할: 체중 기록 탭 — 20종 건강 지표 CRUD, KPI 스냅샷, 복합 트렌드 차트, CSV 입출력 담당 모듈
 */

import { state, recalculateAllWeightDeltas } from '../core/store.js';
import { triggerSave, saveToLocal } from '../core/services.js';
import { showToast } from './uiChrome.js';

let mixChartInstance = null;
let selectedBowelValue = '';
let timelineLimit = 10; // [페이지네이션] "더보기"를 누를 때마다 10씩 증가, "닫기"로 10으로 복귀
let wrCalYear, wrCalMonth; // [캘린더 조회] 체중기록 전용 월 캘린더의 현재 연/월(초기값은 initWeightCalendar에서 오늘로 설정)
let wrCalSelectedDate = null;

/**
 * 건강 지표 대시보드 일자별 아코디언 카드 펼침/접힘 토글 함수
 */
export function toggleAccordionCard(dateStr) {
    const details = document.getElementById(`details-${dateStr}`);
    const arrow = document.getElementById(`arrow-${dateStr}`);
    if (!details) return;
    details.classList.toggle('hidden');
    if (arrow) arrow.style.transform = details.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
}

/**
 * 하루치 기록 카드 HTML을 생성한다(수정/삭제 버튼 포함). 기존 타임라인과 신규 캘린더 상세 패널이
 * 동일한 마크업을 공유하도록 렌더 로직을 이 함수 하나로 일원화했다.
 * @param {string} dateStr
 * @param {boolean} [startExpanded] - true면 접힘 없이 바로 펼친 상태로 렌더(캘린더 상세 패널용)
 */
export function buildRecordCardHTML(dateStr, startExpanded = false) {
    const data = state.workouts[dateStr]; if (!data) return '';
    const dayOfWeek = data.dayOfWeek || ''; const delta = data.weightDelta || 0;
    const deltaText = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1); const deltaClass = delta > 0 ? 'text-rose-500' : delta < 0 ? 'text-sky-500' : 'text-slate-400';
    const isWarning = (data.specialNote && (data.specialNote.includes('외식') || data.specialNote.includes('음주') || data.specialNote.includes('치팅')));
    const borderStyle = isWarning ? 'border-rose-500/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-slate-800/80';
    const detailsHiddenClass = startExpanded ? '' : 'hidden';
    const toggleAttr = startExpanded ? '' : `onclick="window.toggleAccordionCard('${dateStr}')"`;
    return `
        <div class="glass-panel border ${borderStyle} rounded-xl overflow-hidden transition-all duration-300" id="accordion-card-${dateStr}">
            <div ${toggleAttr} class="p-3.5 flex justify-between items-center ${startExpanded ? '' : 'cursor-pointer hover:bg-slate-900/40'} transition-colors select-none">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="text-center shrink-0">
                        <span class="text-[10px] text-slate-500 font-bold block uppercase">${dayOfWeek}</span>
                        <span class="text-xs font-black text-slate-300 tracking-tight">${dateStr.slice(5)}</span>
                    </div>
                    <div class="w-px h-6 bg-slate-800"></div>
                    <div class="truncate">
                        <span id="txt-scale-weight-${dateStr}" class="text-sm font-black text-white mr-1.5">${data.weight.toFixed(2)}kg</span>
                        <span id="txt-scale-delta-${dateStr}" class="text-xs font-bold ${deltaClass}">${deltaText}kg</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="px-1.5 py-0.5 text-[9px] font-black uppercase bg-slate-950 border border-slate-800 text-slate-400 rounded-md">${data.workoutPart || '휴식'}</span>
                    <span id="txt-scale-bowel-${dateStr}" class="text-xs font-bold text-sky-500">${data.bowel === 'O' ? '💩' : '🖨️'}</span>
                    ${startExpanded ? '' : `<span class="text-slate-500 font-bold text-xs transition-transform duration-300" id="arrow-${dateStr}">▼</span>`}
                </div>
            </div>
            <div id="details-${dateStr}" class="${detailsHiddenClass} border-t border-slate-800/60 bg-slate-950/40 p-3.5 space-y-3 text-[11px]">
                <div class="grid grid-cols-2 gap-2 text-slate-300">
                    <div><span class="text-slate-500 font-medium">공복 눈바디:</span> <span class="font-black text-amber-400">${data.visualScore || '--'} 점</span></div>
                    <div><span class="text-slate-500 font-medium">공복 심박수:</span> <span class="font-black text-rose-400">${data.restingHR || '--'} bpm</span></div>
                    <div><span class="text-slate-500 font-medium">총 수면시간:</span> <span class="font-bold text-slate-200">${data.sleepTime || '--'} 시간</span></div>
                    <div><span class="text-slate-500 font-medium">컨디션 지표:</span> <span class="font-bold text-sky-400">${data.condition || '--'} / 10</span></div>
                    <div><span class="text-slate-500 font-medium">근력 훈련시간:</span> <span class="font-medium text-slate-200">${data.anaerobic || '0'} 분</span></div>
                    <div><span class="text-slate-500 font-medium">유산소 시간:</span> <span class="font-medium text-slate-200">${data.aerobic || '0'} 분</span></div>
                    <div class="col-span-2"><span class="text-slate-500 font-medium">당일 수분섭취:</span> <span class="font-bold text-blue-400">${data.water || '0'} L</span></div>
                </div>
                <div class="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800/80 space-y-1.5">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-emerald-400">🍽️ 실측 매크로 섭취 총합</span>
                        <span class="text-slate-400 font-mono">비율 [ ${data.macroRatio || '0:0:0'} ]</span>
                    </div>
                    <div class="grid grid-cols-4 gap-1 text-center font-mono text-[10px] text-slate-300">
                        <div class="bg-slate-950 p-1 rounded">탄 ${data.carbs || 0}g</div>
                        <div class="bg-slate-950 p-1 rounded">단 ${data.protein || 0}g</div>
                        <div class="bg-slate-950 p-1 rounded">지 ${data.fat || 0}g</div>
                        <div class="bg-slate-950 p-1 rounded text-amber-400 font-bold">${data.totalKcal || 0}kcal</div>
                    </div>
                </div>
                ${data.specialNote ? `<div class="text-slate-300"><span class="text-purple-400 font-bold">⚠️ 특이사항:</span> <span class="font-medium">${data.specialNote}</span></div>` : ''}
                ${data.memo ? `<div class="text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-900 break-all"><span class="text-slate-500 font-bold block mb-0.5">📝 메모 기술서</span>${data.memo}</div>` : ''}
                <div class="flex gap-2 justify-end pt-1">
                    <button onclick="window.openRecordModal('${dateStr}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold">수정</button>
                    <button onclick="window.deleteWeightRecordData('${dateStr}')" class="px-2.5 py-1 bg-slate-950 border border-slate-800 text-rose-400 hover:bg-rose-500/10 rounded font-bold">삭제</button>
                </div>
            </div>
        </div>`;
}

export function renderWeightRecordList() {
    const container = document.getElementById('weight-records-timeline-container');
    if (!container) return; container.innerHTML = '';
    const sortedDates = Object.keys(state.workouts).filter(date => state.workouts[date].weight > 0).sort((a, b) => new Date(b) - new Date(a));
    if (sortedDates.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-10">아직 기록이 없습니다. 위 버튼으로 오늘 기록을 추가해 보세요.</p>`;
        updateKpiSnapshotCards(); updateMoreLessButtons(0, 0); return;
    }
    const visibleDates = sortedDates.slice(0, timelineLimit);
    visibleDates.forEach((dateStr) => { container.insertAdjacentHTML('beforeend', buildRecordCardHTML(dateStr)); });
    updateKpiSnapshotCards();
    updateMoreLessButtons(visibleDates.length, sortedDates.length);
}

function updateMoreLessButtons(shownCount, totalCount) {
    const moreBtn = document.getElementById('btn-timeline-more');
    const lessBtn = document.getElementById('btn-timeline-less');
    if (moreBtn) moreBtn.classList.toggle('hidden', shownCount >= totalCount);
    if (lessBtn) lessBtn.classList.toggle('hidden', timelineLimit <= 10);
}

export function showMoreTimeline() { timelineLimit += 10; renderWeightRecordList(); }
export function closeMoreTimeline() { timelineLimit = 10; renderWeightRecordList(); }

// ==========================================
// [체중기록 캘린더 조회] 끝없는 타임라인 대신, 월 캘린더에서 날짜를 골라 그날의 기록만 바로 확인/수정/삭제.
// ==========================================
function ensureWeightCalendarInit() {
    if (wrCalYear !== undefined) return;
    const today = new Date();
    wrCalYear = today.getFullYear(); wrCalMonth = today.getMonth();
    wrCalSelectedDate = today.toISOString().slice(0, 10);
}

export function moveWeightCalendarMonth(direction) {
    ensureWeightCalendarInit();
    wrCalMonth += direction;
    if (wrCalMonth < 0) { wrCalMonth = 11; wrCalYear -= 1; } else if (wrCalMonth > 11) { wrCalMonth = 0; wrCalYear += 1; }
    renderWeightCalendar();
}

export function selectWeightCalendarDate(dateStr) {
    ensureWeightCalendarInit();
    wrCalSelectedDate = dateStr;
    renderWeightCalendar();
}

function renderWeightCalendarDetail() {
    const detailEl = document.getElementById('weight-calendar-detail');
    if (!detailEl || !wrCalSelectedDate) return;
    const hasRecord = state.workouts[wrCalSelectedDate] && state.workouts[wrCalSelectedDate].weight > 0;
    if (hasRecord) {
        detailEl.innerHTML = buildRecordCardHTML(wrCalSelectedDate, true);
    } else {
        const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
        const dow = days[new Date(wrCalSelectedDate).getDay()];
        detailEl.innerHTML = `
            <div class="glass-panel border border-slate-800/80 rounded-xl p-6 text-center space-y-3">
                <p class="text-xs text-slate-500">${wrCalSelectedDate} (${dow}) 기록 없음</p>
                <button onclick="window.openRecordModal('${wrCalSelectedDate}')" class="px-4 py-2 bg-sky-600/20 border border-sky-500/40 text-sky-400 text-xs font-bold rounded-xl transition-all active:scale-95">＋ 이 날짜 기록하기</button>
            </div>`;
    }
}

export function renderWeightCalendar() {
    ensureWeightCalendarInit();
    const gridEl = document.getElementById('weight-calendar-grid'); if (!gridEl) return; gridEl.innerHTML = '';
    const labelEl = document.getElementById('weight-calendar-month-label');
    if (labelEl) labelEl.textContent = `${wrCalYear}년 ${String(wrCalMonth + 1).padStart(2, '0')}월`;

    const firstDay = new Date(wrCalYear, wrCalMonth, 1).getDay();
    const lastDate = new Date(wrCalYear, wrCalMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) gridEl.appendChild(document.createElement('div'));

    for (let day = 1; day <= lastDate; day++) {
        const dateStr = `${wrCalYear}-${String(wrCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const hasRecord = state.workouts[dateStr] && state.workouts[dateStr].weight > 0;
        const dayBtn = document.createElement('button');
        dayBtn.textContent = day;
        dayBtn.className = "p-2 rounded-lg font-bold text-xs transition-all flex flex-col items-center justify-center min-h-[38px] relative border border-transparent hover:border-slate-700 select-none";
        if (hasRecord) { const dot = document.createElement('span'); dot.className = "w-1.5 h-1.5 bg-sky-500 rounded-full absolute bottom-1"; dayBtn.appendChild(dot); }
        if (dateStr === wrCalSelectedDate) {
            dayBtn.className += " wr-active-day font-black";
        } else {
            dayBtn.className += hasRecord ? " bg-slate-800/60 text-slate-200" : " bg-slate-900/40 text-slate-500";
            const dow = new Date(wrCalYear, wrCalMonth, day).getDay();
            if (dow === 0) dayBtn.className += " text-rose-400"; if (dow === 6) dayBtn.className += " text-sky-400";
        }
        dayBtn.onclick = () => selectWeightCalendarDate(dateStr);
        gridEl.appendChild(dayBtn);
    }

    renderWeightCalendarDetail();
}

export function openRecordModal(editDateStr = '') {
    const modal = document.getElementById('weight-record-modal'); const dateInput = document.getElementById('record-date-input'); const titleLbl = document.getElementById('record-modal-title'); if (!modal) return;
    document.body.style.position = 'fixed'; document.body.style.width = '100%'; document.querySelectorAll('.chip-note-tag').forEach(c => c.classList.remove('matrix-chip-active'));
    if (editDateStr) {
        titleLbl.innerText = `✏️ [${editDateStr}] 기록 수정`; dateInput.value = editDateStr; dateInput.readOnly = true; handleRecordDateChange(editDateStr);
        const data = state.workouts[editDateStr] || {};
        document.getElementById('record-weight-input').value = data.weight || ''; document.getElementById('record-visual-input').value = data.visualScore || '';
        document.getElementById('record-hr-input').value = data.restingHR || ''; document.getElementById('record-sleep-input').value = data.sleepTime || '';
        document.getElementById('record-part-input').value = data.workoutPart || ''; document.getElementById('record-anaerobic-input').value = data.anaerobic || '';
        document.getElementById('record-aerobic-input').value = data.aerobic || ''; document.getElementById('record-water-input').value = data.water || '0';
        document.getElementById('record-condition-input').value = data.condition || '7'; document.getElementById('cond-val-lbl').innerText = (data.condition || '7') + '점';
        document.getElementById('record-carbs-input').value = data.carbs || ''; document.getElementById('record-protein-input').value = data.protein || '';
        document.getElementById('record-fat-input').value = data.fat || ''; document.getElementById('record-kcal-input').value = data.totalKcal || '';
        document.getElementById('record-ratio-display').innerText = data.macroRatio || '0:0:0'; document.getElementById('record-special-input').value = data.specialNote || '';
        document.getElementById('record-memo-input').value = data.memo || ''; setBowelField(data.bowel || '');
    } else {
        titleLbl.innerText = `＋ 오늘 기록`; const todayStr = state.selectedDateStr || new Date().toISOString().slice(0, 10);
        dateInput.value = todayStr; dateInput.readOnly = false; handleRecordDateChange(todayStr);
        document.getElementById('record-weight-input').value = ''; document.getElementById('record-visual-input').value = '';
        document.getElementById('record-hr-input').value = ''; document.getElementById('record-sleep-input').value = '';
        document.getElementById('record-part-input').value = ''; document.getElementById('record-anaerobic-input').value = '';
        document.getElementById('record-aerobic-input').value = ''; document.getElementById('record-water-input').value = '0';
        document.getElementById('record-condition-input').value = '7'; document.getElementById('cond-val-lbl').innerText = '7점';
        document.getElementById('record-carbs-input').value = ''; document.getElementById('record-protein-input').value = '';
        document.getElementById('record-fat-input').value = ''; document.getElementById('record-kcal-input').value = '';
        document.getElementById('record-ratio-display').innerText = '0:0:0'; document.getElementById('record-special-input').value = '';
        document.getElementById('record-memo-input').value = ''; setBowelField('');
    }
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

export function closeRecordModal() { const modal = document.getElementById('weight-record-modal'); if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); } document.body.style.position = ''; document.body.style.width = ''; }
export function handleRecordDateChange(dateVal) { const display = document.getElementById('record-day-display'); if (!dateVal || !display) return; const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']; const dayIndex = new Date(dateVal).getDay(); display.value = isNaN(dayIndex) ? '오류' : days[dayIndex]; }
export function setBowelField(val) { selectedBowelValue = val; const btnO = document.getElementById('btn-bowel-o'); const btnX = document.getElementById('btn-bowel-x'); if (!btnO || !btnX) return; btnO.className = "bg-slate-950 border border-slate-700 font-black text-slate-400 rounded-lg transition-colors"; btnX.className = "bg-slate-950 border border-slate-700 font-black text-slate-400 rounded-lg transition-colors"; if (val === 'O') btnO.className = "bg-emerald-500 border border-emerald-600 font-black text-slate-950 rounded-lg transition-colors"; if (val === 'X') btnX.className = "bg-rose-500 border border-rose-600 font-black text-slate-950 rounded-lg transition-colors"; }
export function toggleQuickNoteChip(tag) { const input = document.getElementById('record-special-input'); if (!input) return; let tokens = input.value.trim() ? input.value.split(',').map(s => s.trim()).filter(Boolean) : []; if (tokens.includes(tag)) tokens = tokens.filter(t => t !== tag); else tokens.push(tag); input.value = tokens.join(', '); }

export function pullDietaryMacrosFromPlanner() {
    const activeDate = document.getElementById('record-date-input').value; const loader = document.getElementById('global-loading-layer'); if(loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }
    setTimeout(() => {
        const kcalTxt = document.getElementById('sticky-kcal')?.innerText || '0'; const carbsTxt = document.getElementById('sticky-carbs')?.innerText || '0g';
        const proteinTxt = document.getElementById('sticky-protein')?.innerText || '0g'; const fatTxt = document.getElementById('sticky-fat')?.innerText || '0g';
        const totalKcal = parseInt(kcalTxt.replace(/,/g, '')) || 0; const carbs = parseFloat(carbsTxt.split(' ')[0]) || 0; const protein = parseFloat(proteinTxt.split(' ')[0]) || 0; const fat = parseFloat(fatTxt.split(' ')[0]) || 0;
        document.getElementById('record-carbs-input').value = carbs > 0 ? carbs : ''; document.getElementById('record-protein-input').value = protein > 0 ? protein : ''; document.getElementById('record-fat-input').value = fat > 0 ? fat : ''; document.getElementById('record-kcal-input').value = totalKcal > 0 ? totalKcal : '';
        const cK = carbs * 4, pK = protein * 4, fK = fat * 9; const sum = cK + pK + fK; let ratioStr = '0:0:0';
        if (sum > 0) { const cP = Math.round((cK / sum) * 10); const pP = Math.round((pK / sum) * 10); ratioStr = `${cP}:${pP}:${10 - (cP + pP)}`; }
        document.getElementById('record-ratio-display').innerText = ratioStr;
        const wData = state.workouts[activeDate];
        if (wData && wData.exercises && wData.exercises.length > 0) {
            const parts = [...new Set(wData.exercises.map(e => e.part))]; document.getElementById('record-part-input').value = parts.join(' / ');
            let totalSets = 0; wData.exercises.forEach(e => totalSets += (e.sets ? e.sets.length : 0)); if (totalSets > 0) document.getElementById('record-anaerobic-input').value = totalSets * 3;
        }
        if(loader) loader.classList.add('hidden'); showToast("식단 및 수행 훈련 지표 상속 완료.");
    }, 250);
}

export function saveWeightRecordData() {
    const dateStr = document.getElementById('record-date-input').value; const weightVal = parseFloat(document.getElementById('record-weight-input').value) || 0;
    if (!dateStr || weightVal <= 0) { alert("기록 일자 및 공복 체중을 올바르게 기입하십시오."); return; }
    if (!state.workouts[dateStr]) state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] }; const target = state.workouts[dateStr];
    target.weight = weightVal; target.dayOfWeek = document.getElementById('record-day-display').value;
    target.visualScore = parseInt(document.getElementById('record-visual-input').value) || 0; target.restingHR = parseInt(document.getElementById('record-hr-input').value) || 0;
    target.sleepTime = parseFloat(document.getElementById('record-sleep-input').value) || 0; target.workoutPart = document.getElementById('record-part-input').value.trim();
    target.anaerobic = parseInt(document.getElementById('record-anaerobic-input').value) || 0; target.aerobic = parseInt(document.getElementById('record-aerobic-input').value) || 0;
    target.water = parseFloat(document.getElementById('record-water-input').value) || 0; target.bowel = selectedBowelValue || 'X';
    target.condition = parseInt(document.getElementById('record-condition-input').value) || 7; target.carbs = parseFloat(document.getElementById('record-carbs-input').value) || 0;
    target.protein = parseFloat(document.getElementById('record-protein-input').value) || 0; target.fat = parseFloat(document.getElementById('record-fat-input').value) || 0;
    target.totalKcal = parseInt(document.getElementById('record-kcal-input').value) || 0; target.macroRatio = document.getElementById('record-ratio-display').innerText;
    target.specialNote = document.getElementById('record-special-input').value.trim(); target.memo = document.getElementById('record-memo-input').value.trim();
    recalculateAllWeightDeltas(); saveToLocal(); closeRecordModal(); renderWeightRecordList(); renderWeightCalendar(); setMatrixFilter(state.weightRecordFilter || 'all');
    const activeToday = new Date().toISOString().slice(0,10); if (state.workouts[activeToday] && state.workouts[activeToday].weight > 0) { document.getElementById('prof-weight-display').innerText = state.workouts[activeToday].weight.toFixed(2) + 'kg'; }
    showToast("기록 저장 완료.");
}

export function deleteWeightRecordData(dateStr) {
    if (confirm(`[${dateStr}] 기록을 삭제할까요?\n(등록된 운동 일지는 그대로 보존됩니다.)`)) {
        const t = state.workouts[dateStr];
        if (t) { t.weight = 0; t.weightDelta = 0; t.visualScore = 0; t.restingHR = 0; t.sleepTime = 0; t.workoutPart = ''; t.anaerobic = 0; t.aerobic = 0; t.water = 0; t.bowel = 'X'; t.carbs = 0; t.protein = 0; t.fat = 0; t.totalKcal = 0; t.macroRatio = '0:0:0'; t.specialNote = ''; t.memo = ''; }
        recalculateAllWeightDeltas(); saveToLocal(); renderWeightRecordList(); renderWeightCalendar(); setMatrixFilter(state.weightRecordFilter || 'all'); showToast("기록을 삭제했습니다.");
    }
}

export function setMatrixFilter(filterType) {
    state.weightRecordFilter = filterType;
    const chips = ['all', 'weight', 'macros', 'condition'];
    chips.forEach(c => { const btn = document.getElementById('chip-filter-' + c); if (btn) btn.className = (c === filterType) ? "px-4 py-2 text-xs font-black rounded-xl bg-sky-500 text-white transition-all shadow-md matrix-chip-active" : "px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 border border-slate-800 text-slate-400 transition-all"; });
    const cWeight = document.getElementById('kpi-card-weight'); const cMacros = document.getElementById('kpi-card-macros'); const cCond = document.getElementById('kpi-card-condition');

    // [보완 완료] classList 개별 조작 가드로 replace 무력화 버그 완벽 수정
    if(cWeight) { cWeight.className = "glass-panel p-5 rounded-2xl transition-all duration-300 opacity-100 scale-100 border border-slate-800"; }
    if(cMacros) { cMacros.className = "glass-panel p-5 rounded-2xl transition-all duration-300 opacity-100 scale-100 border border-slate-800"; }
    if(cCond) { cCond.className = "glass-panel p-5 rounded-2xl transition-all duration-300 opacity-100 scale-100 border border-slate-800 col-span-2"; }

    if (filterType === 'weight') {
        if (cMacros) cMacros.className += " opacity-25 scale-95"; if (cCond) cCond.className += " opacity-25 scale-95";
        if (cWeight) { cWeight.classList.remove('border-slate-800'); cWeight.classList.add('border-sky-500', 'shadow-[0_0_15px_rgba(14,165,233,0.2)]', 'scale-[1.02]'); }
    } else if (filterType === 'macros') {
        if (cWeight) cWeight.className += " opacity-25 scale-95"; if (cCond) cCond.className += " opacity-25 scale-95";
        if (cMacros) { cMacros.classList.remove('border-slate-800'); cMacros.classList.add('border-emerald-500', 'shadow-[0_0_15px_rgba(16,185,129,0.2)]', 'scale-[1.02]'); }
    } else if (filterType === 'condition') {
        if (cWeight) cWeight.className += " opacity-25 scale-95"; if (cMacros) cMacros.className += " opacity-25 scale-95";
        if (cCond) { cCond.classList.remove('border-slate-800'); cCond.classList.add('border-purple-500', 'shadow-[0_0_15px_rgba(168,85,247,0.2)]', 'scale-[1.02]'); }
    }
    const sortedDates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0);
    sortedDates.forEach(dateStr => {
        const tW = document.getElementById(`txt-scale-weight-${dateStr}`); const tB = document.getElementById(`txt-scale-bowel-${dateStr}`);
        if (tW && tB) { tW.className = (filterType === 'weight') ? "text-base font-black text-sky-400 mr-1.5 transition-all" : "text-sm font-black text-white mr-1.5 transition-all"; tB.className = (filterType === 'condition') ? "text-base font-black text-purple-400 transition-all" : "text-xs font-bold text-amber-500 transition-all"; }
    });
    updateWeightTrendChart();
}

const CHART_RANGE_COUNTS = { '7d': 7, '1m': 30, '6m': 182, 'all': Infinity };

/**
 * 추세 차트의 조회 기간(7일/1개월/6개월/전체)을 변경한다. 주식 차트의 기간 선택 버튼과 동일한 UX.
 */
export function setChartRange(range) {
    state.weightRecordChartRange = range;
    const btns = { '7d': 'chip-range-7d', '1m': 'chip-range-1m', '6m': 'chip-range-6m', 'all': 'chip-range-all' };
    Object.entries(btns).forEach(([r, id]) => {
        const btn = document.getElementById(id);
        if (btn) btn.className = r === range
            ? "px-3 py-1.5 text-[11px] font-black rounded-lg bg-sky-500 text-white transition-all shadow-md"
            : "px-3 py-1.5 text-[11px] font-bold rounded-lg bg-slate-900 border border-slate-800 text-slate-400 transition-all";
    });
    updateWeightTrendChart();
}

export function updateWeightTrendChart() {
    const canvas = document.getElementById('chart-weight-trend-mix'); if (!canvas) return; const ctx = canvas.getContext('2d');
    const chronologicalDates = Object.keys(state.workouts).filter(date => state.workouts[date].weight > 0).sort((a, b) => new Date(a) - new Date(b));
    const rangeCount = CHART_RANGE_COUNTS[state.weightRecordChartRange || '7d'] || 7;
    const rangeDates = Number.isFinite(rangeCount) ? chronologicalDates.slice(-rangeCount) : chronologicalDates;
    const chartLabels = rangeDates.map(d => d.slice(5).replace('-', '/'));
    if (mixChartInstance) { mixChartInstance.destroy(); mixChartInstance = null; } if (rangeDates.length === 0) return;
    const filterMode = state.weightRecordFilter || 'all'; let datasets = []; let optionsScales = { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, weight: '600' } } } };
    if (filterMode === 'all') {
        datasets = [
            { type: 'line', label: '공복체중(kg)', data: rangeDates.map(d => state.workouts[d].weight), borderColor: '#0EA5E9', backgroundColor: 'transparent', borderWidth: 3, pointBackgroundColor: '#0EA5E9', yAxisID: 'yLeft', tension: 0.25 },
            { type: 'bar', label: '섭취열량(kcal)', data: rangeDates.map(d => state.workouts[d].totalKcal || 0), backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderRadius: 6, yAxisID: 'yRight' }
        ];
        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#0EA5E9', font: { size: 10 } } };
        optionsScales.yRight = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 9 } } };
    } else if (filterMode === 'weight') {
        datasets = [
            { type: 'line', label: '공복체중(kg)', data: rangeDates.map(d => state.workouts[d].weight), borderColor: '#0EA5E9', backgroundColor: 'transparent', borderWidth: 3, pointBackgroundColor: '#0EA5E9', yAxisID: 'yLeft', tension: 0.1 },
            { type: 'bar', label: '체중변화(kg)', data: rangeDates.map(d => state.workouts[d].weightDelta || 0), backgroundColor: rangeDates.map(d => (state.workouts[d].weightDelta || 0) > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(14, 165, 233, 0.4)'), borderColor: rangeDates.map(d => (state.workouts[d].weightDelta || 0) > 0 ? '#EF4444' : '#0EA5E9'), borderWidth: 1, borderRadius: 4, yAxisID: 'yDelta' }
        ];
        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#0EA5E9', font: { size: 10 } } };
        optionsScales.yDelta = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } };
    } else if (filterMode === 'macros') {
        datasets = [
            { type: 'bar', label: '총칼로리(kcal)', data: rangeDates.map(d => state.workouts[d].totalKcal || 0), backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981', borderWidth: 1.5, borderRadius: 6, yAxisID: 'yLeft' },
            { type: 'line', label: '탄수화물(g)', data: rangeDates.map(d => state.workouts[d].carbs || 0), borderColor: '#F59E0B', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2 },
            { type: 'line', label: '단백질(g)', data: rangeDates.map(d => state.workouts[d].protein || 0), borderColor: '#10B981', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2 },
            { type: 'line', label: '지방(g)', data: rangeDates.map(d => state.workouts[d].fat || 0), borderColor: '#0EA5E9', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2 }
        ];
        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#10B981', font: { size: 9 } } };
        optionsScales.yRight = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 9 } } };
    } else if (filterMode === 'condition') {
        datasets = [
            { type: 'line', label: '종합컨디션(점)', data: rangeDates.map(d => state.workouts[d].condition || 7), borderColor: '#0EA5E9', borderWidth: 2.5, pointRadius: 3, backgroundColor: 'transparent', yAxisID: 'yLeft', tension: 0.3 },
            { type: 'line', label: '눈바디점수(점)', data: rangeDates.map(d => state.workouts[d].visualScore || 5), borderColor: '#A855F7', borderWidth: 2.5, pointRadius: 3, backgroundColor: 'transparent', yAxisID: 'yLeft', tension: 0.3 },
            { type: 'line', label: '수면시간(h)', data: rangeDates.map(d => state.workouts[d].sleepTime || 0), borderColor: '#64748B', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.1 }
        ];
        optionsScales.yLeft = { position: 'left', min: 1, max: 10, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#0EA5E9', stepSize: 1, font: { size: 10 } } };
        optionsScales.yRight = { position: 'right', min: 0, max: 12, grid: { display: false }, ticks: { color: '#94A3B8', stepSize: 2, font: { size: 9 } } };
    }
    mixChartInstance = new Chart(ctx, { data: { labels: chartLabels, datasets: datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { color: '#64748B', boxWidth: 8, boxHeight: 8, font: { size: 9 } } } }, scales: optionsScales } });
}

function updateKpiSnapshotCards() {
    const sorted = Object.keys(state.workouts).filter(date => state.workouts[date].weight > 0).sort((a, b) => new Date(b) - new Date(a));
    const wLbl = document.getElementById('kpi-display-weight'); if (!wLbl) return;
    if (sorted.length === 0) { wLbl.innerText = "-- kg"; document.getElementById('kpi-display-kcal').innerText = "-- kcal"; return; }
    const recent7 = sorted.slice(0, 7); let sumW = 0, sumK = 0, sumC = 0, sumP = 0, sumF = 0, sumSleep = 0, sumCond = 0, bowelO = 0;
    recent7.forEach(d => { const o = state.workouts[d]; sumW += o.weight; sumK += o.totalKcal || 0; sumC += o.carbs || 0; sumP += o.protein || 0; sumF += o.fat || 0; sumSleep += o.sleepTime || 0; sumCond += o.condition || 7; if (o.bowel === 'O') bowelO++; }); const len = recent7.length;
    wLbl.innerText = `${(sumW/len).toFixed(1)} kg`; document.getElementById('kpi-sub-weight').innerText = `최근 기록 변화량: ${(state.workouts[sorted[0]].weightDelta || 0).toFixed(1)} kg`;
    document.getElementById('kpi-display-kcal').innerText = `${Math.round(sumK/len).toLocaleString()} kcal`; document.getElementById('kpi-sub-macros').innerText = `주간평균 탄:${Math.round(sumC/len)}g 단:${Math.round(sumP/len)}g 지:${Math.round(sumF/len)}g`;
    document.getElementById('kpi-display-cond').innerText = `평균 수면: ${(sumSleep/len).toFixed(1)}h | 컨디션: ${(sumCond/len).toFixed(1)}점`; document.getElementById('kpi-display-bowel').innerText = `배변 빈도: ${Math.round((bowelO/len)*100)}%`;
}

export async function exportWeightRecordsToCSV() {
    const loader = document.getElementById('global-loading-layer'); if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }
    setTimeout(async () => {
        let csvContent = "﻿";
        const headers = ["일자", "요일", "공복체중(kg)", "체중변화량(kg)", "수면시간(시간)", "컨디션(1-10)", "눈바디점수(1-10)", "공복심박수(bpm)", "운동부위", "탄수화물(g)", "단백질(g)", "지방(g)", "총섭취칼로리(kcal)", "탄단지비율", "수분섭취(L)", "근력운동(분)", "유산소(분)", "배변활동(O/X)", "특이사항", "메모"];
        csvContent += headers.join(",") + "\n";
        const dates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0).sort((a, b) => new Date(a) - new Date(b));
        dates.forEach(dateStr => {
            const d = state.workouts[dateStr]; const sNote = d.specialNote ? `"${d.specialNote.replace(/"/g, '""')}"` : '""'; const memoStr = d.memo ? `"${d.memo.replace(/"/g, '""')}"` : '""';
            const row = [dateStr, d.dayOfWeek || "", d.weight.toFixed(2), (d.weightDelta || 0).toFixed(2), d.sleepTime || 0, d.condition || 7, d.visualScore || 5, d.restingHR || 60, d.workoutPart ? `"${d.workoutPart.replace(/"/g, '""')}"` : '""', d.carbs || 0, d.protein || 0, d.fat || 0, d.totalKcal || 0, d.macroRatio || "0:0:0", d.water || 0, d.anaerobic || 0, d.aerobic || 0, d.bowel || "X", sNote, memoStr];
            csvContent += row.join(",") + "\n";
        });
        const pad = n => n < 10 ? '0' + n : n; const now = new Date(); const fileName = `Diet_Weight_Report_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.csv`;
        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Excel CSV', accept: { 'text/csv': ['.csv'] } }] });
                const writable = await handle.createWritable(); await writable.write(csvContent); await writable.close(); showToast("모바일 지정 폴더에 저장되었습니다.");
            } else {
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", fileName); link.click(); showToast("다운로드 폴더에 저장되었습니다.");
            }
        } catch (err) { showToast("백업 취소됨."); } finally { if (loader) loader.classList.add('hidden'); }
    }, 200);
}

export function importWeightRecordsFromCSV(event) {
    const file = event.target.files[0]; if (!file) return;
    const loader = document.getElementById('global-loading-layer'); if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const lines = e.target.result.split(/\r?\n/).filter(line => line.trim().length > 0);
            if (lines.length <= 1 || !lines[0].includes("공복체중")) throw new Error("서식이 잘못되었습니다.");
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim()); if (row.length < 3) continue;
                let rawDate = row[0].replace(/"/g, ''); const match = rawDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); if (!match) continue;
                const dStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`; const weight = parseFloat(row[2]) || 0; if (weight <= 0) continue;
                if (!state.workouts[dStr]) state.workouts[dStr] = { weight: 0, bf: 0, smm: 0, exercises: [] }; const t = state.workouts[dStr];
                t.weight = weight; t.dayOfWeek = row[1].replace(/"/g, '') || ""; t.sleepTime = parseFloat(row[4]) || 0;
                t.condition = parseInt(row[5]) || 7; t.visualScore = parseInt(row[6]) || 5; t.restingHR = parseInt(row[7]) || 60;
                t.workoutPart = row[8] ? row[8].replace(/"/g, '') : ""; t.carbs = parseFloat(row[9]) || 0; t.protein = parseFloat(row[10]) || 0;
                t.fat = parseFloat(row[11]) || 0; t.totalKcal = parseInt(row[12]) || 0; t.macroRatio = row[13] ? row[13].replace(/"/g, '') : "0:0:0";
                t.water = parseFloat(row[14]) || 0; t.anaerobic = parseInt(row[15]) || 0; t.aerobic = parseInt(row[16]) || 0; t.bowel = row[17] ? row[17].replace(/"/g, '') : "X";
                t.specialNote = row[18] ? row[18].replace(/"/g, '') : ""; t.memo = row[19] ? row[19].replace(/"/g, '') : ""; count++;
            }
            recalculateAllWeightDeltas(); saveToLocal(); renderWeightRecordList(); renderWeightCalendar(); setMatrixFilter(state.weightRecordFilter || 'all'); showToast(`총 ${count}개 일자 지표 복원 완료.`);
        } catch (err) { alert(`복원 실패: ${err.message}`); } finally { if (loader) loader.classList.add('hidden'); event.target.value = ''; }
    };
    reader.readAsText(file, 'UTF-8');
}
