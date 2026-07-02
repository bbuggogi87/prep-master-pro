/**
 * 파일명: app.js
 * 역할: index.html(식단 플래너·스마트 변환기·환경설정·체중 기록지) 오케스트레이터
 * - 실제 도메인 로직은 uiChrome.js / dietPlanner.js / smartCalculator.js / profileSettings.js / weightRecord.js
 *   5개 모듈로 분리되어 있으며, 이 파일은 그 모듈들을 불러와 화면 초기화·탭 전환·window 전역 바인딩만 담당합니다.
 */

import { state, applyCustomSuppsToDB } from '../core/store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON, saveToLocal, loadFromLocal } from '../core/services.js';

import { showToast, applyMacroBarVisibility, closeMacroBar, showMacroBar, initMacroBarState, initScrollChromeGuards } from './uiChrome.js';
import {
    renderPhaseTabs, adjAmt, loadPhase, toggleMealWorkout, openPhaseModal, closePhaseModal, savePhaseModal,
    deletePhase, copyPhase, pastePhase, openEditMealModal, closeEditMealModal, saveEditMealModal, cycleColor,
    toggleCollapse, updateMealField, updateItemName, updateItemAmount, deleteItem, addItem, deleteMeal, calculateMacros,
    moveMealOrder
} from './dietPlanner.js';
import { initCalcDropdowns, runSmartCalc } from './smartCalculator.js';
import {
    updateProfileDisplays, openProfileModal, closeProfileModal, saveProfileModal, openMacroModal, closeMacroModal,
    addCustomSuppForm, removeCustomSupp, saveMacroModal
} from './profileSettings.js';
import {
    openRecordModal, closeRecordModal, handleRecordDateChange, setBowelField, toggleQuickNoteChip,
    pullDietaryMacrosFromPlanner, saveWeightRecordData, deleteWeightRecordData, toggleAccordionCard,
    setMatrixFilter, updateWeightTrendChart, exportWeightRecordsToCSV, importWeightRecordsFromCSV, renderWeightRecordList,
    setChartRange, renderWeightCalendar, moveWeightCalendarMonth, selectWeightCalendarDate,
    showMoreTimeline, closeMoreTimeline
} from './weightRecord.js';
import {
    signInWithGoogle, signOut, uploadBackupToCloud, downloadBackupFromCloud, renderCloudAuthUI, onAuthStateChange
} from '../core/cloudSync.js';

// ==========================================
// 브라우저 전역 윈도우 (window) 네임스페이스 명시적 바인딩
// ==========================================
window.showToast = showToast;
window.switchMainTab = switchMainTab;
window.loadPhase = loadPhase;
window.cycleColor = cycleColor;
window.toggleCollapse = toggleCollapse;
window.updateMealField = updateMealField;
window.toggleMealWorkout = toggleMealWorkout;
window.updateItemName = updateItemName;
window.updateItemAmount = updateItemAmount;
window.adjAmt = adjAmt;
window.addItem = addItem;
window.deleteItem = deleteItem;
window.moveMealOrder = moveMealOrder;
window.deleteMeal = deleteMeal;
window.openPhaseModal = openPhaseModal;
window.closePhaseModal = closePhaseModal;
window.savePhaseModal = savePhaseModal;
window.deletePhase = deletePhase;
window.copyPhase = copyPhase;
window.pastePhase = pastePhase;
window.openEditMealModal = openEditMealModal;
window.closeEditMealModal = closeEditMealModal;
window.saveEditMealModal = saveEditMealModal;
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfileModal = saveProfileModal;
window.openMacroModal = openMacroModal;
window.closeMacroModal = closeMacroModal;
window.saveMacroModal = saveMacroModal;
window.addCustomSuppForm = addCustomSuppForm;
window.removeCustomSupp = removeCustomSupp;
window.runSmartCalc = runSmartCalc;
window.exportData = () => exportDataJSON(showToast);
window.importData = (e) => importDataJSON(e.target.files[0], () => { refreshView(); showToast("동기화 복원 성공합니다."); }, () => showToast("비정상 백업 파일입니다."));

// 체중 기록 고도화 모듈 전역 스코프 바인딩 명세
window.openRecordModal = openRecordModal;
window.closeRecordModal = closeRecordModal;
window.handleRecordDateChange = handleRecordDateChange;
window.setBowelField = setBowelField;
window.toggleQuickNoteChip = toggleQuickNoteChip;
window.pullDietaryMacrosFromPlanner = pullDietaryMacrosFromPlanner;
window.saveWeightRecordData = saveWeightRecordData;
window.deleteWeightRecordData = deleteWeightRecordData;
window.toggleAccordionCard = toggleAccordionCard;
window.setMatrixFilter = setMatrixFilter;
window.updateWeightTrendChart = updateWeightTrendChart;
window.exportWeightRecordsToCSV = exportWeightRecordsToCSV;
window.importWeightRecordsFromCSV = importWeightRecordsFromCSV;
window.setChartRange = setChartRange;
window.moveWeightCalendarMonth = moveWeightCalendarMonth;
window.selectWeightCalendarDate = selectWeightCalendarDate;
window.showMoreTimeline = showMoreTimeline;
window.closeMoreTimeline = closeMoreTimeline;

