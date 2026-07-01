/**
 * 파일명: store.js
 * 역할: 전역 상태 관리 및 단일 진실 공급원 (SSOT: Single Source of Truth) 데이터 허브
 * 변경사항: 20가지 종합 건강 지표 확장 스키마 명세 정의 및 대시보드 동적 필터 상태 속성 주입 완료
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from '../diet/constants.js'; //

// 전역 상태 객체 정의
export const state = {
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)), //
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)), //
    currentPhaseId: 'p_1', //
    clipboardMeals: null, //
    editingMealState: null, //
    editingPhaseIsNew: false, //
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)), //
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)), //
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)), //
    pieChartInstance: null, //

    // 운동 일정 및 신체 계측 기록 상태 구조 (기존 기능 100% 유지)
    selectedDateStr: '', // 현재 선택된 날짜 키값 (형식: YYYY-MM-DD)
    
    /**
     * 날짜별 종합 데이터 저장소 (20가지 고정밀 지표 결합 스키마 확장)
     */
    workouts: {}, //       
    templates: [],       // 개인 맞춤 분할 루틴 프리셋 저장 배열
    
    // [신규 추가] 체중 기록 대시보드용 동적 매트릭스 필터 상태 값 ('all', 'weight', 'macros', 'condition')
    weightRecordFilter: 'all',

    // [신규 추가] 스마트 매크로 변환기의 마지막 선택 상태(기준 식품 + 중량) 영속화용 스키마
    smartCalc: {
        carb: { src: '백미', amt: 130 },
        pro: { src: '닭가슴살(익힘)', amt: 150 },
        fat: { src: '아몬드', amt: 15 }
    }
};

/**
 * 사용자 정의 보충제 데이터를 마스터 데이터베이스에 1g 당 수치로 환산 주입하는 함수
 */
export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = []; //
    state.customSupps.forEach(supp => {
        if(supp.weight > 0) { //
            state.foodDB[supp.name] = { //
                c: supp.carbs / supp.weight, //
                p: supp.protein / supp.weight, //
                f: supp.fat / supp.weight, //
                k: supp.kcal / supp.weight //
            };
            state.foodCategories['보충제'].push(supp.name); //
        }
    });
}

/**
 * 날짜순 공복 체중 기록을 바탕으로 전일 대비 체중 변화량(weightDelta)을 전체 재계산하는 함수
 * (app.js 와 calendar.js 양쪽에서 공유하는 순수 상태 연산이므로 SSOT 모듈에 위치시켜
 *  캘린더 페이지에서 app.js 없이도 동일하게 호출할 수 있도록 함)
 */
export function recalculateAllWeightDeltas() {
    const dates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0).sort((a, b) => new Date(a) - new Date(b));
    dates.forEach((dateStr, idx) => {
        if (idx === 0) state.workouts[dateStr].weightDelta = 0.0;
        else state.workouts[dateStr].weightDelta = state.workouts[dateStr].weight - state.workouts[dates[idx - 1]].weight;
    });
}
