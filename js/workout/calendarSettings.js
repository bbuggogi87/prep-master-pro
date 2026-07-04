/**
 * 파일명: calendarSettings.js
 * 역할: 환경설정 탭(전역 휴식/알람 기본값, 로컬 백업 관리)과 수동알람 탭 담당 모듈
 */

import { state } from '../core/store.js';
import { triggerSave, saveToLocal, importDataJSON, buildBackupPayload } from '../core/services.js';
import { showToast } from './calendarCore.js';
import { startTimerLogic } from './restTimerEngine.js';

export function saveSystemSettings() {
    if(!state.userInfo) state.userInfo = {};
    const setRest = document.getElementById('setting-default-rest');
    const setSound = document.getElementById('setting-default-sound');
    const setInt = document.getElementById('setting-default-interval');
    const setRepeat = document.getElementById('setting-default-repeat');
    const setVibration = document.getElementById('setting-default-vibration');
    const alarmSound = document.getElementById('alarm-sound-select');
    const alarmInt = document.getElementById('alarm-interval-select');
    const alarmRepeat = document.getElementById('alarm-repeat-select');
    const alarmVibration = document.getElementById('alarm-vibration-toggle');

    if (setRest) state.userInfo.defaultRestTime = parseInt(setRest.value) || 90;

    // [버그수정] 알람음은 반드시 "현재 보고 있는 탭"의 선택값을 저장해야 한다. 이전에는 이 값이
    // 항상 환경설정 탭의 select만 읽어서, 수동 알람 탭에서 알람음을 바꿔도 저장되지 않았다.
    const onAlarmTab = document.getElementById('pane-tab-alarm') && !document.getElementById('pane-tab-alarm').classList.contains('hidden');
    if (onAlarmTab) {
        if (alarmSound) state.userInfo.defaultAlarmSound = alarmSound.value || '1';
        if (alarmInt) state.userInfo.alarmInterval = parseInt(alarmInt.value) || 1000;
        if (alarmRepeat) state.userInfo.alarmRepeatCount = alarmRepeat.value;
        if (alarmVibration) state.userInfo.vibrationEnabled = alarmVibration.checked;
    } else {
        if (setSound) state.userInfo.defaultAlarmSound = setSound.value || '1';
        if (setInt) state.userInfo.alarmInterval = parseInt(setInt.value) || 1000;
        if (setRepeat) state.userInfo.alarmRepeatCount = setRepeat.value;
        if (setVibration) state.userInfo.vibrationEnabled = setVibration.checked;
    }
    triggerSave(showToast); loadSystemSettings();
}

export function loadSystemSettings() {
    const dRest = state.userInfo?.defaultRestTime || 90;
    const dSound = state.userInfo?.defaultAlarmSound || '1';
    const dInt = state.userInfo?.alarmInterval || 1000;
    const dRepeat = state.userInfo?.alarmRepeatCount || 'infinite';
    const dVibration = state.userInfo?.vibrationEnabled !== false; // 기본값 켜짐

    const restEl = document.getElementById('setting-default-rest');
    const soundEl = document.getElementById('setting-default-sound');
    const intEl = document.getElementById('setting-default-interval');
    const repeatEl = document.getElementById('setting-default-repeat');
    const vibrationEl = document.getElementById('setting-default-vibration');
    const alarmIntEl = document.getElementById('alarm-interval-select');
    const alarmSoundEl = document.getElementById('alarm-sound-select');
    const alarmRepeatEl = document.getElementById('alarm-repeat-select');
    const alarmVibrationEl = document.getElementById('alarm-vibration-toggle');

    if(restEl) restEl.value = dRest;
    if(soundEl) soundEl.value = dSound;
    if(intEl) intEl.value = dInt;
    if(repeatEl) repeatEl.value = dRepeat;
    if(vibrationEl) vibrationEl.checked = dVibration;
    if(alarmIntEl) alarmIntEl.value = dInt;
    if(alarmSoundEl) alarmSoundEl.value = dSound;
    if(alarmRepeatEl) alarmRepeatEl.value = dRepeat;
    if(alarmVibrationEl) alarmVibrationEl.checked = dVibration;
}

export function startGlobalAlarm() {
    const sec = parseInt(document.getElementById('manual-timer-sec').value) || 60;
    const soundType = document.getElementById('alarm-sound-select').value || '1';
    const interval = parseInt(document.getElementById('alarm-interval-select').value) || 1000;
    const repeatCount = document.getElementById('alarm-repeat-select')?.value || 'infinite';
    const vibrationEnabled = document.getElementById('alarm-vibration-toggle')?.checked ?? true;

    if(!state.userInfo) state.userInfo = {};
    state.userInfo.defaultAlarmSound = soundType; state.userInfo.alarmInterval = interval;
    state.userInfo.alarmRepeatCount = repeatCount; state.userInfo.vibrationEnabled = vibrationEnabled;
    triggerSave(showToast); loadSystemSettings(); startTimerLogic(sec, soundType);
}

export async function triggerSettingExport() {
    const dataStr = JSON.stringify(buildBackupPayload(), null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const fileName = `TotalPrep_Backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'JSON Backup File', accept: {'application/json': ['.json']} }] });
            const writable = await handle.createWritable(); await writable.write(dataStr); await writable.close();
            showToast("보안 지정 폴더에 저장되었습니다.");
        } else {
            const blob = new Blob([dataStr], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click();
            showToast("다운로드 폴더에 백업 파일이 내보내기 되었습니다.");
        }
    } catch (err) { showToast("백업 내보내기 작업이 취소되었습니다."); }
}
export function triggerSettingImport(e) { importDataJSON(e.target.files[0], () => { showToast("복원 완료."); window.switchCalendarTab('tab-home'); location.reload(); }, () => showToast("오류 발생.")); }
export function triggerClearAllWorkoutData() { if (confirm("데이터를 영구 초기화합니다. 계속할까요?")) { state.workouts = {}; state.templates = []; saveToLocal(); location.reload(); } }
export function exportWorkoutToCSV() {
    let csvContent = "﻿일자,부위,종목명,세트,중량,반복수,완료여부\n";
    Object.entries(state.workouts).forEach(([dateStr, obj]) => { if(obj.exercises) { obj.exercises.forEach(ex => { ex.sets.forEach((s, idx) => { csvContent += `${dateStr},${ex.part},${ex.name},${idx+1},${s.weight},${s.reps},${s.done?'완료':'미완료'}\n`; }); }); } });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", `Workout_Report_2026.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("CSV 다운로드 활성화.");
}
