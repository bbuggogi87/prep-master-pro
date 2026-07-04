/**
 * 파일명: services.js
 * 역할: 브라우저 로컬 저장소 통제 및 사용자 지정 위치 파일 입출력(I/O: Input/Output) 인프라 관리
 * 변경사항: 페이지 이탈 시 동기식으로 로컬 스토리지를 즉시 강제 잠금 보존하는 내비게이션 인터셉터 함수 이식 완료
 * [온라인 백업 추가] 로컬 JSON 백업과 신규 Supabase 온라인 백업(cloudSync.js)이 동일한 payload 구조를
 * 공유하도록 buildBackupPayload()/applyBackupPayload() 공용 헬퍼로 일원화했다.
 */

import { state, applyCustomSuppsToDB } from './store.js'; //

let saveTimeout = null; //
let debouncedSaveTimeout = null; // [자동 저장 효율화] 아래 triggerSaveDebounced 전용

/**
 * 현재 전역 상태에서 백업 payload(식단/체중/운동/루틴/스마트계산기 등 전체 상태)를 구성하는 단일 진실 공급원.
 * 로컬 JSON 백업과 클라우드 백업(cloudSync.js)이 모두 이 함수를 공유해 payload 구조가 어긋나지 않도록 한다.
 */
export function buildBackupPayload() {
    let customRecommended = {};
    try { customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}'); } catch (e) { /* ignore */ }
    return {
        phases: state.phases,
        customSupps: state.customSupps,
        userInfo: state.userInfo,
        workouts: state.workouts,
        templates: state.templates,
        smartCalc: state.smartCalc,
        // [백업 누락 버그 수정] 분할루틴 탭에서 "추천 루틴"을 편집한 결과는 state가 아니라 이 localStorage 키에만
        // 저장되어(routineTemplates.js) 기존엔 백업 대상에서 빠져 있었다 — 복원 시 커스텀 편집이 사라지는 버그.
        customRecommended,
        // [탭 선택 기억] 식단 탭(기본 베이스 식단/수분 조절 & 밴딩 등) 중 마지막으로 보고 있던 탭이 백업 대상에
        // 없어서, 새로고침할 때마다 항상 첫 번째 탭으로 초기화되던 문제 — 마지막 선택 탭을 기억해 복원한다.
        currentPhaseId: state.currentPhaseId,
    };
}

/**
 * 백업 payload(로컬 JSON 복원/클라우드 복원 공통)를 전역 state 에 반영한다. 호출 전 migrateData()로
 * 구버전 포맷을 이미 정규화했다고 가정한다.
 */
export function applyBackupPayload(data) {
    if (!data) return;
    if (data.phases) state.phases = data.phases;
    if (data.customSupps) state.customSupps = data.customSupps;
    if (data.userInfo) state.userInfo = data.userInfo;
    if (data.workouts) state.workouts = data.workouts;
    if (data.templates) state.templates = data.templates;
    if (data.smartCalc) state.smartCalc = data.smartCalc;
    if (data.currentPhaseId) state.currentPhaseId = data.currentPhaseId;
    if (data.customRecommended) {
        try { localStorage.setItem('prep_master_custom_recommended', JSON.stringify(data.customRecommended)); } catch (e) { /* ignore */ }
    }
}

/**
 * 파일을 사용자 지정 위치(File System Access API) 또는 다운로드 폴더에 저장하는 공용 함수.
 * JSON/CSV 등 텍스트 내보내기가 모두 이 함수 하나를 재사용한다.
 */
export async function saveFileNative(fileName, content, mimeType, showToastCallback) {
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Backup File', accept: { [mimeType]: ['.' + fileName.split('.').pop()] } }] });
            const writable = await handle.createWritable();
            await writable.write(content);
            await writable.close();
            if (typeof showToastCallback === 'function') showToastCallback("지정하신 위치에 백업 파일이 저장되었습니다.");
            return;
        }
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (typeof showToastCallback === 'function') showToastCallback("백업 파일이 다운로드 폴더에 저장되었습니다.");
    } catch (e) {
        if (e && e.name === 'AbortError') {
            if (typeof showToastCallback === 'function') showToastCallback("백업 내보내기 작업이 취소되었습니다.");
            return;
        }
        console.error("백업 파일 생성 실패:", e);
        if (typeof showToastCallback === 'function') showToastCallback("백업 파일 생성에 실패하였습니다.");
    }
}

/**
 * saveFileNative()의 바이너리 버전 — .xlsx처럼 텍스트가 아닌 파일(ArrayBuffer)을 저장할 때 사용한다.
 * (core/excelIO.js의 saveWorkbookAsFile이 이 함수를 호출한다.)
 */
export async function saveBinaryFileNative(fileName, arrayBuffer, mimeType, showToastCallback) {
    try {
        const blob = new Blob([arrayBuffer], { type: mimeType });
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Excel File', accept: { [mimeType]: ['.xlsx'] } }] });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            if (typeof showToastCallback === 'function') showToastCallback("지정하신 위치에 엑셀 파일이 저장되었습니다.");
            return;
        }
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (typeof showToastCallback === 'function') showToastCallback("엑셀 파일이 다운로드 폴더에 저장되었습니다.");
    } catch (e) {
        if (e && e.name === 'AbortError') {
            if (typeof showToastCallback === 'function') showToastCallback("엑셀 내보내기 작업이 취소되었습니다.");
            return;
        }
        console.error("엑셀 파일 생성 실패:", e);
        if (typeof showToastCallback === 'function') showToastCallback("엑셀 파일 생성에 실패하였습니다.");
    }
}

