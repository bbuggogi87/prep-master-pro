/**
 * 파일명: calendarView.js
 * 역할: 월간 달력 그리드, 날짜 선택, 홈 대시보드 위젯, D-Day 배지, 바벨 원판 계산기 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSave } from '../core/services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT } from './workoutConstants.js';
import { showToast, getWorkoutData, calculateExerciseFrequencies } from './calendarCore.js';
import { renderWorkoutList } from './workoutJournal.js';

let viewYear = 2026;
let viewMonth = 5;

export function updateDdayBadge() {
    const badge = document.getElementById('badge-dday');
    if (!badge || !state.userInfo?.targetDate) return;
    const diff = Math.ceil((new Date(state.userInfo.targetDate) - new Date()) / (1000 * 60 * 60 * 24));
    badge.innerText = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

export function updateHomeDashboardWidgets() {
    const data = getWorkoutData();
    const routineTitle = document.getElementById('home-routine-title');
    if (data.exercises.length > 0) routineTitle.innerText = `현재 ${data.exercises.length}개 종목 기록 중`;
    else routineTitle.innerText = `오늘 지정된 루틴 없음`;

    const widgetBox = document.getElementById('home-quick-widget-box'); widgetBox.innerHTML = '';
    const freqData = calculateExerciseFrequencies();
    const recentShowItems = freqData.slice(0, 3).map(item => item[0]);

    if (recentShowItems.length === 0) {
        widgetBox.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center col-span-3">누적 기록이 부족합니다.</p>`; return;
    }
    recentShowItems.forEach(name => {
        const btn = document.createElement('button'); btn.innerText = name;
        btn.className = "p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 truncate active:scale-95 text-center";
        btn.onclick = () => {
            const currentData = getWorkoutData();
            if (!currentData.exercises.some(e => e.name === name)) {
                let fPart = '기타', fType = '위젯';
                Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
                const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
                currentData.exercises.push({ part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] });
                triggerSave(showToast); showToast(`${name} 기록지에 연동 완료.`);
            } else { showToast("이미 등록된 종목입니다."); }
        };
        widgetBox.appendChild(btn);
    });
}

export function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid'); if(!gridEl) return; gridEl.innerHTML = '';
    document.getElementById('calendar-month-year').textContent = `${viewYear}년 ${String(viewMonth + 1).padStart(2, '0')}월`;

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { gridEl.appendChild(document.createElement('div')); }

    for (let day = 1; day <= lastDate; day++) {
        const dayBtn = document.createElement('button');
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dayBtn.textContent = day;
        dayBtn.className = "p-3 rounded-xl font-bold text-sm transition-all flex flex-col items-center justify-center min-h-[52px] relative border border-transparent hover:border-slate-700 select-none";

        const td = state.workouts[dateStr];
        if (td && ((td.exercises && td.exercises.length > 0) || (td.weight > 0 || td.bf > 0 || td.smm > 0))) {
            const dot = document.createElement('span'); dot.className = "w-1.5 h-1.5 bg-amber-500 rounded-full absolute bottom-1.5"; dayBtn.appendChild(dot);
        }
        if (dateStr === state.selectedDateStr) dayBtn.className += " active-day font-black text-slate-950";
        else {
            dayBtn.className += " bg-slate-800/40 text-slate-300";
            const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
            if (dayOfWeek === 0) dayBtn.className += " text-rose-400"; if (dayOfWeek === 6) dayBtn.className += " text-sky-400";
        }
        dayBtn.onclick = () => selectWorkoutDate(dateStr);
        gridEl.appendChild(dayBtn);
    }
}

export function moveMonth(direction) {
    viewMonth += direction;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } else if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderCalendarGrid();
}

export function selectWorkoutDate(dateStr) {
    state.selectedDateStr = dateStr;
    const parts = dateStr.split('-');
    const labelEl = document.getElementById('label-selected-date');
    if(labelEl) labelEl.textContent = `${parts[1]}/${parts[2]}`;

    const data = getWorkoutData();
    document.getElementById('input-daily-weight').value = data.weight > 0 ? data.weight : '';
    document.getElementById('input-daily-bf').value = data.bf > 0 ? data.bf : '';
    document.getElementById('input-daily-smm').value = data.smm > 0 ? data.smm : '';
    renderCalendarGrid(); renderWorkoutList();
}

export function runPlateCalculate() {
    const totalWeight = parseFloat(document.getElementById('plate-calc-target').value) || 0;
    const resultBox = document.getElementById('plate-calc-result');
    if (totalWeight <= BAR_WEIGHT) { resultBox.innerHTML = `<span class="text-rose-400 font-bold">바 중량(${BAR_WEIGHT}kg) 이상이어야 합니다.</span>`; return; }
    let netWeight = (totalWeight - BAR_WEIGHT) / 2; const platesCount = {};
    AVAILABLE_PLATES.forEach(plate => { if (netWeight >= plate) { const qty = Math.floor(netWeight / plate); platesCount[plate] = qty; netWeight -= plate * qty; } });
    const resultsText = Object.entries(platesCount).map(([w, qty]) => `${w}kg x ${qty}개`).join(', ');
    if (!resultsText) { resultBox.innerHTML = `계산 불가 조합`; return; }
    // [정확도 안내] 보유 원판(2.5kg 단위)으로 나누어떨어지지 않는 목표 중량은 편측에 남는 무게가 생긴다 —
    // 이걸 알리지 않으면 실제보다 가벼운 조합이 마치 정확한 답처럼 보이는 문제가 있었다.
    const shortBy = netWeight > 0.01 ? Math.round(netWeight * 2 * 100) / 100 : 0;
    const warningHtml = shortBy > 0
        ? `<br><span class="text-amber-400 text-[10px] font-bold">⚠️ 보유 원판(2.5kg 단위)으로 정확히 맞지 않아 총 ${shortBy}kg 가벼운 근사값입니다.</span>`
        : '';
    resultBox.innerHTML = `한쪽에 각각 <span class="text-white font-black">[ ${resultsText} ]</span> 장착${warningHtml}`;
}

/** calendar.js 오케스트레이터의 초기 부팅 시퀀스에서 뷰의 연/월을 오늘 기준으로 맞추기 위해 사용합니다. */
export function setViewToToday() {
    const now = new Date();
    viewYear = now.getFullYear(); viewMonth = now.getMonth();
}
