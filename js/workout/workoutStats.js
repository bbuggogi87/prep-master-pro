/**
 * 파일명: workoutStats.js
 * 역할: 입체분석 탭 — 부위별 세트 균형 레이더/볼륨 추이/체중 추이 차트 및 종합 통계 담당 모듈
 */

import { state } from '../core/store.js';
import { MUSCLE_CATEGORIES, VOLUME_PRINCIPLES, computeWeeklySetCounts, classifyStatus, STATUS_META, getContributingExercises } from './muscleVolumeGuide.js';
import { stripNumberingSuffix } from './calendarCore.js';

let chartBalance = null;
let chartVolume = null;
let chartWeight = null;
let volumeRangeMode = 'thisWeek';

/**
 * [분석 탭] 부위별 주간 세트 수 — Schoenfeld/Israetel 상급자 근비대 가이드 기준 10개 근육군의
 * 이번 주/지난 주/최근 4주 평균 완료 세트 수와 부족·적정·초과 상태를 표로 보여준다.
 */
export function renderMuscleVolumeCard() {
    const container = document.getElementById('muscle-volume-list');
    if (!container) return;
    const counts = computeWeeklySetCounts(volumeRangeMode, state.workouts);
    container.innerHTML = '';
    MUSCLE_CATEGORIES.forEach(cat => {
        const rawCount = counts[cat.key];
        const displayCount = volumeRangeMode === 'average' ? rawCount.toFixed(1) : Math.round(rawCount);
        const status = classifyStatus(rawCount, cat.setRange);
        const meta = STATUS_META[status];
        const row = document.createElement('button');
        row.type = 'button';
        row.onclick = () => window.openMuscleGuideModal(cat.key);
        row.className = 'w-full flex items-center justify-between gap-2 p-3.5 bg-slate-950/60 border border-slate-800/80 rounded-xl hover:bg-slate-900 transition-colors text-left';
        row.innerHTML = `
            <div class="flex items-center gap-2.5 min-w-0">
                <img src="${cat.icon}" alt="${cat.label}" class="w-9 h-9 rounded-lg object-cover shrink-0">
                <div class="min-w-0">
                    <p class="text-sm font-black text-white truncate">${cat.label}</p>
                    <p class="text-[10px] text-slate-500">권장 ${cat.setRange[0]}~${cat.setRange[1]}세트</p>
                </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                <span class="text-base font-black text-white">${displayCount}<span class="text-[10px] text-slate-500 font-bold ml-0.5">세트</span></span>
                <span class="px-2.5 py-1 text-[10px] font-black rounded-full border shrink-0 ${meta.badgeClass}">${meta.label}</span>
                <span class="text-slate-600 text-lg shrink-0">›</span>
            </div>`;
        container.appendChild(row);
    });
}

export function setVolumeRangeMode(mode) {
    volumeRangeMode = mode;
    ['thisWeek', 'lastWeek', 'average'].forEach(m => {
        const btn = document.getElementById('chip-vol-' + m);
        if (btn) btn.className = m === mode
            ? 'flex-1 py-2.5 text-xs font-black rounded-lg bg-amber-500 text-slate-950 transition-all'
            : 'flex-1 py-2.5 text-xs font-bold rounded-lg bg-slate-900 border border-slate-800 text-slate-400 transition-all';
    });
    renderMuscleVolumeCard();
}

export function openMuscleGuideModal(key) {
    const cat = MUSCLE_CATEGORIES.find(c => c.key === key); if (!cat) return;
    document.getElementById('muscle-guide-title').innerText = `${cat.emoji} ${cat.label}`;
    document.getElementById('muscle-guide-sets').innerText = `${cat.setRange[0]}~${cat.setRange[1]} 세트 / 주`;
    document.getElementById('muscle-guide-reps').innerText = `${cat.repRange[0]}~${cat.repRange[1]} 회 / 세트`;
    document.getElementById('muscle-guide-rationale').innerText = cat.rationale;
    const imgEl = document.getElementById('muscle-guide-image');
    if (imgEl) { imgEl.src = cat.icon; imgEl.alt = cat.label; }
    const principlesBox = document.getElementById('muscle-guide-principles');
    if (principlesBox) {
        principlesBox.innerHTML = VOLUME_PRINCIPLES.map(p => `
            <div class="mb-3 last:mb-0">
                <p class="text-[11px] font-black text-amber-400 mb-1">${p.title}</p>
                <p class="text-[11px] text-slate-400 leading-relaxed">${p.body}</p>
            </div>`).join('');
    }
    // [세트수 상세 내역] 현재 카드의 기간 필터(이번 주/지난 주/평균) 기준으로 이 근육군에 실제로 세트를
    // 보탠 종목들을 세트 수 내림차순으로 보여준다 — 카드 숫자와 항상 같은 기준으로 계산되도록 동일한
    // computeWeeklySetCounts 규칙을 공유하는 getContributingExercises를 사용한다.
    const contribBox = document.getElementById('muscle-guide-contributions');
    if (contribBox) {
        const list = getContributingExercises(key, volumeRangeMode, state.workouts);
        if (list.length === 0) {
            contribBox.innerHTML = `<p class="text-[11px] text-slate-500">해당 기간에 기록된 세트가 없습니다.</p>`;
        } else {
            contribBox.innerHTML = list.map(item => `
                <div class="flex items-center justify-between gap-2 py-1 border-b border-slate-800/60 last:border-0">
                    <span class="text-[11px] text-slate-300 truncate pr-2">${item.name}</span>
                    <span class="text-[11px] text-amber-400 font-black shrink-0">${Number.isInteger(item.count) ? item.count : item.count.toFixed(1)}세트</span>
                </div>`).join('');
        }
    }
    const modal = document.getElementById('muscle-guide-modal');
    if (modal) { modal.classList.remove('hidden'); modal.classList.add('flex'); }
}

