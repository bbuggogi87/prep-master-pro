/**
 * 파일명: muscleVolumeGuide.js
 * 역할: "상급자 근비대" 주간 세트수 가이드(Schoenfeld/Israetel 메타분석 기준) 데이터 + 분류/집계 로직.
 * WORKOUT_DB의 10개 대분류(가슴/등/어깨/팔(이두)/팔(삼두)/하체(전면)/하체(후면)/복근/유산소/전신보조) 중
 * 유산소·전신보조를 제외한 8개를, 어깨(전면/측면·후면)와 하체(후면)(햄스트링&둔근/종아리)를 각각 세분화한
 * 10개 근육군을 기준으로 삼아, 종목명 단위로 정확히 어느 근육군에 해당하는지 분류한다.
 */

import { stripNumberingSuffix } from './calendarCore.js';

export const MUSCLE_CATEGORIES = [
    {
        key: 'chest', label: '가슴', emoji: '💪', icon: 'images/muscle-parts/chest.png', setRange: [16, 22], repRange: [6, 15],
        rationale: '상급자는 두꺼운 프레임 발달을 위해 고중량 다관절 운동(6~8회)으로 강한 물리적 장력을 주고, 고립 플라이 운동(12~15회)으로 대사적 스트레스를 보완하는 복합 접근이 필요합니다.',
    },
    {
        key: 'back', label: '등', emoji: '🔙', icon: 'images/muscle-parts/back.png', setRange: [18, 24], repRange: [8, 15],
        rationale: '너비(광배근)와 두께(승모근, 능형근)를 모두 확보해야 하므로 부위가 매우 넓습니다. 상급자는 견갑의 다양한 움직임(수평/수직 당기기)을 커버하기 위해 전체 부위 중 가장 많은 볼륨을 수용할 수 있습니다.',
    },
    {
        key: 'quads', label: '대퇴사두근', emoji: '🦵', icon: 'images/muscle-parts/legs.png', setRange: [16, 22], repRange: [8, 20],
        rationale: '하체의 전면을 담당하는 거대한 대근육군입니다. 고중량 스쿼트뿐만 아니라 레그 익스텐션, 해킹 스쿼트 등을 활용한 고반복(15~20회) 대사 스트레스 훈련 시 근비대 신호 촉진 효과가 매우 뛰어납니다.',
    },
    {
        key: 'hamsGlutes', label: '햄스트링 & 둔근', emoji: '🍑', icon: 'images/muscle-parts/legs.png', setRange: [12, 18], repRange: [6, 12],
        rationale: '고관절 신전 기전(데드리프트류)을 담당하며 속근(Type II) 섬유 비율이 상대적으로 높습니다. 과도한 고반복보다는 6~12회의 중중량~고중량 하드 세트가 근섬유 동원에 훨씬 효과적입니다.',
    },
    {
        key: 'sideRearDelts', label: '어깨 측면 및 후면', emoji: '🎯', icon: 'images/muscle-parts/shoulders.png', setRange: [16, 26], repRange: [10, 20],
        rationale: "클래식 피지크의 핵심인 'V-테이퍼' 체형을 위해 가장 중요한 부위입니다. 관절 부담이 적은 단일 관절 고립 운동 위주로 구성되며, 피로 회복이 매우 빨라 상급자의 경우 높은 주당 볼륨을 소화해야 성장이 지속됩니다.",
    },
    {
        key: 'frontDelts', label: '어깨 전면', emoji: '🎯', icon: 'images/muscle-parts/shoulders.png', setRange: [6, 12], repRange: [6, 12],
        rationale: '무거운 가슴 프레스나 오버헤드 프레스 동작 시 전면 삼각근이 강력한 협응근으로 참여합니다. 상급자일수록 오버트레이닝과 회복 실패를 막기 위해 단독 전면 고립 운동의 볼륨은 낮게 제한하는 것이 현명합니다.',
    },
    {
        key: 'biceps', label: '상완이두근', emoji: '💪', icon: 'images/muscle-parts/biceps.png', setRange: [12, 20], repRange: [8, 15],
        rationale: '등 운동(당기기) 시 간접적인 자극을 받지만, 상급자 수준에서 한 단계 더 높은 피크를 만들려면 주당 12세트 이상의 직접적인 고립 컬 운동을 통해 확실한 타겟팅 볼륨을 쌓아야 합니다.',
    },
    {
        key: 'triceps', label: '상완삼두근', emoji: '💪', icon: 'images/muscle-parts/triceps.png', setRange: [10, 18], repRange: [8, 15],
        rationale: '가슴 및 어깨 프레스 운동 시 삼두근 장두와 외측두가 이미 많은 피로를 겪습니다. 간접 볼륨을 고려하여 주당 하드 세트수를 조절하되, 장두 발달을 위한 오버헤드 익스텐션 종류를 반드시 포함해야 합니다.',
    },
    {
        key: 'calves', label: '종아리', emoji: '🦶', icon: 'images/muscle-parts/calves.png', setRange: [12, 20], repRange: [10, 20],
        rationale: '비복근과 가자미근은 일상적인 보행으로 인해 지근(Type I) 섬유 비중이 높습니다. 단순 중량 장력보다는 최대 가동범위에서의 완전한 수축과 이완을 유지하며 고반복으로 지치게 만들어야 성장을 유도할 수 있습니다.',
    },
    {
        key: 'abs', label: '복근', emoji: '🔥', icon: 'images/muscle-parts/abs.png', setRange: [12, 20], repRange: [12, 25],
        rationale: '복근은 회복 속도가 매우 빨라 주당 여러 세션에 걸쳐 자주 자극해도 무리가 없는 근육군입니다. 상급자는 굴곡(크런치류)뿐 아니라 항신전(플랭크류)·회전(우드초퍼/트위스트) 등 다면적 자극을 함께 구성해야 하며, 하중 저항이 어려운 맨몸 동작이 많은 만큼 고반복(15~25회)까지 끌어올려 확실한 피로도를 유도하는 것이 효과적입니다.',
    },
];

