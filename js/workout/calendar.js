/**
 * 파일명: calendar.js
 * 역할: calendar.html(운동 캘린더) 오케스트레이터
 * - 실제 도메인 로직은 calendarCore.js / restTimerEngine.js / workoutJournal.js / routineTemplates.js /
 *   exerciseLibrary.js / calendarView.js / workoutStats.js / calendarSettings.js 8개 모듈로 분리되어 있으며,
 *   이 파일은 그 모듈들을 불러와 화면 초기화·탭 전환·window 전역 바인딩만 담당합니다.
 */

import { state, recalculateAllWeightDeltas } from '../core/store.js';
import { initializeFirebase, triggerSave, saveToLocal, loadFromLocal } from '../core/services.js';

import { showToast } from './calendarCore.js';
import { stopRestTimer, extendRestTimer } from './restTimerEngine.js';
import {
    renderWorkoutList, addSet, deleteSet, adjSetVal, changeSetField, toggleSetComplete, deleteExercise,
    moveExerciseOrder, moveSetOrder, clearDailyExercises, openRestTimerModal, closeRestTimerModal,
    adjRestTimerSetting, saveRestTimerModal, triggerQuickInputFAB, closeQuickInputFABModal, saveQuickInputFABModal
} from './workoutJournal.js';
import {
    openLibraryModal, closeLibraryModal, changeLibraryPartFilter, changeLibraryTypeFilter,
    showFullExerciseName, runLibrarySearchFilter, injectLibraryToToday
} from './exerciseLibrary.js';
import {
    openTemplateManager, closeTemplateManager, applyTemplate, deleteTemplate, openSaveRoutineModal,
    closeSaveRoutineModal, confirmSaveRoutine, applyDirectPresetRoutine, renderPresetRoutineGrid,
    openTemplatePopupEditor, closeTemplatePopupEditor, addSetToEditor, deleteSetFromEditor,
    deleteExerciseFromEditor, changeEditorSetField, saveTemplatePopupEditorData, moveSetOrderInEditor
} from './routineTemplates.js';
import {
    renderCalendarGrid, moveMonth, selectWorkoutDate, updateHomeDashboardWidgets, updateDdayBadge,
    runPlateCalculate, setViewToToday
} from './calendarView.js';
import { renderWorkoutAnalysisCharts } from './workoutStats.js';
import {
    saveSystemSettings, loadSystemSettings, startGlobalAlarm, triggerSettingExport, triggerSettingImport,
    triggerClearAllWorkoutData, exportWorkoutToCSV
} from './calendarSettings.js';
import {
    signInWithGoogle, signOut, uploadBackupToCloud, downloadBackupFromCloud, renderCloudAuthUI, onAuthStateChange
} from '../core/cloudSync.js';

// ==========================================
// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩
// ==========================================
window.switchCalendarTab = switchCalendarTab;
window.runLibrarySearchFilter = runLibrarySearchFilter;
window.injectLibraryToToday = injectLibraryToToday;
window.triggerSettingExport = triggerSettingExport;
window.triggerSettingImport = triggerSettingImport;
window.triggerClearAllWorkoutData = triggerClearAllWorkoutData;
window.exportWorkoutToCSV = exportWorkoutToCSV;
window.openTemplateManager = openTemplateManager;
window.closeTemplateManager = closeTemplateManager;
window.applyTemplate = applyTemplate;
window.deleteTemplate = deleteTemplate;
window.openSaveRoutineModal = openSaveRoutineModal;
window.closeSaveRoutineModal = closeSaveRoutineModal;
window.confirmSaveRoutine = confirmSaveRoutine;
window.applyDirectPresetRoutine = applyDirectPresetRoutine;
window.moveMonth = moveMonth;
window.runPlateCalculate = runPlateCalculate;
window.stopRestTimer = stopRestTimer;
window.extendRestTimer = extendRestTimer;
window.startGlobalAlarm = startGlobalAlarm;
window.renderWorkoutList = renderWorkoutList;
window.renderCalendarGrid = renderCalendarGrid; // clearDailyExercises(workoutJournal.js)에서 교차 모듈 호출용
window.addSet = addSet;
window.deleteSet = deleteSet;
window.adjSetVal = adjSetVal;
window.changeSetField = changeSetField;
window.toggleSetComplete = toggleSetComplete;
window.deleteExercise = deleteExercise;
window.selectWorkoutDate = selectWorkoutDate;
window.openRestTimerModal = openRestTimerModal;
window.closeRestTimerModal = closeRestTimerModal;
window.saveRestTimerModal = saveRestTimerModal;
window.adjRestTimerSetting = adjRestTimerSetting;
window.openLibraryModal = openLibraryModal;
window.closeLibraryModal = closeLibraryModal;
window.saveSystemSettings = saveSystemSettings;
window.triggerQuickInputFAB = triggerQuickInputFAB;
window.closeQuickInputFABModal = closeQuickInputFABModal;
window.saveQuickInputFABModal = saveQuickInputFABModal;

// 편의 고도화 기능 윈도우 스코프 매핑
window.showFullExerciseName = showFullExerciseName;
window.changeLibraryPartFilter = changeLibraryPartFilter;
window.changeLibraryTypeFilter = changeLibraryTypeFilter;
window.openTemplatePopupEditor = openTemplatePopupEditor;
window.closeTemplatePopupEditor = closeTemplatePopupEditor;
window.addSetToEditor = addSetToEditor;
window.deleteSetFromEditor = deleteSetFromEditor;
window.deleteExerciseFromEditor = deleteExerciseFromEditor;
window.changeEditorSetField = changeEditorSetField;
window.saveTemplatePopupEditorData = saveTemplatePopupEditorData;
window.clearDailyExercises = clearDailyExercises;
window.moveSetOrder = moveSetOrder;
window.moveSetOrderInEditor = moveSetOrderInEditor;
window.triggerLibraryAddFromEditor = triggerLibraryAddFromEditor;
window.moveExerciseOrder = moveExerciseOrder;
window.initCalendarModule = initCalendarModule;