// 하단 매크로 정보 바 닫기/하단고정 기능 전역 바인딩
window.closeMacroBar = closeMacroBar;
window.showMacroBar = showMacroBar;

// Supabase 온라인 백업(Google 로그인/업로드/다운로드) 전역 바인딩
window.cloudSignIn = () => signInWithGoogle().catch(e => showToast('로그인 실패: ' + (e.message || e)));
window.cloudSignOut = () => signOut().then(() => { renderCloudAuthUI(); showToast('로그아웃 되었습니다.'); });
window.cloudUpload = () => uploadBackupToCloud((msg) => { showToast(msg); renderCloudAuthUI(); });
window.cloudDownload = () => downloadBackupFromCloud(
    () => { refreshView(); renderCloudAuthUI(); showToast('☁️ 온라인 백업을 복원했습니다.'); },
    (e) => showToast('복원 실패: ' + (e.message || e)),
    showToast
);

export function switchMainTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.classList.add('hidden'); el.classList.remove('block');
    });

    const targetEl = document.getElementById(tabId);
    if(targetEl) { targetEl.classList.remove('hidden'); targetEl.classList.add('block'); }

    // 상단 인라인 메뉴바와 스크롤 시 노출되는 플로팅 메뉴바의 활성 탭 상태를 data-tab-btn 속성 기준으로 동시 동기화
    document.querySelectorAll('[data-tab-btn]').forEach(btn => {
        if (btn.dataset.tabBtn === tabId) btn.classList.add('active-tab');
        else btn.classList.remove('active-tab');
    });

    applyMacroBarVisibility();

    if(tabId === 'tab-analysis') calculateMacros();
    if(tabId === 'tab-weight-record') {
        renderWeightRecordList();
        renderWeightCalendar();
        setMatrixFilter(state.weightRecordFilter || 'all');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 현재 state 를 기준으로 화면 전체를 다시 그리는 함수. 프로필 저장/백업 복원/다른 탭에서 돌아왔을 때(visibilitychange)
 * 등 "이미 부팅된 상태에서 다시 그려야 하는" 모든 경우에 재사용됩니다. 리스너 등록이나 setInterval 생성처럼
 * "최초 1회만 실행해야 하는" 작업은 여기 포함하지 않습니다(중복 등록 방지).
 */
function refreshView() {
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!state.selectedDateStr) state.selectedDateStr = todayStr;

    updateProfileDisplays();
    applyCustomSuppsToDB();
    initCalcDropdowns();

    if (state.phases.length > 0) loadPhase(state.currentPhaseId || state.phases[0].id);

    applyMacroBarVisibility();
    runSmartCalc('carb'); runSmartCalc('pro'); runSmartCalc('fat');

    if (document.getElementById('tab-weight-record')?.classList.contains('block')) {
        renderWeightRecordList();
        renderWeightCalendar();
        setMatrixFilter(state.weightRecordFilter || 'all');
    }

    renderCloudAuthUI();
}

function refreshFromStorage() { loadFromLocal(); refreshView(); }

// ==========================================
// 로컬 데이터 보호 및 화면 간(캘린더 ↔ 식단) 동기화 인프라
// - beforeunload: 탭 닫기/새로고침/주소창 이동 등 어떤 경로로 페이지를 떠나더라도 즉시 동기식 저장을 강제합니다.
// - visibilitychange: 다른 탭(예: 운동 캘린더)에서 저장한 내용을 이 화면으로 돌아왔을 때 자동으로 다시 읽어와
//   반영합니다. 반대로 이 화면을 벗어날 때도 즉시 저장하여 두 화면이 항상 같은 로컬 데이터를 공유하도록 합니다.
// ==========================================
window.addEventListener('beforeunload', () => { saveToLocal(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshFromStorage();
    else saveToLocal();
});

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status');
    if(statusEl) statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10B981]"></span> LOCAL AUTOSAVE ACTIVE';

    // [버그 수정] 리스너 등록과 자동저장 인터벌은 최초 부팅 시 단 1회만 실행합니다.
    // (기존에는 프로필 저장/백업 복원마다 finishInit() 이 반복 호출되어 setInterval 과
    //  scroll/resize 리스너가 계속 중복 등록되는 결함이 있었습니다.)
    initScrollChromeGuards();
    initMacroBarState();
    setInterval(() => { saveToLocal(); }, 60000);

    // Google 로그인/로그아웃 등 인증 상태 변화 시 설정 탭 배지를 자동 갱신(최초 부팅 시 1회만 등록).
    try { onAuthStateChange(() => renderCloudAuthUI()); } catch (e) { console.error('클라우드 인증 리스너 등록 실패:', e); }

    refreshView();
});
