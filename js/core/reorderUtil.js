/**
 * 파일명: reorderUtil.js
 * 역할: 배열 순서 변경(위/아래/맨위/맨아래) 공용 순수 함수. 특정 도메인(운동/식단)에 의존하지 않으며,
 * js/workout/workoutJournal.js, js/workout/routineTemplates.js, js/diet/dietPlanner.js 가 모두 이 함수
 * 하나를 재사용해 "위/아래/맨위/맨아래" 재정렬 동작을 앱 전체에서 통일한다.
 */

/**
 * arr[index] 항목을 action 방향으로 이동시킨다(제자리 mutate).
 * @param {Array} arr - 재정렬할 배열
 * @param {number} index - 이동할 항목의 현재 인덱스
 * @param {number|'top'|'bottom'} action - -1(위로 한 칸)/1(아래로 한 칸)/'top'(맨 위로)/'bottom'(맨 아래로)
 * @returns {boolean} 실제로 이동했으면 true, 이동할 수 없는 위치(이미 맨 끝 등)면 false
 */
export function reorderArray(arr, index, action) {
    if (!Array.isArray(arr) || index < 0 || index >= arr.length) return false;
    let target;
    if (action === 'top') target = 0;
    else if (action === 'bottom') target = arr.length - 1;
    else target = index + action;

    if (target < 0 || target >= arr.length || target === index) return false;
    const [item] = arr.splice(index, 1);
    arr.splice(target, 0, item);
    return true;
}

/**
 * arr[from] 항목을 to 위치로 옮긴다(드래그앤드롭처럼 정확한 목표 인덱스가 이미 주어진 경우용).
 */
export function moveArrayItem(arr, from, to) {
    if (!Array.isArray(arr) || from < 0 || from >= arr.length || to < 0 || to >= arr.length || from === to) return false;
    const [item] = arr.splice(from, 1);
    arr.splice(to, 0, item);
    return true;
}