export const VOLUME_PRINCIPLES = [
    {
        title: '1. 유효 하드 세트의 엄격한 기준 설정',
        body: '상급자에게 웜업 세트는 볼륨 계산에서 철저히 제외됩니다. 모든 추천 세트는 RM(최대 반복 횟수)에 근접한 강도로 수행되어야 합니다. 세트 종료 시 RIR(예비 반복 횟수) 1~2회 또는 RPE(운동 자각도) 8.5~9.5 범주에 드는 고강도 하드 세트만 주당 볼륨으로 인정합니다. (이 앱에서는 "완료 체크"된 세트를 하드 세트로 집계합니다.)',
    },
    {
        title: '2. 세션 분할을 통한 정크 볼륨 방지',
        body: '한 부위를 하루에 10세트 이상 과도하게 밀어붙이면 후반부 세트는 피로만 낳는 정크 볼륨이 됩니다. 가슴, 등, 하체 같은 대근육은 주당 총 볼륨을 2~3회에 걸쳐 세션당 6~8세트씩 나누어 수행하는 빈도 위주의 분할 루틴이 생리학적으로 훨씬 유리합니다.',
    },
    {
        title: '3. 간접 참여 볼륨(Fractional Sets)의 계산',
        body: '모든 다관절 복합 운동은 보조근의 볼륨을 공유합니다. 주동근 운동 1세트당 관여하는 보조근은 약 0.5세트의 하드 세트를 수행한 것으로 계산합니다. 예) 벤치 프레스 4세트 = 가슴 4세트 + 상완삼두근 2세트 + 어깨 전면 2세트. (이 앱의 자동 집계는 주동근 기준 직접 볼륨만 계산하며, 간접 볼륨은 이 원칙을 참고해 직접 가늠해 보시기 바랍니다.)',
    },
];