export function closeMuscleGuideModal() {
    const modal = document.getElementById('muscle-guide-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
}

export function renderWorkoutAnalysisCharts() {
    renderMuscleVolumeCard();
    const cvsBalance = document.getElementById('chart-workout-analysis');
    const cvsVolume = document.getElementById('chart-volume-trend');
    const cvsWeight = document.getElementById('chart-weight-trend');
    if(!cvsBalance) return;

    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 };
    let best1RMVal = 0; let best1RMEx = '-'; const exFreq = {};

    Object.values(state.workouts).forEach(dateObj => {
        if (dateObj.exercises) { dateObj.exercises.forEach(ex => {
            let pKey = '기타'; if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근';
            // [계산 일관성 수정] 완료 체크 안 된(아직 수행하지 않은) 세트까지 볼륨으로 세고 있었다 — 1RM/총
            // 볼륨/부위별 주간 세트수는 전부 done 세트만 인정하는데 이 레이더만 예외였던 불일치를 바로잡는다.
            // [넘버링 통합] "벤치프레스"와 "벤치프레스 (2)"를 서로 다른 종목으로 세지 않도록 기저 이름으로 집계한다.
            partsCount[pKey] += ex.sets ? ex.sets.filter(s => s.done).length : 0; const baseExName = stripNumberingSuffix(ex.name); exFreq[baseExName] = (exFreq[baseExName] || 0) + 1;
            ex.sets.forEach(s => { if(s.done) { const est1RM = s.weight * (1 + (s.reps / 30)); if(est1RM > best1RMVal) { best1RMVal = est1RM; best1RMEx = ex.name; } } });
        });}
    });

    let maxFreq = 0; let favEx = '-';
    Object.entries(exFreq).forEach(([name, count]) => { if(count > maxFreq) { maxFreq = count; favEx = name; } });

    document.getElementById('stat-favorite-ex').innerText = favEx !== '-' ? favEx : '기록 부족';
    document.getElementById('stat-best-1rm').innerText = best1RMEx !== '-' ? `${best1RMEx} (${best1RMVal.toFixed(1)}kg)` : '기록 부족';

    const activeDates = Object.keys(state.workouts).filter(d => (state.workouts[d].exercises && state.workouts[d].exercises.length > 0) || state.workouts[d].weight > 0).sort();
    const last7Days = activeDates.slice(-7); const labels = last7Days.map(d => d.slice(5).replace('-','/'));
    const volData = []; const weightData = [];

    last7Days.forEach(d => {
        const obj = state.workouts[d]; let dayVol = 0;
        if(obj.exercises) obj.exercises.forEach(e => e.sets.forEach(s => { if(s.done) dayVol += s.weight * s.reps; }));
        volData.push(dayVol); weightData.push(obj.weight || null);
    });

    setTimeout(() => {
        if(chartBalance) chartBalance.destroy();
        chartBalance = new Chart(cvsBalance.getContext('2d'), {
            type: 'radar', data: { labels: Object.keys(partsCount), datasets: [{ data: Object.values(partsCount), backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', borderWidth: 2, pointBackgroundColor: '#F59E0B' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94A3B8' }, ticks: { display: false } } } }
        });
        if(chartVolume) chartVolume.destroy();
        chartVolume = new Chart(cvsVolume.getContext('2d'), {
            type: 'bar', data: { labels: labels, datasets: [{ label: '총 볼륨(kg)', data: volData, backgroundColor: '#F59E0B', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 10} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 10} } } } }
        });
        if(chartWeight) chartWeight.destroy();
        chartWeight = new Chart(cvsWeight.getContext('2d'), {
            type: 'line', data: { labels: labels, datasets: [{ label: '체중(kg)', data: weightData, borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.1)', fill: true, tension: 0.3, pointBackgroundColor: '#0EA5E9', spanGaps: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 10} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 10} } } } }
        });
    }, 50);
}
