/**
 * 파일명: calendarCore.js
 * 역할: calendar.html 의 모든 도메인 모듈이 공통으로 참조하는 기반(base) 유틸리티 모음
 * (선택된 날짜의 운동 데이터 조회, 종목 수행 빈도 집계, 전역 로딩 레이어, 토스트, 초성 변환)
 */

import { state } from '../core/store.js';

export function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-32 right-5 z-[250] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => { t.className = "fixed bottom-32 right-5 z-[250] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500);
}

export function toggleGlobalLoader(show, text = "시스템 인프라 정밀 동기화 중...") {
    const loader = document.getElementById('global-loading-layer');
    const msg = document.getElementById('global-loading-text');
    if (!loader) return;
    if (show) {
        msg.innerText = text; loader.classList.remove('hidden'); loader.classList.add('flex');
    } else {
        loader.classList.add('hidden'); loader.classList.remove('flex');
    }
}

/**
 * 현재 선택된 날짜(state.selectedDateStr)의 운동 데이터를 조회하고, 없으면 빈 구조로 초기화해서 반환합니다.
 * 운동 일지/휴식 타이머/종목 사전/루틴 템플릿 등 거의 모든 도메인 모듈이 공유하는 핵심 접근 지점입니다.
 */
export function getWorkoutData() {
    let data = state.workouts[state.selectedDateStr];
    if (!data) {
        data = { weight: 0, bf: 0, smm: 0, exercises: [] };
        state.workouts[state.selectedDateStr] = data;
    }
    if (!data.exercises) data.exercises = [];
    return data;
}

export function getHangulChosung(str) {
    const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    let result = "";
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i) - 44032;
        if (code >= 0 && code <= 11172) result += cho[Math.floor(code / 588)];
        else result += str.charAt(i);
    }
    return result;
}

export function calculateExerciseFrequencies() {
    const counts = {};
    Object.values(state.workouts).forEach(w => {
        if (w && w.exercises) { w.exercises.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; }); }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}