// part(WORKOUT_DB 대분류)별 1:1 매핑되는 항목의 기본값. 세부 분류가 필요 없는 부위는 여기서 바로 끝난다.
const PART_DEFAULT = {
    '가슴': 'chest',
    '등': 'back',
    '팔(이두)': 'biceps',
    '팔(삼두)': 'triceps',
    '하체(전면)': 'quads',
    '복근': 'abs',
};

// 어깨: 전면(Anterior) vs 측면·후면(Lateral & Rear)으로 종목명 단위 분류. 목록에 없는 어깨 종목은
// 측면·후면(더 큰 범주)으로 기본 처리한다.
const SHOULDER_FRONT = new Set([
    '오버헤드 바벨 프레스', '덤벨 숄더 프레스', '아놀드 프레스', '프론트 레이즈', '케틀벨 프레스',
    '플레이트 프론트 레이즈', '케이블 프론트 레이즈', '숄더 프레스 머신', '스미스 프레스',
    '핸드스탠드 푸시업', '파이크 푸시업',
]);

// 하체(후면): 종아리(Calves) 목록에 없는 하체(후면) 종목은 햄스트링 & 둔근으로 기본 처리한다.
const CALF_EXERCISES = new Set(['스탠딩 카프 레이즈', '시티드 카프 레이즈']);

/**
 * 일지에 기록된 (부위, 종목명)을 10개 근육군 카테고리 key로 변환한다.
 * [버그 수정] 동일 종목을 중복 추가하면 "오버헤드 바벨 프레스 (2)"처럼 넘버링이 붙는데, 이 넘버링이 붙은
 * 이름은 SHOULDER_FRONT/CALF_EXERCISES Set에 정확히 일치하지 않아 항상 기본 분류(측면·후면/햄스트링)로
 * 잘못 빠지고 있었다 — 비교 전에 넘버링을 제거한 기저 이름으로 정규화한다.
 * @returns {string|null} MUSCLE_CATEGORIES의 key, 또는 이 가이드 대상이 아니면 null(유산소/전신보조 등)
 */
export function classifyExercise(part, name) {
    const baseName = stripNumberingSuffix(name);
    if (part === '어깨') return SHOULDER_FRONT.has(baseName) ? 'frontDelts' : 'sideRearDelts';
    if (part === '하체(후면)') return CALF_EXERCISES.has(baseName) ? 'calves' : 'hamsGlutes';
    return PART_DEFAULT[part] || null;
}

/** 주어진 날짜가 속한 주(월요일 시작)의 [월요일, 일요일] Date 쌍을 반환한다. */
function getWeekRange(referenceDate) {
    const d = new Date(referenceDate);
    const day = d.getDay(); // 0=일 ... 6=토
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(d); monday.setDate(d.getDate() + diffToMonday); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    return { monday, sunday };
}

function dateStrInRange(dateStr, monday, sunday) {
    const t = new Date(dateStr + 'T12:00:00').getTime(); // 정오 기준으로 타임존 경계 오차 방지
    return t >= monday.getTime() && t <= sunday.getTime();
}

/** 빈 카테고리별 세트 카운트 맵 생성 */
function emptyCounts() {
    const counts = {}; MUSCLE_CATEGORIES.forEach(c => { counts[c.key] = 0; }); return counts;
}

/** state.workouts에서 [monday, sunday] 구간의 완료된(done) 세트만 카테고리별로 합산한다. */
function countSetsInRange(workouts, monday, sunday) {
    const counts = emptyCounts();
    Object.entries(workouts).forEach(([dateStr, data]) => {
        if (!data || !data.exercises || !dateStrInRange(dateStr, monday, sunday)) return;
        data.exercises.forEach(ex => {
            const key = classifyExercise(ex.part, ex.name);
            if (!key) return;
            const doneCount = (ex.sets || []).filter(s => s.done).length;
            counts[key] += doneCount;
        });
    });
    return counts;
}

/**
 * @param {'thisWeek'|'lastWeek'|'average'} range
 * @param {Object} workouts - state.workouts
 * @param {number} [averageWeeks=4] - '평균' 선택 시 평균 낼 최근 완결 주(월~일) 수
 */
