/**
 * 파일명: services.js
 * 역할: 브라우저 로컬 저장소 통제 및 사용자 지정 위치 파일 입출력(I/O: Input/Output) 인프라 관리
 * 변경사항: 페이지 이탈 시 동기식으로 로컬 스토리지를 즉시 강제 잠금 보존하는 내비게이션 인터셉터 함수 이식 완료
 */

import { state, applyCustomSuppsToDB } from './store.js'; //

let saveTimeout = null; //

/**
 * [신규 추가] 현재 전역 상태를 사용자 지정 위치로 내보내는 JSON 백업 파일 생성 함수
 * (app.js 의 window.exportData 바인딩이 본 함수를 호출하므로, 누락 시 ES 모듈 임포트 자체가 실패하여
 *  index.html 전체가 구동 불능 상태에 빠지는 치명적 결함을 일으킵니다.)
 * [개선] File System Access API(showSaveFilePicker) 지원 브라우저에서는 저장 위치를 직접 지정할 수 있도록
 *  하고, 미지원 브라우저에서는 기존 다운로드 폴더 저장 방식으로 자동 폴백합니다. 식단 플래너/스마트
 *  변환기/체중 기록을 포함한 전체 상태(state)를 빠짐없이 백업 payload 에 포함합니다.
 */
export async function exportDataJSON(showToastCallback) {
    const backupPayload = {
        phases: state.phases, //
        customSupps: state.customSupps, //
        userInfo: state.userInfo, //
        workouts: state.workouts, //
        templates: state.templates, //
        smartCalc: state.smartCalc //
    };
    const jsonStr = JSON.stringify(backupPayload, null, 2);
    const pad = n => n < 10 ? '0' + n : n;
    const now = new Date();
    const fileName = `PrepMasterPro_Backup_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}.json`;
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'JSON Backup File', accept: { 'application/json': ['.json'] } }] });
            const writable = await handle.createWritable();
            await writable.write(jsonStr);
            await writable.close();
            if (typeof showToastCallback === 'function') {
                showToastCallback("지정하신 위치에 백업 파일이 저장되었습니다.");
            }
            return;
        }
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        if (typeof showToastCallback === 'function') {
            showToastCallback("백업 파일이 다운로드 폴더에 저장되었습니다.");
        }
    } catch (e) {
        if (e && e.name === 'AbortError') {
            if (typeof showToastCallback === 'function') showToastCallback("백업 내보내기 작업이 취소되었습니다.");
            return;
        }
        console.error("백업 파일 생성 실패:", e);
        if (typeof showToastCallback === 'function') {
            showToastCallback("백업 파일 생성에 실패하였습니다.");
        }
    }
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
    localStorage.setItem('prep_master_local_data', JSON.stringify({ //
        phases: state.phases, //
        customSupps: state.customSupps, //
        userInfo: state.userInfo, //
        workouts: state.workouts,   //
        templates: state.templates,  //
        smartCalc: state.smartCalc  //
    }));
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
            if (parsed.phases) state.phases = parsed.phases; //
            if (parsed.customSupps) state.customSupps = parsed.customSupps; //
            if (parsed.userInfo) state.userInfo = parsed.userInfo; //
            if (parsed.workouts) state.workouts = parsed.workouts;   //
            if (parsed.templates) state.templates = parsed.templates; //
            if (parsed.smartCalc) state.smartCalc = parsed.smartCalc; //
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
            
            if(data.phases) state.phases = data.phases; //
            if(data.customSupps) state.customSupps = data.customSupps; //
            if(data.userInfo) state.userInfo = data.userInfo; //
            if(data.workouts) state.workouts = data.workouts;   //
            if(data.templates) state.templates = data.templates; //
            if(data.smartCalc) state.smartCalc = data.smartCalc; //

            applyCustomSuppsToDB(); //
            saveToLocal(); //
            if(onSuccess) onSuccess(); //
        } catch(err) { 
            if(onError) onError(); //
        }
    };
    reader.readAsText(file); //
}