// Supabase 온라인 백업(Google 로그인/업로드/다운로드) 전역 바인딩
window.cloudSignIn = () => signInWithGoogle().catch(e => showToast('로그인 실패: ' + (e.message || e)));
window.cloudSignOut = () => signOut().then(() => { renderCloudAuthUI(); showToast('로그아웃 되었습니다.'); });
window.cloudUpload = () => uploadBackupToCloud((msg) => { showToast(msg); renderCloudAuthUI(); });
window.cloudDownload = () => downloadBackupFromCloud(
    () => { refreshStateFromStorage(); renderCloudAuthUI(); showToast('☁️ 온라인 백업을 복원했습니다.'); },
    (e) => showToast('복원 실패: ' + (e.message || e)),
    showToast
);

/**
 * 루틴 편집기의 "종목 추가" 버튼 → 종목 사전 모달 오픈. exerciseLibrary.js 와 routineTemplates.js 사이의
 * 순환 의존을 피하기 위해 두 모듈 모두를 아는 오케스트레이터에 둡니다.
 */
export function triggerLibraryAddFromEditor() {
    state.libraryTarget = 'editor'; openLibraryModal();
}

export function switchCalendarTab(tabId) {
    document.querySelectorAll('.calendar-pane').forEach(el => { el.classList.add('hidden'); el.classList.remove('block'); });
    const targetPane = document.getElementById('pane-' + tabId);
    if (targetPane) { targetPane.classList.remove('hidden'); targetPane.classList.add('block'); }

    const tabs = ['tab-home', 'tab-record', 'tab-routine', 'tab-alarm', 'tab-stats', 'tab-settings'];
    tabs.forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) {
            if (t === tabId) btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] active-tab-bar";
            else btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] text-slate-400 hover:bg-slate-800/40";
        }
    });

    if (tabId === 'tab-stats') renderWorkoutAnalysisCharts();
    if (tabId === 'tab-home') updateHomeDashboardWidgets();
    if (tabId === 'tab-routine') renderPresetRoutineGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function initCalendarModule() {
    setViewToToday();
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // [버그 수정] selectWorkoutDate 를 사용해 라벨/달력/일지뿐 아니라 오늘 날짜의 공복체중·체지방·골격근량
    // 입력값까지 최초 로드 시점에 곧바로 채워 넣습니다(기존에는 달력에서 날짜를 직접 클릭해야만 채워졌음).
    selectWorkoutDate(dateStr);
    loadSystemSettings();
    updateHomeDashboardWidgets();
    updateDdayBadge();
    renderCloudAuthUI();
}

function initMetricsChangeEvents() {
    const updateMetricsData = () => {
        const dStr = state.selectedDateStr; if (!dStr) return;
        state.workouts[dStr].weight = parseFloat(document.getElementById('input-daily-weight').value) || 0;
        state.workouts[dStr].bf = parseFloat(document.getElementById('input-daily-bf').value) || 0;
        state.workouts[dStr].smm = parseFloat(document.getElementById('input-daily-smm').value) || 0;

        recalculateAllWeightDeltas();

        triggerSave(showToast); renderCalendarGrid();
    };
    const weightEl = document.getElementById('input-daily-weight');
    const bfEl = document.getElementById('input-daily-bf');
    const smmEl = document.getElementById('input-daily-smm');

    if (weightEl) weightEl.oninput = updateMetricsData;
    if (bfEl) bfEl.oninput = updateMetricsData;
    if (smmEl) smmEl.oninput = updateMetricsData;
}

/**
 * 로컬 데이터 보호 및 화면 간(식단 ↔ 캘린더) 동기화 인프라
 * - beforeunload: 탭 닫기/새로고침/주소창 이동 등 어떤 경로로 페이지를 떠나더라도 즉시 동기식 저장을 강제합니다.
 * - visibilitychange: 다른 탭(예: 식단 & 체중 기록지)에서 저장한 내용을 이 화면으로 돌아왔을 때 자동으로
 *   다시 읽어와 반영합니다. 반대로 이 화면을 벗어날 때도 즉시 저장하여 두 화면이 항상 같은 로컬 데이터를 공유합니다.
 */
function refreshStateFromStorage() {
    loadFromLocal();
    if (state.selectedDateStr) selectWorkoutDate(state.selectedDateStr);
    else renderCalendarGrid();
    updateHomeDashboardWidgets();
    updateDdayBadge();
    loadSystemSettings();
    renderCloudAuthUI();
}

window.addEventListener('beforeunload', () => { saveToLocal(); });
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshStateFromStorage();
    else saveToLocal();
});

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status-workout');
    if (statusEl) { statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10B981]"></span> LOCAL TRAINER ACTIVE'; }
    initMetricsChangeEvents();

    // Google 로그인/로그아웃 등 인증 상태 변화 시 설정 탭 배지를 자동 갱신(최초 부팅 시 1회만 등록).
    try { onAuthStateChange(() => renderCloudAuthUI()); } catch (e) { console.error('클라우드 인증 리스너 등록 실패:', e); }

    initCalendarModule();
});