export function computeWeeklySetCounts(range, workouts, averageWeeks = 4) {
    const today = new Date();
    if (range === 'thisWeek') {
        const { monday, sunday } = getWeekRange(today);
        return countSetsInRange(workouts, monday, sunday);
    }
    if (range === 'lastWeek') {
        const lastWeekRef = new Date(today); lastWeekRef.setDate(today.getDate() - 7);
        const { monday, sunday } = getWeekRange(lastWeekRef);
        return countSetsInRange(workouts, monday, sunday);
    }
    // average: 이번 주를 제외한 최근 N개의 "완결된" 월~일 주를 평균
    const totals = emptyCounts();
    for (let i = 1; i <= averageWeeks; i++) {
        const ref = new Date(today); ref.setDate(today.getDate() - 7 * i);
        const { monday, sunday } = getWeekRange(ref);
        const weekCounts = countSetsInRange(workouts, monday, sunday);
        MUSCLE_CATEGORIES.forEach(c => { totals[c.key] += weekCounts[c.key]; });
    }
    const avg = emptyCounts();
    MUSCLE_CATEGORIES.forEach(c => { avg[c.key] = totals[c.key] / averageWeeks; });
    return avg;
}

/** @returns {'low'|'ok'|'high'} */
export function classifyStatus(count, [min, max]) {
    if (count < min) return 'low';
    if (count > max) return 'high';
    return 'ok';
}

/**
 * [상세 내역] 특정 근육군(key)의 세트 수 집계에 실제로 기여한 종목들을, 넘버링을 제거한 기저 이름 기준으로
 * 합산해 세트 수 내림차순으로 반환한다. computeWeeklySetCounts와 동일한 날짜 범위 규칙을 사용해, 분석
 * 카드에 표시된 숫자와 상세 팝업의 "어떤 종목에서 더해졌는지" 내역이 항상 일치하도록 한다.
 * @param {string} key - MUSCLE_CATEGORIES의 key
 * @param {'thisWeek'|'lastWeek'|'average'} range
 * @param {Object} workouts - state.workouts
 * @param {number} [averageWeeks=4]
 * @returns {Array<{name:string, count:number}>}
 */
export function getContributingExercises(key, range, workouts, averageWeeks = 4) {
    const today = new Date();
    let weekRanges;
    if (range === 'thisWeek') {
        weekRanges = [getWeekRange(today)];
    } else if (range === 'lastWeek') {
        const ref = new Date(today); ref.setDate(today.getDate() - 7);
        weekRanges = [getWeekRange(ref)];
    } else {
        weekRanges = [];
        for (let i = 1; i <= averageWeeks; i++) {
            const ref = new Date(today); ref.setDate(today.getDate() - 7 * i);
            weekRanges.push(getWeekRange(ref));
        }
    }

    const totals = {}; // baseName -> 합산 세트 수
    Object.entries(workouts).forEach(([dateStr, data]) => {
        if (!data || !data.exercises) return;
        const inRange = weekRanges.some(({ monday, sunday }) => dateStrInRange(dateStr, monday, sunday));
        if (!inRange) return;
        data.exercises.forEach(ex => {
            if (classifyExercise(ex.part, ex.name) !== key) return;
            const doneCount = (ex.sets || []).filter(s => s.done).length;
            if (doneCount === 0) return;
            const baseName = stripNumberingSuffix(ex.name);
            totals[baseName] = (totals[baseName] || 0) + doneCount;
        });
    });

    const divisor = range === 'average' ? averageWeeks : 1;
    return Object.entries(totals)
        .map(([name, count]) => ({ name, count: count / divisor }))
        .sort((a, b) => b.count - a.count);
}

export const STATUS_META = {
    low: { label: '부족', textClass: 'text-rose-400', badgeClass: 'bg-rose-500/10 border-rose-500/30 text-rose-400' },
    ok: { label: '적정', textClass: 'text-emerald-400', badgeClass: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' },
    high: { label: '초과', textClass: 'text-amber-400', badgeClass: 'bg-amber-500/10 border-amber-500/30 text-amber-400' },
};
