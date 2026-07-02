/**
 * 파일명: reorderControls.js
 * 역할: "위/아래/맨위/맨아래" 버튼 마크업 생성 + SortableJS 드래그앤드롭 인스턴스 생성/파괴를 표준화하는
 * 공용 UI 유틸리티. reorderUtil.js(순수 배열 이동)와 짝을 이루며, 재정렬이 가능한 모든 목록
 * (운동일지의 종목·세트, 루틴 편집기의 종목·세트, 식단 타임라인의 끼니)이 이 모듈만 재사용하면
 * 마크업과 동작이 앱 전체에서 동일해진다.
 */

/**
 * ⏫▲▼⏬(맨위/위/아래/맨아래) 버튼 4개를 생성한다. 각 버튼은 window[fnName](...leadingArgs, idx, action)을
 * 호출하며, 맨 앞/맨 끝 항목에서는 해당 방향 버튼이 흐리게 비활성 표시된다.
 * @param {string} fnName - window 에 바인딩된 이동 함수명 (예: 'moveExerciseOrder')
 * @param {number} idx - 이 항목의 현재 인덱스
 * @param {number} len - 목록 전체 길이
 * @param {'xs'|'sm'} [size] - 버튼 크기(중첩된 세트 목록처럼 좁은 공간엔 'xs')
 * @param {Array<number>} [leadingArgs] - idx/action 앞에 고정으로 붙일 인자(예: 세트 목록이면 [exIdx])
 */
export function reorderButtonsHTML(fnName, idx, len, size = 'sm', leadingArgs = []) {
    const dim = size === 'xs' ? 'w-5 h-5 text-[8px]' : 'w-6 h-6 text-[9px]';
    const atFirst = idx === 0 ? 'opacity-30 pointer-events-none' : '';
    const atLast = idx === len - 1 ? 'opacity-30 pointer-events-none' : '';
    const prefix = leadingArgs.length ? leadingArgs.join(', ') + ', ' : '';
    const btn = (label, action, disabled, title) =>
        `<button type="button" onclick="event.stopPropagation(); window.${fnName}(${prefix}${idx}, ${typeof action === 'string' ? `'${action}'` : action})" class="${dim} flex items-center justify-center bg-slate-800 active:bg-slate-700 rounded text-slate-300 font-bold shrink-0 ${disabled}" title="${title}">${label}</button>`;
    return `<div class="flex gap-0.5 shrink-0">
        ${btn('⏫', 'top', atFirst, '맨 위로')}
        ${btn('▲', -1, atFirst, '위로')}
        ${btn('▼', 1, atLast, '아래로')}
        ${btn('⏬', 'bottom', atLast, '맨 아래로')}
    </div>`;
}

/**
 * 드래그 핸들 아이콘(↕) 마크업. handleClass 를 initSortableList()의 handle 옵션과 짝지어 사용한다.
 */
export function dragHandleHTML(handleClass, extraClass = '') {
    return `<span class="${handleClass} cursor-move select-none text-slate-500 hover:text-slate-300 active:text-amber-400 shrink-0 px-1 ${extraClass}" title="드래그로 순서 변경">⠿</span>`;
}

/**
 * SortableJS 인스턴스를 생성한다(이미 있으면 파괴 후 재생성). 목록이 매번 innerHTML로 다시 그려지는
 * 이 앱의 렌더 패턴에 맞춰, 호출자는 렌더 직후 매번 이 함수를 다시 호출하면 된다.
 * @param {HTMLElement} container
 * @param {{handle?: string, onReorder: (oldIndex: number, newIndex: number) => void}} opts
 * @returns {Object|null} Sortable 인스턴스(라이브러리 미로드 시 null)
 */
export function initSortableList(container, { handle, onReorder }) {
    if (!container || typeof Sortable === 'undefined') return null;
    return new Sortable(container, {
        handle,
        animation: 200,
        ghostClass: 'opacity-10',
        delay: 150,
        delayOnTouchOnly: true,
        forceFallback: false,
        onEnd(evt) {
            if (evt.oldIndex !== evt.newIndex) onReorder(evt.oldIndex, evt.newIndex);
        },
    });
}
