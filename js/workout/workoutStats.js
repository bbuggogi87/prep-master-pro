/**
 * 파일명: workoutStats.js
 * 역할: 입체분석 탭 — 부위별 세트 균형 레이더/볼륨 추이/체중 추이 차트 및 종합 통계 담당 모듈
 */

import { state } from '../core/store.js';

let chartBalance = null;
let chartVolume = null;
let chartWeight = null;

export function renderWorkoutAnalysisCharts() {
    const cvsBalance = document.getElementById('chart-workout-analysis');
    const cvsVolume = document.getElementById('chart-volume-trend');
    const cvsWeight = document.getElementById('chart-weight-trend');
    if(!cvsBalance) return;

    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 };
    let best1RMVal = 0; let best1RMEx = '-'; const exFreq = {};

    Object.values(state.workouts).forEach(dateObj => {
        if (dateObj.exercises) { dateObj.exercises.forEach(ex => {
            let pKey = '기타'; if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근';
            partsCount[pKey] += ex.sets ? ex.sets.length : 0; exFreq[ex.name] = (exFreq[ex.name] || 0) + 1;
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
