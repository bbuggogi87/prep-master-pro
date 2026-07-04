/**
 * 파일명: smartCalculator.js
 * 역할: 스마트 매크로 변환기 탭 — 기준 식품/중량 입력에 따른 동일 카테고리 등가 중량 계산 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSaveDebounced } from '../core/services.js';

export function initCalcDropdowns() {
    const cDrop = document.getElementById('calc-carb-src'); const pDrop = document.getElementById('calc-pro-src'); const fDrop = document.getElementById('calc-fat-src');
    if(!cDrop || !pDrop || !fDrop) return; cDrop.innerHTML = ''; pDrop.innerHTML = ''; fDrop.innerHTML = '';
    state.foodCategories['탄수화물'].forEach(f => cDrop.innerHTML += `<option value="${f}">${f}</option>`);
    state.foodCategories['단백질'].forEach(f => pDrop.innerHTML += `<option value="${f}">${f}</option>`);
    state.foodCategories['지방'].forEach(f => { if(state.foodDB[f].f > 0.1) fDrop.innerHTML += `<option value="${f}">${f}</option>`; });

    // [개선] 마지막으로 사용한 기준 식품/중량을 state.smartCalc 에서 복원 (없거나 삭제된 식품이면 기본값 사용)
    const sc = state.smartCalc || {};
    cDrop.value = sc.carb?.src || '백미'; if (!cDrop.value) cDrop.value = '백미';
    pDrop.value = sc.pro?.src || '닭가슴살(익힘)'; if (!pDrop.value) pDrop.value = '닭가슴살(익힘)';
    fDrop.value = sc.fat?.src || '아몬드'; if (!fDrop.value) fDrop.value = '아몬드';

    const cAmt = document.getElementById('calc-carb-amt'); const pAmt = document.getElementById('calc-pro-amt'); const fAmt = document.getElementById('calc-fat-amt');
    if (cAmt) cAmt.value = sc.carb?.amt ?? 130;
    if (pAmt) pAmt.value = sc.pro?.amt ?? 150;
    if (fAmt) fAmt.value = sc.fat?.amt ?? 15;
}

export function runSmartCalc(type) {
    const drop = document.getElementById(`calc-${type}-src`); if(!drop || !drop.value) return;
    let src = drop.value; let amt = parseFloat(document.getElementById(`calc-${type}-amt`).value) || 0; let targetMacro = 0; let resHtml = '';
    if(!state.foodDB[src]) return; // 안전 방어 절 주입

    // [개선] 스마트 변환기 조작 상태를 전역 state 에 동기화하여 새로고침/백업 후에도 유지되도록 함
    // [자동 저장 효율화] 중량 입력칸은 키 입력마다 호출되므로 저장을 디바운스한다(이전엔 매 키 입력마다
    // saveToLocal()로 전체 상태를 즉시 직렬화 — 디바운스 래퍼조차 거치지 않는 가장 심한 경우였다).
    if (state.smartCalc && state.smartCalc[type]) {
        state.smartCalc[type].src = src; state.smartCalc[type].amt = amt; triggerSaveDebounced();
    }

    if(type === 'carb') {
        targetMacro = amt * state.foodDB[src].c;
        state.foodCategories['탄수화물'].forEach(f => { if(f !== src && state.foodDB[f].c > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].c)}g</span></div>`; } });
    } else if(type === 'pro') {
        targetMacro = amt * state.foodDB[src].p;
        state.foodCategories['단백질'].forEach(f => { if(f !== src && state.foodDB[f].p > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].p)}g</span></div>`; } });
    } else if(type === 'fat') {
        targetMacro = amt * state.foodDB[src].f;
        state.foodCategories['지방'].forEach(f => { if(f !== src && state.foodDB[f].f > 0.1) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].f)}g</span></div>`; } });
    }
    document.getElementById(`calc-${type}-res`).innerHTML = resHtml;
}