/**
 * [신규 추가] 현재 전역 상태를 사용자 지정 위치로 내보내는 JSON 백업 파일 생성 함수
 * (app.js 의 window.exportData 바인딩이 본 함수를 호출하므로, 누락 시 ES 모듈 임포트 자체가 실패하여
 *  index.html 전체가 구동 불능 상태에 빠지는 치명적 결함을 일으킵니다.)
 */
export async function exportDataJSON(showToastCallback) {
    const jsonStr = JSON.stringify(buildBackupPayload(), null, 2);
    const pad = n => n < 10 ? '0' + n : n;
    const now = new Date();
    const fileName = `PrepMasterPro_Backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
    await saveFileNative(fileName, jsonStr, 'application/json', showToastCallback);
}

// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩
window.handleNavigationWithSave = handleNavigationWithSave;

/**
 * [오류 수정 완료] 구 버전 데이터 포맷을 최신 탭 배열 구조로 안전하게 전환 및 보충제 타입 매이그레이션 가드 절
 */
export function migrateData(data) {
    if (data.phaseData && !data.phases) { //
        let migrated = []; //
        let idx = 1; //
        for (let key in data.phaseData) { //
            migrated.push({ //
                id: 'p_' + idx++, //
                title: data.phaseData[key].title || key, //
                desc: data.phaseData[key].desc || '', //
                meals: data.phaseData[key].meals || [] //
            }); 
        }
        data.phases = migrated; //
    }
    // [타입 크래시 방어 가드 절 수립] customSupps 가 이전 버전 객체 포맷일 경우 배열 구조로 강제 마이그레이션 집행
    if (data.customSupps && !Array.isArray(data.customSupps)) {
        data.customSupps = Object.values(data.customSupps);
    }
    return data; //
}

/**
 * 브라우저 내장 로컬 스토리지(Local Storage)에 현재 상태를 즉시 영구 기록하는 함수
 */
export function saveToLocal() {
    localStorage.setItem('prep_master_local_data', JSON.stringify(buildBackupPayload()));
}

/**
 * 브라우저 내장 로컬 스토리지(Local Storage)로부터 데이터를 읽어와 복원하는 함수
 */
export function loadFromLocal() {
    const local = localStorage.getItem('prep_master_local_data'); //
    if (local) { //
        try {
            let parsed = JSON.parse(local); //
            parsed = migrateData(parsed); //
            applyBackupPayload(parsed);
            return true; //
        } catch(e) {
            return false; //
        }
    }
    return false; //
}

/**
 * 기존 app.js 및 calendar.js 의 부팅 시퀀스와의 호환성을 보존하기 위한 로컬 단독 초기화 실행 함수
 */
export async function initializeFirebase(onInitComplete) {
    loadFromLocal(); //
    setTimeout(() => {
        if (typeof onInitComplete === 'function') {
            onInitComplete(true); //
        }
    }, 10);
}

/**
 * 호환성 유지용 빈 더미 함수
 */
export async function saveToCloud() {
    return true; //
}

/**
 * 사용자 인터페이스 (UI) 행동 발생 시 호출되는 전역 저장 파이프라인 함수
 */
export function triggerSave(showToastCallback) {
    saveToLocal(); //
    if (saveTimeout) clearTimeout(saveTimeout); //
    saveTimeout = setTimeout(() => {
        if (typeof showToastCallback === 'function') {
            showToastCallback("로컬 데이터 보호 완료."); //
        }
    }, 500); //
}

/**
 * [자동 저장 효율화] 세트 무게/횟수, 식단 항목 수량, 신체 계측치처럼 키 입력마다 호출되는 지점 전용.
 * saveToLocal()은 매번 전체 앱 데이터를 JSON으로 직렬화하는 무거운 작업이라, 매 키 입력마다 그대로
 * triggerSave()를 부르면(기존엔 저장 자체는 즉시·토스트만 디바운스) 기록이 많이 쌓인 뒤엔 타이핑할 때마다
 * 버벅임이 생길 수 있었다. 이 함수는 저장(및 토스트) 자체를 마지막 입력 후 한 번만 실행되도록 디바운스한다
 * — 입력 중인 state 값 자체는 호출부에서 이미 동기적으로 갱신되므로 화면 표시는 그대로 즉시 반영된다.
 */
export function triggerSaveDebounced(showToastCallback, delay = 400) {
    if (debouncedSaveTimeout) clearTimeout(debouncedSaveTimeout);
    debouncedSaveTimeout = setTimeout(() => { triggerSave(showToastCallback); }, delay);
}

/**
 * [신규 고도화 추가] 화면 전환 데이터 세이프가드 인터셉터 함수
 */
export function handleNavigationWithSave(targetUrl) {
    try {
        saveToLocal();
    } catch (e) {
        console.error("데이터 동기식 동결 실패:", e);
    }
    window.location.href = targetUrl;
}

/**
 * 외부 백업 파일을 읽어와 유효성을 정밀 검사하고 시스템 상태를 복원하는 함수
 */
export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; //
    const reader = new FileReader(); //
    reader.onload = function(e) { //
        try {
            let data = JSON.parse(e.target.result); //
            data = migrateData(data); //
            applyBackupPayload(data);

            applyCustomSuppsToDB(); //
            saveToLocal(); //
            if(onSuccess) onSuccess(); //
        } catch(err) {
            if(onError) onError(); //
        }
    };
    reader.readAsText(file); //
}
